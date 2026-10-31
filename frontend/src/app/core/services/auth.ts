import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, switchMap, tap, throwError } from 'rxjs';

import {
  CsrfToken,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  UserResponse,
} from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly identity = signal<UserResponse | null>(null);

  readonly user = this.identity.asReadonly();

  register(credentials: RegisterRequest) {
    return this.http.get<CsrfToken>(`${this.apiUrl}/csrf`, { withCredentials: true }).pipe(
      switchMap((csrf) =>
        this.http.post<RegisterResponse>(
          `${this.apiUrl}/register`,
          {
            email: credentials.email.trim().toLowerCase(),
            password: credentials.password,
          },
          { headers: { [csrf.headerName]: csrf.token }, withCredentials: true },
        ),
      ),
    );
  }

  login(credentials: LoginRequest) {
    return this.http.get<CsrfToken>(`${this.apiUrl}/csrf`, { withCredentials: true }).pipe(
      switchMap((csrf) =>
        this.http.post<UserResponse>(
          `${this.apiUrl}/login`,
          {
            email: credentials.email.trim().toLowerCase(),
            password: credentials.password,
          },
          { headers: { [csrf.headerName]: csrf.token }, withCredentials: true },
        ),
      ),
      // Successful login rotates the session and clears its CSRF token.
      switchMap((user) =>
        this.http.get<CsrfToken>(`${this.apiUrl}/csrf`, { withCredentials: true }).pipe(
          tap(() => this.identity.set(user)),
          map(() => user),
        ),
      ),
    );
  }

  restoreSession() {
    return this.http.get<UserResponse>(`${this.apiUrl}/me`, { withCredentials: true }).pipe(
      tap((user) => this.identity.set(user)),
      catchError((error) => {
        if (error.status === 401) this.identity.set(null);
        return throwError(() => error);
      }),
    );
  }

  logout() {
    return this.http.get<CsrfToken>(`${this.apiUrl}/csrf`, { withCredentials: true }).pipe(
      switchMap((csrf) =>
        this.http.post<void>(
          `${this.apiUrl}/logout`,
          {},
          { headers: { [csrf.headerName]: csrf.token }, withCredentials: true },
        ),
      ),
      tap(() => this.identity.set(null)),
    );
  }
}
