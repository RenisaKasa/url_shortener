import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth';

const account = { id: 1, email: 'user@example.com', role: 'USER', active: true };
const csrf = { token: 'before-login', headerName: 'X-CSRF-TOKEN', parameterName: '_csrf' };

describe('Session authentication', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends CSRF protection, accepts account details and refreshes the rotated token', () => {
    let complete = false;
    auth.login({ email: account.email, password: 'test-password' }).subscribe(() => complete = true);
    http.expectOne('/api/auth/csrf').flush(csrf);
    const login = http.expectOne('/api/auth/login');
    expect(login.request.method).toBe('POST');
    expect(login.request.headers.get('X-CSRF-TOKEN')).toBe('before-login');
    expect(login.request.body).toEqual({ email: account.email, password: 'test-password' });
    login.flush(account);
    expect(complete).toBe(false);
    http.expectOne('/api/auth/csrf').flush({ ...csrf, token: 'after-login' });
    expect(complete).toBe(true);
    expect(auth.user()).toEqual(account);
  });

  it('leaves the account empty on invalid credentials and fetches a new token on retry', () => {
    let status = 0;
    auth.login({ email: account.email, password: 'wrong' }).subscribe({ error: e => status = e.status });
    http.expectOne('/api/auth/csrf').flush(csrf);
    http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(auth.user()).toBeNull();
    auth.login({ email: account.email, password: 'correct' }).subscribe();
    http.expectOne('/api/auth/csrf').flush({ ...csrf, token: 'retry-token' });
    const retry = http.expectOne('/api/auth/login');
    expect(retry.request.headers.get('X-CSRF-TOKEN')).toBe('retry-token');
    retry.flush(account);
    http.expectOne('/api/auth/csrf').flush(csrf);
  });

  it('restores a server session and clears identity after protected logout', () => {
    auth.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(account);
    expect(auth.user()).toEqual(account);
    auth.logout().subscribe();
    http.expectOne('/api/auth/csrf').flush(csrf);
    const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.headers.get('X-CSRF-TOKEN')).toBe(csrf.token);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.user()).toBeNull();
  });

  it('clears stale identity when the server session has expired', () => {
    auth.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(account);
    auth.restoreSession().subscribe({ error: () => {} });
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
  });
});
