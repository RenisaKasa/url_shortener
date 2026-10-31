import { MessagesService } from '../../core/i18n/messages';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  readonly year = new Date().getFullYear();
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  logout() {
    this.loading.set(true);
    this.error.set('');
    this.auth.logout().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.error.set(this.text().dashboard.logoutError),
    });
  }
}
