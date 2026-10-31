import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  Subject, catchError, combineLatest, debounceTime, distinctUntilChanged,
  finalize, map, of, startWith, switchMap,
} from 'rxjs';
import { AdminApi, AdminUrlsQuery, UsersQuery } from '../../core/services/admin-api';
import { AuthService } from '../../core/services/auth';
import { MessagesService } from '../../core/i18n/messages';
import { UserResponse } from '../../core/models/auth.model';
import { PageResponse, ShortUrl, UrlStatus } from '../../core/models/dashboard.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  readonly auth = inject(AuthService);
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('statusDialog')
  private statusDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('urlSearchInput')
  private urlSearchInput?: ElementRef<HTMLInputElement>;

  readonly tab = signal<'users' | 'urls'>('users');
  readonly users = signal<PageResponse<UserResponse> | null>(null);
  readonly urls = signal<PageResponse<ShortUrl> | null>(null);
  readonly usersLoading = signal(true);
  readonly urlsLoading = signal(true);
  readonly usersError = signal('');
  readonly urlsError = signal('');
  readonly success = signal('');
  readonly actionError = signal('');
  readonly busy = signal(false);
  readonly loggingOut = signal(false);
  readonly target = signal<UserResponse | null>(null);
  readonly selectedUser = signal<Pick<UserResponse, 'id' | 'email'> | null>(null);
  readonly userSearch = new FormControl('', { nonNullable: true });
  readonly urlSearch = new FormControl('', { nonNullable: true });

  readonly usersQuery = signal<UsersQuery>({
    page: 0, size: 10, search: '', active: '', role: '', sort: 'id,desc',
  });
  readonly urlsQuery = signal<AdminUrlsQuery>({
    page: 0, size: 10, search: '', status: '', userId: null, sort: 'createdAt,desc',
  });

  private readonly reloadUsers = new Subject<void>();
  private readonly reloadUrls = new Subject<void>();
  private leaving = false;

  get m() { return this.text().admin; }

  constructor() {
    combineLatest([
      toObservable(this.usersQuery), this.reloadUsers.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([query]) => {
        this.usersLoading.set(true);
        this.usersError.set('');
        return this.api.users(query).pipe(
          catchError((error: HttpErrorResponse) => {
            this.users.set(null);
            this.usersError.set(this.problem(error));
            return of(null);
          }),
          finalize(() => this.usersLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(page => {
      if (!page || this.leaving) return;
      if (page.number > 0 && page.content.length === 0) {
        this.usersQuery.update(query => ({ ...query, page: Math.max(0, page.totalPages - 1) }));
        return;
      }
      this.users.set(page);
    });

    combineLatest([
      toObservable(this.urlsQuery), this.reloadUrls.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([query]) => {
        this.urlsLoading.set(true);
        this.urlsError.set('');
        return this.api.urls(query).pipe(
          catchError((error: HttpErrorResponse) => {
            this.urls.set(null);
            this.urlsError.set(this.problem(error));
            return of(null);
          }),
          finalize(() => this.urlsLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(page => {
      if (!page || this.leaving) return;
      if (page.number > 0 && page.content.length === 0) {
        this.urlsQuery.update(query => ({ ...query, page: Math.max(0, page.totalPages - 1) }));
        return;
      }
      this.urls.set(page);
    });

    this.userSearch.valueChanges.pipe(
      map(value => value.trim()), debounceTime(300), distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(search => {
      this.usersQuery.update(query => ({ ...query, search, page: 0 }));
    });
    this.urlSearch.valueChanges.pipe(
      map(value => value.trim()), debounceTime(300), distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(search => {
      if (search === this.urlsQuery().search) return;
      this.urlsQuery.update(query => ({ ...query, search, page: 0 }));
    });
  }

  refresh(): void {
    if (this.leaving) return;
    this.reloadUsers.next();
    this.reloadUrls.next();
  }

  setUserStatus(active: string): void {
    this.usersQuery.update(query => ({ ...query, active: active as UsersQuery['active'], page: 0 }));
  }
  setRole(role: string): void {
    this.usersQuery.update(query => ({ ...query, role: role as UsersQuery['role'], page: 0 }));
  }
  setUserSort(sort: string): void {
    this.usersQuery.update(query => ({ ...query, sort, page: 0 }));
  }
  setUrlStatus(status: string): void {
    this.urlsQuery.update(query => ({ ...query, status: status as AdminUrlsQuery['status'], page: 0 }));
  }
  setUrlSort(sort: string): void {
    this.urlsQuery.update(query => ({ ...query, sort, page: 0 }));
  }
  setPageSize(size: string): void {
    if (this.tab() === 'users') {
      this.usersQuery.update(query => ({ ...query, size: Number(size), page: 0 }));
    } else {
      this.urlsQuery.update(query => ({ ...query, size: Number(size), page: 0 }));
    }
  }
  changePage(offset: number): void {
    const page = this.tab() === 'users' ? this.users() : this.urls();
    const loading = this.tab() === 'users' ? this.usersLoading() : this.urlsLoading();
    if (!page || loading) return;
    const next = page.number + offset;
    if (next < 0 || next >= page.totalPages) return;
    if (this.tab() === 'users') {
      this.usersQuery.update(query => ({ ...query, page: next }));
    } else {
      this.urlsQuery.update(query => ({ ...query, page: next }));
    }
  }

  clearOwner(): void {
    this.success.set('');
    this.actionError.set('');
    this.selectedUser.set(null);
    this.urls.set(null);
    this.urlSearch.setValue('');
    this.urlsQuery.update(query => ({ ...query, userId: null, search: '', status: '', page: 0 }));
    this.urlSearchInput?.nativeElement.focus();
  }
  viewUserLinks(user: UserResponse): void {
    this.success.set('');
    this.actionError.set('');
    this.selectedUser.set({ id: user.id, email: user.email });
    this.urls.set(null);
    this.urlSearch.setValue('');
    this.urlsQuery.update(query => ({ ...query, page: 0, search: '', status: '', userId: user.id }));
    this.tab.set('urls');
  }

  requestStatusChange(user: UserResponse): void {
    if (this.busy() || user.id === this.auth.user()?.id) return;
    this.target.set(user);
    this.actionError.set('');
    this.statusDialog.nativeElement.showModal();
  }
  closeStatusDialog(event?: Event): void {
    if (this.busy()) { event?.preventDefault(); return; }
    this.statusDialog.nativeElement.close();
    this.target.set(null);
  }
  confirmStatusChange(): void {
    const user = this.target();
    if (!user || this.busy()) return;
    this.busy.set(true);
    this.success.set('');
    this.actionError.set('');
    this.api.setActive(user.id, !user.active).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)),
    ).subscribe({
      next: updated => {
        this.statusDialog.nativeElement.close();
        this.target.set(null);
        this.success.set(this.copy.format(
          updated.active ? this.m.activated : this.m.deactivated, { email: updated.email },
        ));
        this.reloadUsers.next();
      },
      error: (error: HttpErrorResponse) => {
        this.actionError.set(this.problem(error));
        if (error.status === 404) {
          this.statusDialog.nativeElement.close();
          this.target.set(null);
          this.reloadUsers.next();
        }
      },
    });
  }

  status(link: ShortUrl): UrlStatus {
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'EXPIRED';
    return link.active ? 'ACTIVE' : 'INACTIVE';
  }
  shortUrl(link: ShortUrl): string {
    return new URL(`/r/${encodeURIComponent(link.shortCode)}`, window.location.origin).toString();
  }
  async copyLink(link: ShortUrl): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shortUrl(link));
      this.actionError.set('');
      this.success.set(this.m.copied);
    } catch { this.actionError.set(this.m.copyError); }
  }
  logout(): void {
    if (this.loggingOut() || this.busy()) return;
    this.loggingOut.set(true);
    this.actionError.set('');
    this.auth.logout().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loggingOut.set(false)),
    ).subscribe({
      next: () => this.router.navigate(['/login']),
      error: (error: HttpErrorResponse) => this.actionError.set(this.problem(error)),
    });
  }
  private problem(error: HttpErrorResponse): string {
    if (error.status === 401) {
      if (!this.leaving) {
        this.leaving = true;
        this.auth.clearIdentity();
        this.users.set(null);
        this.urls.set(null);
        this.selectedUser.set(null);
        this.target.set(null);
        this.statusDialog?.nativeElement.close();
        void this.router.navigate(['/login']);
      }
      return '';
    }
    const errors: Record<string, string> = this.m.errors;
    return errors[String(error.status)] ?? errors['default'];
  }
}
