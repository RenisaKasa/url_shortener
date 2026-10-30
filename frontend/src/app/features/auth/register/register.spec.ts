import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Register } from './register';

const csrf = { token: 'registration-token', headerName: 'X-CSRF-TOKEN', parameterName: '_csrf' };

describe('Registration', () => {
  let page: Register;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // These tests exercise the real form and HTTP flow without the decorative canvas.
    TestBed.overrideComponent(Register, { set: { template: '' } });
    page = TestBed.createComponent(Register).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

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
    page.onSubmit(); // Double submission must not create another request.
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
