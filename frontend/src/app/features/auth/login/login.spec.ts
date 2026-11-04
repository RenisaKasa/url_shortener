import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Login } from './login';
import { click, input, render, submit, user } from '../../../../testing/helpers';

describe('Login page', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Login], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    http = TestBed.inject(HttpTestingController);
    await render(fixture);
  });
  afterEach(() => http.verify());
  const csrf = { token: 'token', headerName: 'X-CSRF-TOKEN' };
  function fill() {
    input(fixture, '#email', ' person@example.com ');
    input(fixture, '#password', 'test-password');
  }
  it('shows required validation and toggles the password field', async () => {
    submit(fixture);
    await render(fixture);
    expect(fixture.nativeElement.querySelectorAll('.field-error').length).toBe(2);
    click(fixture, '.visibility');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#password').type).toBe('text');
    click(fixture, '.visibility');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#password').type).toBe('password');
    http.expectNone('/api/auth/csrf');
  });
  it.each(['USER', 'ADMIN'] as const)('signs in a %s once and sends them to their dashboard', async role => {
    fill();
    submit(fixture);
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(true);
    http.expectOne('/api/auth/csrf').flush(csrf);
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: user.email, password: 'test-password' });
    request.flush({ ...user, role });
    http.expectOne('/api/auth/csrf').flush(csrf);
    await render(fixture);
    expect(navigate).toHaveBeenCalledWith([role === 'ADMIN' ? '/admin' : '/dashboard']);
  });
  it.each([0, 401, 403, 429, 500])('renders a meaningful login error for status %s', async status => {
    fill(); submit(fixture);
    http.expectOne('/api/auth/csrf').flush(csrf);
    const request = http.expectOne('/api/auth/login');
    if (!status) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Failure' });
    await render(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent.trim().length).toBeGreaterThan(10);
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(false);
  });
  it('opens and closes About and reset notices and scrolls to features', async () => {
    click(fixture, 'nav button:last-child');
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
    click(fixture, '.close-about');
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    click(fixture, 'nav button:last-child');
    click(fixture, 'dialog');
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    click(fixture, '.form-options button');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('.notice').textContent).toContain('reset');
    click(fixture, '.notice button');
    click(fixture, 'nav button:first-child');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('.notice')).toBeNull();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('.feature-card').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.socials')).toBeNull();
  });
  it('shows the password-change confirmation passed by the account page', async () => {
    fixture.destroy();
    vi.spyOn(TestBed.inject(Router), 'currentNavigation').mockReturnValue({ extras: { state: { passwordChanged: true } } } as never);
    fixture = TestBed.createComponent(Login);
    await render(fixture);
    expect(fixture.nativeElement.querySelector('.notice').textContent).toContain('password was updated');
  });
});
