import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { click, input, render, submit } from '../../../../testing/helpers';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Register } from './register';

const csrf = { token: 'registration-token', headerName: 'X-CSRF-TOKEN', parameterName: '_csrf' };

describe('Registration', () => {
  let page: Register;
  let http: HttpTestingController;
  let fixture: ComponentFixture<Register>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Register);
    page = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => { fixture.detectChanges(); http.verify(); });

  it('renders validation, password visibility and successful registration through the form', async () => {
    submit(fixture);
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#register-email-error').textContent).toContain('valid email');
    input(fixture, '#register-email', 'person@example.com');
    input(fixture, '#register-password', 'test-password');
    input(fixture, '#confirm-password', 'test-password');
    click(fixture, '[aria-label="Show password"]');
    click(fixture, '[aria-label="Show password confirmation"]');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#register-password').type).toBe('text');
    expect(fixture.nativeElement.querySelector('#confirm-password').type).toBe('text');
    submit(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(true);
    http.expectOne('/api/auth/csrf').flush(csrf);
    http.expectOne('/api/auth/register').flush({ message: 'Created' });
    await render(fixture);
    expect(fixture.nativeElement.querySelector('.success').textContent).toContain('account is ready');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('register-title');
  });

  it('renders backend errors and confirmation mismatch without hiding the form', async () => {
    fill();
    page.form.controls.confirmPassword.setValue('different');
    submit(fixture);
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#confirmation-error').textContent).toContain('match');
    page.form.controls.confirmPassword.setValue('test-password');
    submit(fixture);
    http.expectOne('/api/auth/csrf').flush(csrf);
    http.expectOne('/api/auth/register').flush({}, { status: 500, statusText: 'Server Error' });
    await render(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  function fill(password = 'test-password', email = 'person@example.com') {
    page.form.setValue({ email, password, confirmPassword: password });
  }

  it('blocks invalid email, blank passwords and mismatched confirmation before HTTP', () => {
    fill('test-password', 'invalid');
    page.onSubmit();
    expect(page.emailError).toBe('Enter a valid email address.');
    fill('        ');
    page.onSubmit();
    expect(page.passwordError).toContain('non-space');
    fill();
    page.form.controls.confirmPassword.setValue('different-password');
    page.onSubmit();
    expect(page.confirmationInvalid).toBe(true);
    http.expectNone('/api/auth/csrf');
    http.expectNone('/api/auth/register');
    page.form.controls.confirmPassword.setValue('test-password');
    expect(page.confirmationInvalid).toBe(false);
    expect(page.form.valid).toBe(true);
  });

  it('enforces the BCrypt byte limit for Unicode passwords', () => {
    fill('é'.repeat(36));
    expect(page.form.valid).toBe(true);
    fill('é'.repeat(37));
    page.onSubmit();
    expect(page.passwordError).toContain('72 UTF-8 bytes');
    http.expectNone('/api/auth/csrf');
  });

  it('normalizes pasted email, protects registration and clears passwords after success', () => {
    fill('test-password', ' Person@Example.COM ');
    page.showPassword.set(true);
    page.showConfirmation.set(true);
    page.onSubmit();
    page.onSubmit();
    expect(page.loading()).toBe(true);
    http.expectOne('/api/auth/csrf').flush(csrf);
    const registration = http.expectOne('/api/auth/register');
    expect(registration.request.method).toBe('POST');
    expect(registration.request.headers.get(csrf.headerName)).toBe(csrf.token);
    expect(registration.request.body).toEqual({
      email: 'person@example.com', password: 'test-password',
    });
    registration.flush({ message: 'User registered successfully' }, {
      status: 201, statusText: 'Created',
    });
    expect(page.registered()).toBe(true);
    expect(page.loading()).toBe(false);
    expect(page.form.controls.password.value).toBe('');
    expect(page.form.controls.confirmPassword.value).toBe('');
    expect(page.showPassword()).toBe(false);
    expect(page.showConfirmation()).toBe(false);
    page.onSubmit();
    http.expectNone('/api/auth/csrf');
  });

  it('explains duplicate email and obtains a fresh CSRF token on retry', () => {
    fill();
    page.onSubmit();
    http.expectOne('/api/auth/csrf').flush(csrf);
    http.expectOne('/api/auth/register').flush({}, { status: 409, statusText: 'Conflict' });
    expect(page.error()).toContain('already exists');
    expect(page.loading()).toBe(false);
    expect(page.registered()).toBe(false);
    page.form.controls.email.setValue('another@example.com');
    page.onSubmit();
    http.expectOne('/api/auth/csrf').flush({ ...csrf, token: 'new-token' });
    const retry = http.expectOne('/api/auth/register');
    expect(retry.request.headers.get(csrf.headerName)).toBe('new-token');
    retry.flush({ message: 'User registered successfully' });
    expect(page.registered()).toBe(true);
  });

  it('shows backend field errors and allows correction', () => {
    fill();
    page.onSubmit();
    http.expectOne('/api/auth/csrf').flush(csrf);
    http.expectOne('/api/auth/register').flush({
      fieldErrors: { email: 'Invalid email address', password: 'Password rejected' },
    }, { status: 400, statusText: 'Bad Request' });
    expect(page.emailError).toBe('Invalid email address');
    expect(page.passwordError).toBe('Password rejected');
    expect(page.form.invalid).toBe(true);
    page.form.controls.email.setValue('corrected@example.com');
    page.form.controls.password.setValue('updated-password');
    page.form.controls.confirmPassword.setValue('updated-password');
    expect(page.emailError).toBe('');
    expect(page.passwordError).toBe('');
    expect(page.form.valid).toBe(true);
  });

  it('handles CSRF request failure without sending credentials', () => {
    fill();
    page.onSubmit();
    http.expectOne('/api/auth/csrf').error(new ProgressEvent('error'));
    expect(page.error()).toContain('reach the server');
    expect(page.loading()).toBe(false);
    http.expectNone('/api/auth/register');
  });
});
