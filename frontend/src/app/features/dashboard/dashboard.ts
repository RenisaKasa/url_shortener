import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  logout() {
    this.loading.set(true);
    this.error.set('');
    this.auth.logout().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.error.set('Unable to log out. Please try again.'),
    });
  }
}
