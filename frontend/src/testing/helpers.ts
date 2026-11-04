import { ComponentFixture } from '@angular/core/testing';
import { PageResponse, ShortUrl } from '../app/core/models/dashboard.model';

export const user = { id: 1, email: 'person@example.com', role: 'USER' as const, active: true };
export const link: ShortUrl = {
  id: 1, userId: 1, shortCode: 'example', originalUrl: 'https://example.com/article',
  active: true, expiresAt: '2035-01-01T12:00:00Z', clickCount: 12, lastAccessedAt: '2026-01-01T12:00:00Z',
};
export function page<T>(content: T[], overrides: Partial<PageResponse<T>> = {}): PageResponse<T> {
  return { content, number: 0, size: 10, totalElements: content.length, totalPages: content.length ? 1 : 0,
    first: true, last: true, empty: !content.length, ...overrides };
}
export async function render<T>(fixture: ComponentFixture<T>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
export function input<T>(fixture: ComponentFixture<T>, selector: string, value: string): void {
  const field = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
export function click<T>(fixture: ComponentFixture<T>, selector: string): void {
  (fixture.nativeElement.querySelector(selector) as HTMLElement).click();
}
export function submit<T>(fixture: ComponentFixture<T>, selector = 'form'): void {
  fixture.nativeElement.querySelector(selector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
export const delay = () => new Promise(resolve => setTimeout(resolve, 380));
