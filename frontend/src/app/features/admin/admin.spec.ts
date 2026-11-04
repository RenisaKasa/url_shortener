import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { Admin } from './admin';
import { AdminApi } from '../../core/services/admin-api';
import { AuthService } from '../../core/services/auth';
import { UserResponse } from '../../core/models/auth.model';
import { PageResponse } from '../../core/models/dashboard.model';
import { click, delay, input, link, page, render, user } from '../../../testing/helpers';

describe('Administrator workspace', () => {
  let fixture: ComponentFixture<Admin>;
  let component: Admin;
  const admin = { ...user, role: 'ADMIN' as const };
  const other = { ...user, id: 2, email: 'other@example.com' };
  let api: { users: ReturnType<typeof vi.fn>; urls: ReturnType<typeof vi.fn>; setActive: ReturnType<typeof vi.fn> };
  let auth: { user: ReturnType<typeof signal<UserResponse | null>>; clearIdentity: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { users: vi.fn(() => of(page([admin, other]))), urls: vi.fn(() => of(page([link]))), setActive: vi.fn(() => of({ ...other, active: false })) };
    auth = { user: signal<UserResponse | null>(admin), clearIdentity: vi.fn(), logout: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({ imports: [Admin], providers: [provideHttpClient(), provideRouter([]), { provide: AdminApi, useValue: api }, { provide: AuthService, useValue: auth }] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Admin); component = fixture.componentInstance;
    await render(fixture);
  });
  it('renders users, protects the administrator account, and retains a removable owner filter', async () => {
    expect(fixture.nativeElement.textContent).toContain('Your account');
    component.requestStatusChange(admin);
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    click(fixture, 'tbody tr:last-child .row-actions button');
    await render(fixture);
    expect(api.urls).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 2, search: '', page: 0 }));
    expect(fixture.nativeElement.querySelector('.chip-email').textContent).toBe(other.email);
    click(fixture, '.admin-tabs button:first-child');
    click(fixture, '.admin-tabs button:last-child');
    await render(fixture);
    expect(component.selectedUser()?.id).toBe(2);
    click(fixture, '.user-filter-chip button');
    await render(fixture);
    expect(component.urlsQuery().userId).toBeNull();
    expect(fixture.nativeElement.querySelector('.chip-email')).toBeNull();
  });
  it('confirms account deactivation, prevents double submission, and refreshes users', async () => {
    const result = new Subject<UserResponse>(); api.setActive.mockReturnValue(result);
    click(fixture, 'tbody tr:last-child .row-actions button:last-child');
    await render(fixture);
    click(fixture, 'dialog .danger');
    component.confirmStatusChange();
    component.closeStatusDialog(new Event('cancel', { cancelable: true }));
    expect(api.setActive).toHaveBeenCalledTimes(1);
    expect(api.setActive).toHaveBeenCalledWith(2, false);
    result.next({ ...other, active: false }); result.complete();
    await render(fixture);
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    expect(component.success()).toContain(other.email);
    expect(api.users).toHaveBeenCalledTimes(2);
    component.requestStatusChange({ ...other, active: false });
    component.closeStatusDialog();
    expect(component.target()).toBeNull();
  });
  it.each([400, 404, 500])('handles account update errors (%s) without claiming success', async status => {
    api.setActive.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    component.requestStatusChange(other); component.confirmStatusChange();
    await render(fixture);
    expect(component.success()).toBe('');
    expect(component.actionError()).not.toBe('');
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(status !== 404);
  });
  it('requests filtered and paginated accounts and URLs from controls', async () => {
    input(fixture, '#user-search', ' other '); await delay();
    component.setUserStatus('false'); component.setRole('USER'); component.setUserSort('email,asc'); component.setPageSize('20');
    await render(fixture);
    expect(api.users).toHaveBeenLastCalledWith(expect.objectContaining({ active: 'false', role: 'USER', sort: 'email,asc', size: 20, search: 'other' }));
    component.users.set(page([other], { totalPages: 2, last: false })); component.changePage(1); await render(fixture);
    expect(api.users).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    component.tab.set('urls'); await render(fixture);
    input(fixture, '#url-search', ' example '); await delay();
    component.setUrlStatus('EXPIRED'); component.setUrlSort('clickCount,desc'); component.setPageSize('50'); await render(fixture);
    expect(api.urls).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'EXPIRED', sort: 'clickCount,desc', size: 50, search: 'example' }));
    component.urls.set(page([link], { totalPages: 2, last: false })); component.changePage(1); await render(fixture);
    expect(api.urls).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    component.changePage(-2); expect(component.urlsQuery().page).toBe(1);
  });
  it('renders loading, empty and independent error states and recovers on refresh', async () => {
    const pending = new Subject<PageResponse<UserResponse>>(); api.users.mockReturnValue(pending);
    component.users.set(null); component.refresh(); await render(fixture);
    expect(fixture.nativeElement.textContent).toContain(component.m.loadingUsers);
    pending.next(page([])); pending.complete(); await render(fixture);
    expect(fixture.nativeElement.textContent).toContain(component.m.noUsers);
    api.users.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    api.urls.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    component.refresh(); await render(fixture); expect(component.usersError()).not.toBe('');
    component.tab.set('urls'); await render(fixture); expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    api.users.mockReturnValue(of(page([admin]))); api.urls.mockReturnValue(of(page([]))); component.refresh(); await render(fixture);
    expect(fixture.nativeElement.textContent).toContain(component.m.noLinks);
  });
  it('backs up when a paginated result becomes empty', async () => {
    api.users.mockReturnValueOnce(of(page([], { number: 1, totalPages: 1 }))).mockReturnValue(of(page([admin])));
    component.usersQuery.update(q => ({ ...q, page: 1 })); await render(fixture);
    expect(component.usersQuery().page).toBe(0);
    api.urls.mockReturnValueOnce(of(page([], { number: 1, totalPages: 1 }))).mockReturnValue(of(page([link])));
    component.urlsQuery.update(q => ({ ...q, page: 1 })); await render(fixture);
    expect(component.urlsQuery().page).toBe(0);
  });
  it('copies links, reports clipboard failure, and displays all link statuses', async () => {
    await component.copyLink(link); expect(navigator.clipboard.writeText).toHaveBeenCalledWith(component.shortUrl(link));
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Denied'));
    await component.copyLink(link); expect(component.actionError()).toBe(component.m.copyError);
    expect(component.status({ ...link, expiresAt: '2000-01-01' })).toBe('EXPIRED');
    expect(component.status({ ...link, active: false, expiresAt: null })).toBe('INACTIVE');
    component.tab.set('urls'); api.urls.mockReturnValue(of(page([{ ...link, active: false, expiresAt: null, lastAccessedAt: null }])));
    component.refresh(); await render(fixture); expect(fixture.nativeElement.textContent).toContain(component.m.never);
  });
  it.each([204, 500, 401])('handles logout/session results (%s)', async status => {
    auth.logout.mockReturnValue(status === 204 ? of(undefined) : throwError(() => new HttpErrorResponse({ status })));
    component.logout(); await render(fixture);
    if (status === 500) expect(component.actionError()).not.toBe('');
    else expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    if (status === 401) { expect(auth.clearIdentity).toHaveBeenCalled(); expect(component.users()).toBeNull(); component.refresh(); }
  });
});
