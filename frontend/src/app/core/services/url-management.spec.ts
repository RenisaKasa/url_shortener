import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminApi } from './admin-api';
import { DashboardApi } from './dashboard-api';

describe('URL management API integration', () => {
  let dashboard: DashboardApi;
  let admin: AdminApi;
  let http: HttpTestingController;
  const base = environment.apiUrl;
  const csrf = {
    token: 'test-csrf-token', headerName: 'X-CSRF-TOKEN', parameterName: '_csrf',
  };
  const url = {
    id: 7, originalUrl: 'https://example.com', shortCode: 'example', userId: 1,
    active: true, expiresAt: null, clickCount: 12, lastAccessedAt: '2026-11-01T10:00:00Z',
  };
  const emptyPage = {
    content: [], totalElements: 0, totalPages: 0, number: 0, size: 20,
    first: true, last: true, empty: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    dashboard = TestBed.inject(DashboardApi);
    admin = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function respondWithCsrf(token = csrf.token): void {
    const request = http.expectOne(`${base}/auth/csrf`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ ...csrf, token });
  }

  it('loads dashboard statistics using the session cookie', () => {
    const statistics = { totalUrls: 5, activeUrls: 3, expiredUrls: 1, totalClicks: 42 };
    let result: unknown;
    dashboard.statistics().subscribe(value => result = value);
    const request = http.expectOne(`${base}/dashboard/statistics`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(statistics);
    expect(result).toEqual(statistics);
  });

  it('sends URL pagination, sorting, search and status filters', () => {
    dashboard.list({
      page: 2, size: 10, sort: 'clickCount,desc', search: '  example  ', status: 'ACTIVE',
    }).subscribe();
    const request = http.expectOne(req => req.url === `${base}/urls`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('sort')).toBe('clickCount,desc');
    expect(request.request.params.get('search')).toBe('example');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    request.flush({ ...emptyPage, number: 2, size: 10, first: false });
  });

  it('omits empty optional URL filters', () => {
    dashboard.list({ page: 0, size: 20, sort: 'createdAt,desc', search: '   ', status: '' })
      .subscribe();
    const request = http.expectOne(req => req.url === `${base}/urls`);
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    request.flush(emptyPage);
  });

  it('retrieves one URL and its usage statistics', () => {
    let result: unknown;
    dashboard.details(7).subscribe(value => result = value);
    const request = http.expectOne(`${base}/urls/7`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(url);
    expect(result).toEqual(url);
  });

  it('obtains CSRF before creating a URL and preserves the payload', () => {
    const body = {
      originalUrl: 'https://example.com', customAlias: 'my-example',
      expiresAt: '2030-12-01T12:00:00Z',
    };
    const response = {
      id: 7, originalUrl: body.originalUrl, shortCode: body.customAlias,
      shortUrl: 'http://localhost:8081/r/my-example', expiresAt: body.expiresAt,
    };
    let result: unknown;
    dashboard.create(body).subscribe(value => result = value);
    http.expectNone(`${base}/urls`);
    respondWithCsrf();
    const request = http.expectOne(`${base}/urls`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get(csrf.headerName)).toBe(csrf.token);
    expect(request.request.body).toEqual(body);
    request.flush(response, { status: 201, statusText: 'Created' });
    expect(result).toEqual(response);
  });

  it('uses fresh CSRF tokens for updating and deleting a URL', () => {
    const body = { active: true, expiresAt: '2030-12-01T12:00:00Z' };
    dashboard.update(7, body).subscribe();
    respondWithCsrf('update-token');
    const update = http.expectOne(`${base}/urls/7`);
    expect(update.request.method).toBe('PATCH');
    expect(update.request.withCredentials).toBe(true);
    expect(update.request.headers.get(csrf.headerName)).toBe('update-token');
    expect(update.request.body).toEqual(body);
    update.flush({ ...url, ...body });

    let deleted = false;
    dashboard.delete(7).subscribe(() => deleted = true);
    respondWithCsrf('delete-token');
    const deletion = http.expectOne(`${base}/urls/7`);
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.withCredentials).toBe(true);
    expect(deletion.request.headers.get(csrf.headerName)).toBe('delete-token');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(deleted).toBe(true);
  });

  it('passes duplicate-alias errors to the caller', () => {
    let status: number | undefined;
    let message: string | undefined;
    dashboard.create({ originalUrl: 'https://example.com', customAlias: 'already-used' })
      .subscribe({ error: error => { status = error.status; message = error.error.message; } });
    respondWithCsrf();
    http.expectOne(`${base}/urls`).flush(
      { status: 409, message: 'Alias already exists', fieldErrors: {} },
      { status: 409, statusText: 'Conflict' },
    );
    expect(status).toBe(409);
    expect(message).toBe('Alias already exists');
  });

  it('does not write when fetching CSRF fails', () => {
    let status: number | undefined;
    dashboard.delete(7).subscribe({ error: error => status = error.status });
    http.expectOne(`${base}/auth/csrf`).flush(
      {}, { status: 503, statusText: 'Service Unavailable' },
    );
    http.expectNone(`${base}/urls/7`);
    expect(status).toBe(503);
  });

  it('sends admin user filters, including active=false', () => {
    admin.users({
      page: 1, size: 10, sort: 'email,asc', search: '  owner  ', active: 'false', role: 'USER',
    }).subscribe();
    const request = http.expectOne(req => req.url === `${base}/admin/users`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('sort')).toBe('email,asc');
    expect(request.request.params.get('search')).toBe('owner');
    expect(request.request.params.get('active')).toBe('false');
    expect(request.request.params.get('role')).toBe('USER');
    request.flush({ ...emptyPage, number: 1, size: 10, first: false });
  });

  it('filters admin URLs by owner and expiration status', () => {
    admin.urls({
      page: 0, size: 20, sort: 'expiresAt,asc', search: 'example', status: 'EXPIRED', userId: 7,
    }).subscribe();
    const request = http.expectOne(req => req.url === `${base}/admin/urls`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sort')).toBe('expiresAt,asc');
    expect(request.request.params.get('search')).toBe('example');
    expect(request.request.params.get('status')).toBe('EXPIRED');
    expect(request.request.params.get('userId')).toBe('7');
    request.flush(emptyPage);
  });

  it('protects admin account status changes with CSRF', () => {
    admin.setActive(7, false).subscribe();
    http.expectNone(`${base}/admin/users/7/status`);
    respondWithCsrf();
    const request = http.expectOne(`${base}/admin/users/7/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get(csrf.headerName)).toBe(csrf.token);
    expect(request.request.body).toEqual({ active: false });
    request.flush({ id: 7, email: 'owner@example.com', role: 'USER', active: false });
  });
});
