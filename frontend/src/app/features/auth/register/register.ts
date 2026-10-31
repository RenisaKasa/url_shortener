import { MessagesService } from '../../../core/i18n/messages';
import { Component, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/services/auth';
import { LinkAnimation } from '../../../shared/components/link-animation/link-animation';

const passwordByteLimit: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  new TextEncoder().encode(control.value ?? '').length > 72 ? { byteLimit: true } : null;

const matchingPasswords: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  control.get('password')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LinkAnimation],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  readonly year = new Date().getFullYear();
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('successTitle')
  set successTitle(title: ElementRef<HTMLHeadingElement> | undefined) {
    title?.nativeElement.focus();
  }

  readonly showPassword = signal(false);
  readonly showConfirmation = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly registered = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.minLength(8), passwordByteLimit],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(''));
  }

  get confirmationInvalid(): boolean {
    const confirmation = this.form.controls.confirmPassword;

    return confirmation.touched && (confirmation.invalid || this.form.hasError('passwordMismatch'));
  }

  get emailError(): string {
    const email = this.form.controls.email;
    return email.touched && email.invalid
      ? email.getError('server') ?? this.text().validation.email
      : '';
  }

  get passwordError(): string {
    const password = this.form.controls.password;
    if (!password.touched || password.valid) return '';
    if (password.hasError('server')) return password.getError('server');
    if (password.hasError('required') || password.hasError('pattern')) {
      return this.text().validation.passwordNonBlank;
    }
    return password.hasError('byteLimit')
      ? this.text().validation.passwordTooLong
      : this.text().validation.passwordTooShort;
  }

  onSubmit(): void {
    if (this.loading() || this.registered()) {
      return;
    }

    this.error.set('');

    this.form.controls.email.setValue(this.form.controls.email.value.trim());

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    this.auth
      .register({
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: () => {
          this.form.reset();
          this.showPassword.set(false);
          this.showConfirmation.set(false);
          this.registered.set(true);
        },
        error: (err) => {
          let hasFieldErrors = false;
          if (err.status === 400) {
            for (const name of ['email', 'password'] as const) {
              const message = err.error?.fieldErrors?.[name];
              if (typeof message === 'string' && message) {
                const field = this.form.controls[name];
                field.setErrors({ ...field.errors, server: message });
                field.markAsTouched();
                hasFieldErrors = true;
              }
            }
          }

          this.error.set(
            hasFieldErrors
              ? this.text().validation.correctFields
              : this.copy.error('register', err.status),
          );
        },
      });
  }
}
