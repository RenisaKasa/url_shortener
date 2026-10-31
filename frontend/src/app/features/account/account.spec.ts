import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Account } from './account';

describe('Account password change', () => {
  let account: Account;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Account],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideComponent(Account, { set: { template: '' } });
    account = TestBed.createComponent(Account).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

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
