import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot, CanActivateFn, GuardResult, provideRouter,
  Router, RouterStateSnapshot, UrlTree,
} from '@angular/router';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { UserResponse } from '../models/auth.model';
import { AuthService } from '../services/auth';
import { authGuard, guestGuard } from './auth-guard';

describe('Authentication and role guards', () => {
  const user: UserResponse = {
    id: 1, email: 'user@example.com', role: 'USER', active: true,
  };
  const admin: UserResponse = { ...user, role: 'ADMIN' };
  let router: Router;
  const restoreSession = vi.fn();

  beforeEach(() => {
    restoreSession.mockReset();
    restoreSession.mockReturnValue(of(user));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { restoreSession } },
      ],
    });
    router = TestBed.inject(Router);
  });

  async function runGuard(
    guard: CanActivateFn, data: Record<string, unknown> = {},
  ): Promise<GuardResult> {
    const route = new ActivatedRouteSnapshot();
    route.data = data;
    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = TestBed.runInInjectionContext(() => guard(route, state));
    return isObservable(result) ? firstValueFrom(result) : await result;
  }

  function expectRedirect(result: GuardResult, path: string): void {
    expect(result instanceof UrlTree).toBe(true);
    if (result instanceof UrlTree) {
      expect(router.serializeUrl(result)).toBe(path);
    }
  }

  it('allows an authenticated user onto a protected page', async () => {
    expect(await runGuard(authGuard)).toBe(true);
    expect(restoreSession).toHaveBeenCalledOnce();
  });

  it('redirects an expired session to login', async () => {
    restoreSession.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    expectRedirect(await runGuard(authGuard), '/login');
  });

  it('prevents a normal user from entering an admin page', async () => {
    expectRedirect(await runGuard(authGuard, { role: 'ADMIN' }), '/dashboard');
  });

  it('allows an administrator onto an admin page', async () => {
    restoreSession.mockReturnValue(of(admin));
    expect(await runGuard(authGuard, { role: 'ADMIN' })).toBe(true);
  });

  it('routes users from home to their personal dashboard', async () => {
    expectRedirect(await runGuard(authGuard, { home: true }), '/dashboard');
  });

  it('routes administrators from home to the admin dashboard', async () => {
    restoreSession.mockReturnValue(of(admin));
    expectRedirect(await runGuard(authGuard, { home: true }), '/admin');
  });

  it('allows anonymous visitors onto login and registration pages', async () => {
    restoreSession.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );
    expect(await runGuard(guestGuard)).toBe(true);
  });

  it('redirects logged-in users away from guest pages', async () => {
    expectRedirect(await runGuard(guestGuard), '/dashboard');
  });

  it('redirects logged-in administrators away from guest pages', async () => {
    restoreSession.mockReturnValue(of(admin));
    expectRedirect(await runGuard(guestGuard), '/admin');
  });
});
