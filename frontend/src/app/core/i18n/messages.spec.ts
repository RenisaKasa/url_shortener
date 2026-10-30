import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessagesService } from './messages';

describe('Runtime messages', () => {
  let copy: MessagesService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    copy = TestBed.inject(MessagesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads changed copy at runtime and retains defaults for missing keys', () => {
    const originalEmailLabel = copy.text().common.emailLabel;
    copy.load().subscribe();
    http.expectOne('messages/en.json').flush({
      login: { heading: 'Hello again', errors: { '401': 'Try another password' } },
    });
    expect(copy.text().login.heading).toBe('Hello again');
    expect(copy.text().common.emailLabel).toBe(originalEmailLabel);
    expect(copy.error('login', 401)).toBe('Try another password');
    expect(copy.error('login', 418)).toBe(copy.text().login.errors.default);
  });

  it('keeps the interface usable when the message resource is unavailable', () => {
    const originalHeading = copy.text().register.heading;
    copy.load().subscribe();
    http.expectOne('messages/en.json').flush({}, { status: 404, statusText: 'Not Found' });
    expect(copy.text().register.heading).toBe(originalHeading);
    expect(copy.format('Hello {email}, welcome to {brand}.', {
      email: 'person@example.com', brand: 'Linkly',
    })).toBe('Hello person@example.com, welcome to Linkly.');
  });
});
