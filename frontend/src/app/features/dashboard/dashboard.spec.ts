import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import QRCode from 'qrcode';
import { Dashboard } from './dashboard';
import { DashboardApi } from '../../core/services/dashboard-api';
import { AuthService } from '../../core/services/auth';
import { UserResponse } from '../../core/models/auth.model';
import { click, delay, input, link, page, render, submit, user } from '../../../testing/helpers';

describe('User dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let component: Dashboard;
  let api: Record<'statistics' | 'list' | 'details' | 'create' | 'update' | 'delete' | 'duplicates' | 'bulkSetActive' | 'bulkDelete', ReturnType<typeof vi.fn>>;
  let auth: { user: ReturnType<typeof signal<UserResponse | null>>; logout: ReturnType<typeof vi.fn>; clearIdentity: ReturnType<typeof vi.fn> };
  const created = { ...link, shortUrl: 'http://localhost:3000/r/example' };
  const stats = { totalUrls: 1, activeUrls: 1, expiredUrls: 0, totalClicks: 12 };
  const fail = (status: number, error = {}) => throwError(() => new HttpErrorResponse({ status, error }));
  beforeEach(async () => {
    api = {
      statistics: vi.fn(() => of(stats)), list: vi.fn(() => of(page([link]))), details: vi.fn(() => of(link)),
      create: vi.fn(() => of(created)), update: vi.fn(() => of(link)), delete: vi.fn(() => of(undefined)),
      duplicates: vi.fn(() => of(page([]))), bulkSetActive: vi.fn(() => of(undefined)), bulkDelete: vi.fn(() => of(undefined)),
    };
    auth = { user: signal<UserResponse | null>(user), logout: vi.fn(() => of(undefined)), clearIdentity: vi.fn() };
    TestBed.configureTestingModule({ imports: [Dashboard], providers: [provideRouter([]), provideHttpClient(), { provide: DashboardApi, useValue: api }, { provide: AuthService, useValue: auth }] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Dashboard); component = fixture.componentInstance;
    await render(fixture);
  });
  it('loads independent statistics and top links and renders the actual links table', () => {
    expect(fixture.nativeElement.querySelectorAll('.stat').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.top-links a').textContent).toContain(link.shortCode);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain(link.originalUrl);
    expect(api.list).toHaveBeenCalledWith({ page: 0, size: 3, sort: 'clickCount,desc', search: '', status: '' });
    expect(fixture.nativeElement.querySelector('[aria-label="Select all links on this page"]')).not.toBeNull();
  });
  it('validates and submits the rendered create form with presets and normalized inputs', async () => {
    submit(fixture, '.create-panel form'); await render(fixture);
    expect(fixture.nativeElement.querySelector('#original-url-error').textContent).toContain('HTTP');
    input(fixture, '#original-url', 'javascript:alert(1)');
    submit(fixture, '.create-panel form'); expect(api.create).not.toHaveBeenCalled();
    input(fixture, '#original-url', ' https://example.com/article ');
    input(fixture, '#custom-alias', 'my-link');
    click(fixture, '.create-panel .expiration-presets button:nth-child(2)');
    await render(fixture);
    const date = new Date(component.createForm.controls.expiresAt.value).toISOString();
    expect(component.createPreset()).toBe(7);
    submit(fixture, '.create-panel form'); await render(fixture);
    expect(api.create).toHaveBeenCalledWith({ originalUrl: link.originalUrl, customAlias: 'my-link', expiresAt: date });
    expect(fixture.nativeElement.querySelector('.created-link').textContent).toContain(created.shortUrl);
    expect(component.createForm.controls.originalUrl.value).toBe('');
    expect(component.createPreset()).toBeNull();
  });
  it('omits optional fields and prevents duplicate creation while pending', async () => {
    const pending = new Subject<typeof created>(); api.create.mockReturnValue(pending);
    input(fixture, '#original-url', link.originalUrl); submit(fixture, '.create-panel form');
    component.createLink(); fixture.detectChanges();
    expect(api.create).toHaveBeenCalledOnce(); expect(api.create).toHaveBeenCalledWith({ originalUrl: link.originalUrl });
    expect(fixture.nativeElement.querySelector('.create-panel [type="submit"]').disabled).toBe(true);
    pending.next(created); pending.complete(); await render(fixture);
  });
  it.each([400, 409, 500])('renders creation errors and allows corrections (%s)', async status => {
    api.create.mockReturnValue(fail(status, { fieldErrors: { originalUrl: 'Destination rejected', customAlias: 'Alias rejected', expiresAt: 'Date rejected' } }));
    input(fixture, '#original-url', link.originalUrl); submit(fixture, '.create-panel form'); await render(fixture);
    expect(fixture.nativeElement.querySelector('.create-panel [role="alert"]')).not.toBeNull();
    expect(component.created()).toBeNull();
    if (status === 400) expect(fixture.nativeElement.querySelector('#original-url-error').textContent).toBe('Destination rejected');
  });
  it('checks duplicates with debounce, paginates, and still permits creation', async () => {
    api.duplicates.mockImplementation((_url: string, number: number) => of(page([link], { number, totalPages: 2, totalElements: 4, first: number === 0, last: number === 1 })));
    input(fixture, '#original-url', 'invalid'); await render(fixture); expect(api.duplicates).not.toHaveBeenCalled();
    input(fixture, '#original-url', link.originalUrl); await render(fixture); await delay(); await render(fixture);
    expect(api.duplicates).toHaveBeenCalledWith(link.originalUrl, 0);
    expect(fixture.nativeElement.querySelector('.duplicate-notice').textContent).toContain('4');
    click(fixture, '.duplicate-notice .page-controls button:last-child'); await render(fixture); await delay(); await render(fixture);
    expect(api.duplicates).toHaveBeenLastCalledWith(link.originalUrl, 1);
    click(fixture, '.duplicate-notice .text-button'); await render(fixture);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(component.shortUrl(link));
    component.changeDuplicatePage(1); expect(api.duplicates).toHaveBeenCalledTimes(2);
    submit(fixture, '.create-panel form'); await render(fixture); expect(api.create).toHaveBeenCalledOnce();
  });
  it('does not show stale duplicate results and allows creation when the check fails', async () => {
    const old = new Subject<ReturnType<typeof page>>(); api.duplicates.mockReturnValue(old);
    input(fixture, '#original-url', 'https://old.example.com'); fixture.detectChanges(); await delay();
    api.duplicates.mockReturnValue(fail(500)); input(fixture, '#original-url', link.originalUrl); await render(fixture); await delay(); await render(fixture);
    old.next(page([link])); old.complete(); await render(fixture);
    expect(component.duplicates()).toBeNull(); expect(component.duplicatesError()).toContain('still create');
    submit(fixture, '.create-panel form'); await render(fixture); expect(api.create).toHaveBeenCalledOnce();
  });
  it('loads fresh edit details, cancels, and submits only changed status', async () => {
    click(fixture, 'tbody .row-actions button:nth-child(3)'); await render(fixture);
    expect(api.details).toHaveBeenCalledWith(link.id);
    expect(fixture.nativeElement.querySelector('#edit-title').closest('dialog').open).toBe(true);
    component.closeEditor(); expect(component.editing()).toBeNull();
    component.openEditor(link); await render(fixture);
    click(fixture, '#edit-active'); submit(fixture, '#edit-title + p + form'); await render(fixture);
    expect(api.update).toHaveBeenCalledWith(link.id, { active: false });
    expect(component.editing()).toBeNull(); expect(component.success()).toContain('updated');
  });
  it('requires future expiration to renew expired links and applies the edit preset', async () => {
    const expired = { ...link, expiresAt: '2000-01-01T12:00:00Z', active: false }; api.details.mockReturnValue(of(expired));
    component.openEditor(expired); await render(fixture); click(fixture, '#edit-active'); component.saveEdit(); await render(fixture);
    expect(api.update).not.toHaveBeenCalled(); expect(component.fieldError(component.editForm.controls.expiresAt, 'date')).toContain('future');
    click(fixture, '#edit-title + p + form .expiration-presets button:last-child');
    const date = new Date(component.editForm.controls.expiresAt.value).toISOString();
    component.saveEdit(); await render(fixture);
    expect(api.update).toHaveBeenCalledWith(link.id, { active: true, expiresAt: date });
  });
  it.each([400, 404, 500])('shows edit failures and handles links removed on the server (%s)', async status => {
    component.openEditor(link); await render(fixture);
    component.editForm.controls.expiresAt.setValue('2036-01-01T12:00');
    api.update.mockReturnValue(fail(status, { fieldErrors: { expiresAt: 'Expiration rejected' } }));
    component.saveEdit(); await render(fixture);
    expect(component.actionError()).not.toBe('');
    if (status === 404) expect(component.editing()).toBeNull();
    else expect(component.editForm.controls.expiresAt.hasError('server')).toBe(true);
  });
  it('shows failed detail loading without opening an editor', async () => {
    api.details.mockReturnValue(fail(404)); component.openEditor(link); await render(fixture);
    expect(component.editing()).toBeNull(); expect(component.actionError()).not.toBe('');
  });
  it('confirms deletion, preserves cancellation, and handles server errors', async () => {
    click(fixture, 'tbody .danger-text'); await render(fixture);
    component.closeDelete(); expect(api.delete).not.toHaveBeenCalled();
    component.requestDelete(link); component.deleteLink(); await render(fixture);
    expect(api.delete).toHaveBeenCalledWith(link.id); expect(component.deleting()).toBeNull();
    api.delete.mockReturnValue(fail(500)); component.requestDelete(link); component.deleteLink(); await render(fixture);
    expect(component.deleting()).not.toBeNull(); expect(component.actionError()).not.toBe('');
    api.delete.mockReturnValue(fail(404)); component.deleteLink(); await render(fixture); expect(component.deleting()).toBeNull();
  });
  it('selects only current-page rows, confirms bulk status, and clears selection after refresh', async () => {
    component.results.set(page([link, { ...link, id: 2, shortCode: 'second' }])); await render(fixture);
    click(fixture, '[aria-label="Select link example"]'); await render(fixture);
    expect(fixture.nativeElement.querySelector('thead input').indeterminate).toBe(true);
    component.requestBulk('deactivate'); await render(fixture); click(fixture, '#bulk-title ~ .dialog-actions button:last-child'); await render(fixture);
    expect(api.bulkSetActive).toHaveBeenCalledWith([1], false); expect(component.selectedIds().size).toBe(0);
    component.togglePageSelection(true); component.requestBulk('activate'); component.closeBulk();
    expect(api.bulkSetActive).toHaveBeenCalledOnce();
    component.togglePageSelection(false); expect(component.selectedIds().size).toBe(0);
  });
  it('prevents bulk activation of expired links but permits their deletion', async () => {
    component.results.set(page([{ ...link, expiresAt: '2000-01-01' }])); await render(fixture);
    component.togglePageSelection(true); await render(fixture);
    expect(fixture.nativeElement.querySelector('.bulk-toolbar button').disabled).toBe(true);
    component.requestBulk('activate'); expect(component.bulkAction()).toBeNull();
    component.requestBulk('delete'); component.confirmBulk(); await render(fixture);
    expect(api.bulkDelete).toHaveBeenCalledWith([1]); expect(component.success()).toContain('deleted');
  });
  it.each([400, 404, 500])('keeps bulk failures atomic and refreshes stale selections (%s)', async status => {
    api.bulkDelete.mockReturnValue(fail(status)); component.togglePageSelection(true); component.requestBulk('delete'); component.confirmBulk(); await render(fixture);
    expect(component.success()).toBe('');
    if (status === 500) { expect(component.bulkError()).not.toBe(''); expect(component.selectedIds().size).toBe(1); }
    else { expect(component.actionError()).not.toBe(''); expect(component.selectedIds().size).toBe(0); }
  });
  it('sends server-side table filters and pagination independently from top links', async () => {
    input(fixture, '#link-search', ' example '); await delay();
    component.setStatus('INACTIVE'); component.setSort('clickCount,desc'); component.setSize('20'); await render(fixture);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'example', status: 'INACTIVE', sort: 'clickCount,desc', size: 20, page: 0 }));
    component.results.set(page([link], { totalPages: 2, last: false })); component.changePage(1); await render(fixture);
    expect(component.query().page).toBe(1); component.changePage(1); expect(component.query().page).toBe(1);
    api.list.mockImplementation(q => of(q.size === 3 ? page([link]) : q.page ? page([], { number: 1, totalPages: 1 }) : page([link])));
    component.refresh(); await render(fixture); expect(component.query().page).toBe(0);
  });
  it('renders independent API failures, empty states, and recovers on refresh', async () => {
    api.statistics.mockReturnValue(fail(500)); api.list.mockReturnValue(fail(500)); component.refresh(); await render(fixture);
    expect(component.statistics()).toBeNull(); expect(component.topLinksError()).not.toBe(''); expect(component.listError()).not.toBe('');
    api.statistics.mockReturnValue(of({ totalUrls: 0, activeUrls: 0, expiredUrls: 0, totalClicks: 0 })); api.list.mockReturnValue(of(page([])));
    component.refresh(); await render(fixture);
    expect(fixture.nativeElement.querySelector('.top-links-panel').textContent).toContain(component.m.topLinksEmpty);
    expect(fixture.nativeElement.querySelector('#my-links').textContent).toContain(component.m.emptyHeading);
    expect(fixture.nativeElement.querySelector('.stat strong').textContent).toBe('0');
  });
  it('generates the QR locally, exposes the PNG download, and resets on close', async () => {
    click(fixture, 'tbody .row-actions button:nth-child(2)'); await render(fixture);
    await vi.waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled());
    await render(fixture);
    expect(QRCode.toDataURL).toHaveBeenCalledWith(component.shortUrl(link), expect.objectContaining({ width: 768, margin: 4 }));
    expect(fixture.nativeElement.querySelector('.qr-modal img')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.qr-modal [download]').getAttribute('download')).toBe('linkly-example.png');
    click(fixture, '.qr-modal button'); expect(component.qrImage()).toBe('');
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('Canvas unavailable'));
    await component.openQr(component.shortUrl(link), link.shortCode, false); await render(fixture);
    expect(component.qrError()).toBe(component.m.qrError); expect(fixture.nativeElement.querySelector('.qr-modal').textContent).toContain('inactive');
    component.closeQr(new Event('cancel', { cancelable: true }));
  });
  it('handles clipboard permissions and scrolls with a sticky-header offset', async () => {
    await component.copyLink(component.shortUrl(link)); expect(component.success()).toBe(component.m.copied);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Denied')); await component.copyLink('https://example.com');
    expect(component.actionError()).toBe(component.m.copyError);
    click(fixture, 'nav a:nth-child(2)'); expect(component.activeSection()).toBe('my-links'); expect(window.scrollTo).toHaveBeenCalled();
    click(fixture, 'nav a:first-child'); expect(component.activeSection()).toBe('overview');
    const event = new MouseEvent('click', { ctrlKey: true, cancelable: true }); component.scrollToSection('my-links', event); expect(event.defaultPrevented).toBe(false);
  });
  it.each([204, 500, 401])('handles logout and clears the workspace on session expiry (%s)', async status => {
    auth.logout.mockReturnValue(status === 204 ? of(undefined) : fail(status)); component.logout(); await render(fixture);
    if (status === 500) expect(component.actionError()).not.toBe('');
    else expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
    if (status === 401) { expect(auth.clearIdentity).toHaveBeenCalled(); expect(component.results()).toBeNull(); component.refresh(); }
  });
});
