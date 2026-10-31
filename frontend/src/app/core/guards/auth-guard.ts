import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(
    map(user => {
      if (route.data['home']) {
        return router.createUrlTree([user.role === 'ADMIN' ? '/admin' : '/dashboard']);
      }
      if (route.data['role'] === 'ADMIN' && user.role !== 'ADMIN') {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    }),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(
    map(user => router.createUrlTree([user.role === 'ADMIN' ? '/admin' : '/dashboard'])),
    catchError(() => of(true)),
  );
};
