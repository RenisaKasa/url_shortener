import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { SessionCheckState } from './core/guards/auth-guard';
import { render } from '../testing/helpers';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the route outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('renders a connection message and retries the original URL once while keeping the current outlet', async () => {
    const session = TestBed.inject(SessionCheckState);
    session.failedUrl.set('/admin?section=users');
    let complete!: (result: boolean) => void;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(() => new Promise<boolean>(resolve => complete = resolve));
    const fixture = TestBed.createComponent(App);
    await render(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to connect. Please try again.');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    fixture.nativeElement.querySelector('button').click();
    fixture.componentInstance.retrySession();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/admin?section=users', { onSameUrlNavigation: 'reload' });
    session.failedUrl.set(null);
    complete(true);
    await render(fixture);
    expect(session.checking()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    await fixture.componentInstance.retrySession();
    expect(navigate).toHaveBeenCalledOnce();
  });
});
