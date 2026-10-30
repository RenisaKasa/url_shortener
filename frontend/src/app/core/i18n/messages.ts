import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, of, tap } from 'rxjs';
import english from '../../../../public/messages/en.json';

export type Messages = typeof english;

function mergeMessages(defaults: Record<string, unknown>, overrides: unknown): Record<string, unknown> {
  const source = overrides && typeof overrides === 'object'
    ? overrides as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    typeof fallback === 'string'
      ? typeof source[key] === 'string' ? source[key] : fallback
      : mergeMessages(fallback as Record<string, unknown>, source[key]),
  ]));
}

@Injectable({ providedIn: 'root' })
export class MessagesService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<Messages>(english);
  readonly text = this.current.asReadonly();

  load() {
    return this.http.get<Messages>('messages/en.json').pipe(
      tap(messages => this.current.set(mergeMessages(english, messages) as Messages)),
      // Bundled copy keeps the interface usable if the runtime resource is unavailable.
      catchError(() => of(english)),
    );
  }

  format(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
  }

  error(page: 'login' | 'register', status: number): string {
    const errors: Record<string, string> = this.text()[page].errors;
    return errors[String(status)] ?? errors['default'];
  }
}
