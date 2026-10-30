import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/services/auth';
import { LinkAnimation } from '../../../shared/components/link-animation/link-animation';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, LinkAnimation],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  showPassword = signal(false);
  loading = signal(false);
  error = signal('');
  notice = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  onSubmit(): void {
    this.error.set('');

    if (this.loading()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.authService
      .login({ email: email.trim(), password })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.error.set(
            err.status === 401
              ? 'Invalid email or password.'
              : err.status === 0 || err.status >= 500
                ? 'We couldn’t reach the server. Please try again in a moment.'
                : err.status === 403
                  ? 'Your session could not be verified. Please try signing in again.'
                  : 'Unable to sign in. Check your details and try again.',
          );
        },
      });
  }
}
