import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, finalize, map, of } from 'rxjs';
import { AuthService } from '../services/auth';

@Injectable({ providedIn: 'root' })
export class SessionCheckState {
  readonly failedUrl = signal<string | null>(null);
  readonly checking = signal(false);
}

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = inject(SessionCheckState);
  session.checking.set(true);
  return auth.restoreSession().pipe(
    map(user => {
      session.failedUrl.set(null);
      if (route.data['home']) {
        return router.createUrlTree([user.role === 'ADMIN' ? '/admin' : '/dashboard']);
      }
      if (route.data['role'] === 'ADMIN' && user.role !== 'ADMIN') {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    }),
    catchError(error => {
      if (error.status === 401) {
        session.failedUrl.set(null);
        return of(router.createUrlTree(['/login']));
      }
      session.failedUrl.set(state.url);
      return of(false);
    }),
    finalize(() => session.checking.set(false)),
  );
};

export const guestGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = inject(SessionCheckState);
  session.checking.set(true);
  return auth.restoreSession().pipe(
    map(user => {
      session.failedUrl.set(null);
      return router.createUrlTree([user.role === 'ADMIN' ? '/admin' : '/dashboard']);
    }),
    catchError(error => {
      if (error.status === 401) {
        session.failedUrl.set(null);
        return of(true);
      }
      session.failedUrl.set(state.url);
      return of(false);
    }),
    finalize(() => session.checking.set(false)),
  );
};
