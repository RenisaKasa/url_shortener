import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { LoginRequest, CsrfToken, UserResponse } from '../models/auth.model';
import { switchMap, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly identity = signal<UserResponse | null>(null);
  readonly user = this.identity.asReadonly();

  login(credentials: LoginRequest) {
    // Fetch before each attempt, including after an expired session.
    return this.http.get<CsrfToken>('/api/auth/csrf').pipe(
      switchMap(csrf => this.http.post<UserResponse>('/api/auth/login', credentials, {
        headers: { [csrf.headerName]: csrf.token },
      })),
      // Authentication rotates the session and clears the previous CSRF token.
      switchMap(user => this.http.get<CsrfToken>('/api/auth/csrf').pipe(
        tap(() => this.identity.set(user)),
      )),
    );
  }

  restoreSession() {
    return this.http.get<UserResponse>('/api/auth/me').pipe(tap(user => this.identity.set(user)));
  }

  logout() {
    return this.http.get<CsrfToken>('/api/auth/csrf').pipe(
      switchMap(csrf => this.http.post<void>('/api/auth/logout', {}, {
        headers: { [csrf.headerName]: csrf.token },
      })),
      tap(() => this.identity.set(null)),
    );
  }
}
