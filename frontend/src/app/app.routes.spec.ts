import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { routes } from './app.routes';
import { appConfig } from './app.config';
import { MessagesService } from './core/i18n/messages';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { Urls } from './features/urls/urls';

describe('Application routing and initialization', () => {
  it('loads every page and supplies translated document titles', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
    const copy = TestBed.inject(MessagesService);
    for (const route of routes) {
      if (route.loadComponent) {
        const component = await route.loadComponent() as { name: string };
        expect(component).toBeTruthy();
      }
      if (typeof route.title === 'function') {
        const title = route.title as () => string;
        expect(TestBed.runInInjectionContext(title)).toContain(copy.text().common.brand);
      }
    }
    expect(routes.find(route => route.path === 'admin')?.data?.['role']).toBe('ADMIN');
    expect(routes.at(-1)?.redirectTo).toBe('');
  });
  it('loads message overrides before application initialization completes', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const initialization = TestBed.inject(ApplicationInitStatus);
    TestBed.inject(HttpTestingController).expectOne('messages/en.json').flush({ common: { brand: 'Test Linkly' } });
    await initialization.donePromise;
    expect(TestBed.inject(MessagesService).text().common.brand).toBe('Test Linkly');
    TestBed.inject(HttpTestingController).verify();
  });
  it('passes requests through the existing interceptor without changing their content', () => {
    const request = new HttpRequest('GET', '/api/urls');
    const next = vi.fn(() => of(new HttpResponse({ status: 200 })));
    authInterceptor(request, next).subscribe(result => expect(result.type).toBe(4));
    expect(next).toHaveBeenCalledWith(request);
  });
  it('renders the existing URLs component', async () => {
    TestBed.configureTestingModule({ imports: [Urls], providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(Urls);
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.text().common.brand).toBe('Linkly');
  });
});
