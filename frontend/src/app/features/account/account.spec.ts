import { ComponentFixture, TestBed } from '@angular/core/testing';
import { click, input, render, submit, user } from '../../../testing/helpers';
import { AuthService } from '../../core/services/auth';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Account } from './account';

describe('Account password change', () => {
  let account: Account;
  let http: HttpTestingController;
  let fixture: ComponentFixture<Account>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Account],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(user);
    fixture = TestBed.createComponent(Account);
    account = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => { fixture.detectChanges(); http.verify(); });

  it('renders and submits the password editor, including validation and visibility controls', async () => {
    click(fixture, '.edit-password');
    await render(fixture);
    expect(document.activeElement?.id).toBe('currentPassword');
    submit(fixture);
    await render(fixture);
    expect(fixture.nativeElement.querySelectorAll('.field-error').length).toBe(3);
    input(fixture, '#currentPassword', 'old-password');
    input(fixture, '#newPassword', 'short');
    input(fixture, '#confirmation', 'different');
    submit(fixture);
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#newPassword-error').textContent).toContain('8');
    input(fixture, '#newPassword', 'new-password');
    input(fixture, '#confirmation', 'new-password');
    click(fixture, '.password-field button');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#currentPassword').type).toBe('text');
    submit(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[type="submit"]').disabled).toBe(true);
    http.expectOne('/api/auth/csrf').flush({ token: 'csrf', headerName: 'X-CSRF-TOKEN' });
    http.expectOne('/api/auth/password').flush({ fieldErrors: { newPassword: 'Try another password' } }, { status: 400, statusText: 'Bad Request' });
    await render(fixture);
    expect(fixture.nativeElement.querySelector('#newPassword-error').textContent).toBe('Try another password');
    click(fixture, '#password-editor .secondary');
    await render(fixture);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it.each([401, 500])('handles password failures with status %s', async status => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    account.openPasswordEditor();
    account.form.setValue({ currentPassword: 'old-password', newPassword: 'new-password', confirmation: 'new-password' });
    account.changePassword();
    http.expectOne('/api/auth/csrf').flush({ token: 'csrf', headerName: 'X-CSRF-TOKEN' });
    http.expectOne('/api/auth/password').flush({}, { status, statusText: 'Failure' });
    await render(fixture);
    if (status === 401) { expect(navigate).toHaveBeenCalledWith(['/login']); expect(account.form.controls.currentPassword.value).toBe(''); }
    else expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it.each([204, 401, 500])('logs out and handles status %s', async status => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    click(fixture, '.sidebar button');
    http.expectOne('/api/auth/csrf').flush({ token: 'csrf', headerName: 'X-CSRF-TOKEN' });
    http.expectOne('/api/auth/logout').flush(null, { status, statusText: 'Result' });
    await render(fixture);
    if (status !== 500) expect(navigate).toHaveBeenCalledWith(['/login']);
    else expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps password editing collapsed and clears unsaved values on cancel', () => {
    expect(account.passwordEditing()).toBe(false);
    account.openPasswordEditor();
    expect(account.passwordEditing()).toBe(true);
    account.form.patchValue({ currentPassword: 'old-password', newPassword: 'new-password' });
    account.toggle('newPassword');
    account.cancelPasswordEditor();
    expect(account.passwordEditing()).toBe(false);
    expect(account.form.getRawValue()).toEqual({ currentPassword: '', newPassword: '', confirmation: '' });
    expect(account.visible().newPassword).toBe(false);
  });

  it('rejects unchanged, blank, mismatched and oversized Unicode passwords', () => {
    account.form.setValue({ currentPassword: 'password-one', newPassword: 'password-one', confirmation: 'password-one' });
    account.changePassword();
    expect(account.fieldError('newPassword')).toContain('different');
    account.form.patchValue({ newPassword: '        ', confirmation: '        ' });
    account.changePassword();
    expect(account.fieldError('newPassword')).toContain('non-space');
    account.form.patchValue({ newPassword: 'password-two', confirmation: 'different' });
    account.changePassword();
    expect(account.fieldError('confirmation')).toContain('match');
    account.form.patchValue({ newPassword: 'é'.repeat(37), confirmation: 'é'.repeat(37) });
    account.changePassword();
    expect(account.fieldError('newPassword')).toContain('72');
    http.expectNone('/api/auth/csrf');
    account.form.patchValue({ newPassword: 'é'.repeat(36), confirmation: 'é'.repeat(36) });
    expect(account.form.valid).toBe(true);
  });

  it('maps a wrong current password to its field and allows a corrected retry', () => {
    account.form.setValue({ currentPassword: 'wrong-password', newPassword: 'new-password', confirmation: 'new-password' });
    account.changePassword();
    http.expectOne('/api/auth/csrf').flush({ token: 'csrf', headerName: 'X-CSRF-TOKEN' });
    http.expectOne('/api/auth/password').flush({ message: 'Current password is incorrect' }, {
      status: 400, statusText: 'Bad Request',
    });
    expect(account.fieldError('currentPassword')).toContain('incorrect');
    expect(account.loading()).toBe(false);
    account.form.controls.currentPassword.setValue('correct-password');
    expect(account.form.valid).toBe(true);
    expect(account.error()).toBe('');
  });

  it('blocks duplicate submissions, clears passwords and returns to login after success', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    account.form.setValue({ currentPassword: 'old-password', newPassword: 'new-password', confirmation: 'new-password' });
    account.changePassword();
    account.changePassword();
    http.expectOne('/api/auth/csrf').flush({ token: 'csrf', headerName: 'X-CSRF-TOKEN' });
    const request = http.expectOne('/api/auth/password');
    expect(request.request.body).toEqual({ currentPassword: 'old-password', newPassword: 'new-password' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(account.form.getRawValue()).toEqual({ currentPassword: '', newPassword: '', confirmation: '' });
    expect(navigate).toHaveBeenCalledWith(['/login'], { state: { passwordChanged: true } });
    expect(account.loading()).toBe(false);
  });
});
