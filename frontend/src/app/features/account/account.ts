import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth';
import { MessagesService } from '../../core/i18n/messages';

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmation';
const byteLimit: ValidatorFn = control =>
  new TextEncoder().encode(control.value ?? '').length > 72 ? { byteLimit: true } : null;
const matchingPasswords: ValidatorFn = group => {
  const current = group.get('currentPassword')?.value;
  const next = group.get('newPassword')?.value;
  const confirmation = group.get('confirmation')?.value;
  const errors = {
    ...(next && next === current ? { unchanged: true } : {}),
    ...(next !== confirmation ? { mismatch: true } : {}),
  };
  return Object.keys(errors).length ? errors : null;
};

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  readonly auth = inject(AuthService);
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly loggingOut = signal(false);
  readonly passwordEditing = signal(false);
  readonly error = signal('');
  @ViewChild('passwordForm')
  set passwordForm(form: ElementRef<HTMLFormElement> | undefined) {
    form?.nativeElement.querySelector('input')?.focus();
  }
  @ViewChild('editPasswordButton') private editPasswordButton?: ElementRef<HTMLButtonElement>;
  readonly visible = signal<Record<PasswordField, boolean>>({
    currentPassword: false, newPassword: false, confirmation: false,
  });
  readonly form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(72), byteLimit]],
    newPassword: ['', [Validators.required, Validators.pattern(/\S/), Validators.minLength(8), Validators.maxLength(72), byteLimit]],
    confirmation: ['', Validators.required],
  }, { validators: matchingPasswords });

  get m() { return this.text().account; }
  get workspacePath() { return this.auth.user()?.role === 'ADMIN' ? '/admin' : '/dashboard'; }
  get fields() {
    return [
      { name: 'currentPassword' as const, label: this.m.currentPassword, autocomplete: 'current-password' },
      { name: 'newPassword' as const, label: this.m.newPassword, autocomplete: 'new-password' },
      { name: 'confirmation' as const, label: this.m.confirmPassword, autocomplete: 'new-password' },
    ];
  }

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(''));
  }
  openPasswordEditor(): void {
    if (this.loading()) return;
    this.form.reset();
    this.error.set('');
    this.passwordEditing.set(true);
  }
  cancelPasswordEditor(): void {
    if (this.loading()) return;
    this.form.reset();
    this.visible.set({ currentPassword: false, newPassword: false, confirmation: false });
    this.error.set('');
    this.passwordEditing.set(false);
    this.editPasswordButton?.nativeElement.focus();
  }
  logout(): void {
    if (this.loading() || this.loggingOut()) return;
    this.loggingOut.set(true);
    this.auth.logout().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loggingOut.set(false)),
    ).subscribe({
      next: () => this.router.navigate(['/login']),
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.auth.clearIdentity();
          void this.router.navigate(['/login']);
        } else this.error.set(this.text().dashboard.logoutError);
      },
    });
  }
  toggle(name: PasswordField): void {
    this.visible.update(values => ({ ...values, [name]: !values[name] }));
  }
  fieldError(name: PasswordField): string {
    const control = this.form.controls[name];
    if (!control.touched) return '';
    if (control.hasError('server')) return control.getError('server');
    if (control.hasError('required') || control.hasError('pattern')) return this.m.validation.required;
    if (control.hasError('byteLimit') || control.hasError('maxlength')) return this.m.validation.byteLimit;
    if (control.hasError('minlength')) return this.m.validation.minimum;
    if (name === 'newPassword' && this.form.hasError('unchanged')) return this.m.validation.different;
    if (name === 'confirmation' && this.form.hasError('mismatch')) return this.m.validation.mismatch;
    return '';
  }
  changePassword(): void {
    if (this.loading()) return;
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.loading.set(true);
    // Passwords are deliberately sent exactly as entered, without trimming.
    this.auth.changePassword({ currentPassword, newPassword }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)),
    ).subscribe({
      next: () => {
        this.form.reset();
        this.visible.set({ currentPassword: false, newPassword: false, confirmation: false });
        void this.router.navigate(['/login'], { state: { passwordChanged: true } });
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.auth.clearIdentity();
          this.form.reset();
          void this.router.navigate(['/login']);
          return;
        }
        let fields = false;
        if (error.status === 400) {
          for (const name of ['currentPassword', 'newPassword'] as const) {
            const message = error.error?.fieldErrors?.[name];
            if (typeof message === 'string' && message) {
              this.form.controls[name].setErrors({ server: message });
              this.form.controls[name].markAsTouched();
              fields = true;
            }
          }
          const known: Record<string, { field: 'currentPassword' | 'newPassword'; message: string }> = {
            'Current password is incorrect': { field: 'currentPassword', message: this.m.validation.currentIncorrect },
            'New password must differ from the current password': { field: 'newPassword', message: this.m.validation.different },
            'New password must not exceed 72 UTF-8 bytes': { field: 'newPassword', message: this.m.validation.byteLimit },
          };
          const detail = known[error.error?.message];
          if (detail) {
            this.form.controls[detail.field].setErrors({ server: detail.message });
            this.form.controls[detail.field].markAsTouched();
            fields = true;
          }
        }
        const messages: Record<string, string> = this.m.errors;
        this.error.set(fields ? this.m.validation.correctFields : messages[String(error.status)] ?? messages['default']);
      },
    });
  }
}
