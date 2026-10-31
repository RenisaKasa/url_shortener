import { MessagesService } from '../../../core/i18n/messages';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/services/auth';
import { LinkAnimation } from '../../../shared/components/link-animation/link-animation';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LinkAnimation],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  readonly year = new Date().getFullYear();
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  showPassword = signal(false);
  loading = signal(false);
  error = signal('');
  notice = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    if (this.router.currentNavigation()?.extras.state?.['passwordChanged']) {
      this.notice.set(this.text().account.passwordChanged);
    }
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  onSubmit(): void {
    this.error.set('');

    if (this.loading()) {
      return;
    }

    this.form.controls.email.setValue(this.form.controls.email.value.trim());

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.authService
      .login({ email: email.trim(), password })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (user) => {
          this.router.navigate([user.role === 'ADMIN' ? '/admin' : '/dashboard']);
        },
        error: (err) => {
          this.error.set(err.status >= 500
            ? this.text().login.errors.server
            : this.copy.error('login', err.status));
        },
      });
  }
}
