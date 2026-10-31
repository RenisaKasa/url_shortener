import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, effect, inject, signal } from '@angular/core';
import {
  AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, ValidatorFn, Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  Subject, catchError, combineLatest, debounceTime, distinctUntilChanged,
  finalize, map, of, startWith, switchMap,
} from 'rxjs';
import { AuthService } from '../../core/services/auth';
import { DashboardApi } from '../../core/services/dashboard-api';
import { MessagesService } from '../../core/i18n/messages';
import {
  CreateUrlRequest, CreateUrlResponse, DashboardStatistics, PageResponse,
  ShortUrl, UpdateUrlRequest, UrlQuery, UrlStatus,
} from '../../core/models/dashboard.model';

const validHttpUrl: ValidatorFn = control => {
  if (!control.value) return null;
  try {
    const url = new URL(String(control.value).trim());
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname &&
      !url.username && !url.password ? null : { url: true };
  } catch { return { url: true }; }
};
const futureDate: ValidatorFn = control => {
  if (!control.value) return null;
  const time = new Date(control.value).getTime();
  return Number.isFinite(time) && time > Date.now() ? null : { future: true };
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly auth = inject(AuthService);
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  private readonly api = inject(DashboardApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private anchorPending = inject(ActivatedRoute).snapshot.fragment === 'my-links';
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('editDialog') private editDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog') private deleteDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('dashboardHeader') private dashboardHeader!: ElementRef<HTMLElement>;

  readonly activeSection = signal<'overview' | 'my-links'>('overview');

  readonly statistics = signal<DashboardStatistics | null>(null);
  readonly statisticsLoading = signal(true);
  readonly statisticsError = signal('');
  readonly results = signal<PageResponse<ShortUrl> | null>(null);
  readonly listLoading = signal(true);
  readonly listError = signal('');
  readonly busy = signal<'create' | 'edit' | 'delete' | null>(null);
  readonly detailsLoading = signal<number | null>(null);
  readonly loggingOut = signal(false);
  readonly success = signal('');
  readonly actionError = signal('');
  readonly createError = signal('');
  readonly created = signal<CreateUrlResponse | null>(null);
  readonly editing = signal<ShortUrl | null>(null);
  readonly deleting = signal<ShortUrl | null>(null);
  readonly query = signal<UrlQuery>({
    page: 0, size: 10, search: '', status: '', sort: 'createdAt,desc',
  });
  readonly search = new FormControl('', { nonNullable: true });
  readonly createForm = this.fb.nonNullable.group({
    originalUrl: ['', [Validators.required, Validators.maxLength(2048), validHttpUrl]],
    customAlias: ['', Validators.pattern(/^[A-Za-z0-9_-]{3,32}$/)],
    expiresAt: ['', futureDate],
  });
  readonly editForm = this.fb.nonNullable.group({ active: [true], expiresAt: [''] });
  private readonly reloadStatistics = new Subject<void>();
  private readonly reloadList = new Subject<void>();
  private leaving = false;

  get m() { return this.text().dashboard; }
  get statisticCards() {
    const stats = this.statistics();
    return stats ? [
      { label: this.m.stats.total, value: stats.totalUrls },
      { label: this.m.stats.active, value: stats.activeUrls },
      { label: this.m.stats.expired, value: stats.expiredUrls },
      { label: this.m.stats.clicks, value: stats.totalClicks },
    ] : [];
  }
  get canSave(): boolean {
    const link = this.editing();
    if (!link || this.editForm.invalid) return false;
    const value = this.editForm.getRawValue();
    return value.active !== link.active || value.expiresAt !== this.localDate(link.expiresAt);
  }

  constructor() {
    effect(() => {
      if (!this.statisticsLoading() && !this.listLoading() && this.anchorPending) {
        this.anchorPending = false;
        afterNextRender(() => this.scrollToSection('my-links'), { injector: this.injector });
      }
    });
    this.reloadStatistics.pipe(
      startWith(undefined),
      switchMap(() => {
        this.statisticsLoading.set(true);
        this.statisticsError.set('');
        return this.api.statistics().pipe(
          catchError((error: HttpErrorResponse) => {
            this.statistics.set(null);
            this.statisticsError.set(this.problem(error));
            return of(null);
          }),
          finalize(() => this.statisticsLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(statistics => {
      if (!this.leaving && statistics) this.statistics.set(statistics);
    });

    combineLatest([
      toObservable(this.query), this.reloadList.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([query]) => {
        this.listLoading.set(true);
        this.listError.set('');
        return this.api.list(query).pipe(
          catchError((error: HttpErrorResponse) => {
            this.results.set(null);
            this.listError.set(this.problem(error));
            return of(null);
          }),
          finalize(() => this.listLoading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(page => {
      if (!page || this.leaving) return;
      if (page.number > 0 && page.content.length === 0) {
        this.query.update(query => ({ ...query, page: Math.max(0, page.totalPages - 1) }));
        return;
      }
      this.results.set(page);
    });

    this.search.valueChanges.pipe(
      map(value => value.trim()), debounceTime(300), distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(search => this.query.update(query => ({ ...query, search, page: 0 })));
  }

  refresh(): void {
    if (this.leaving) return;
    this.reloadStatistics.next();
    this.reloadList.next();
  }
  scrollToSection(section: 'overview' | 'my-links', event?: MouseEvent): void {
    if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event?.preventDefault();
    const target = document.getElementById(section);
    if (!target) return;
    const headerHeight = this.dashboardHeader.nativeElement.getBoundingClientRect().height;
    this.activeSection.set(section);
    window.scrollTo({
      top: section === 'overview' ? 0 : window.scrollY + target.getBoundingClientRect().top - headerHeight - 20,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    document.getElementById(section === 'overview' ? 'workspace-title' : 'links-title')
      ?.focus({ preventScroll: true });
  }
  setStatus(status: string): void {
    this.query.update(query => ({ ...query, status: status as UrlStatus | '', page: 0 }));
  }
  setSort(sort: string): void {
    this.query.update(query => ({ ...query, sort, page: 0 }));
  }
  setSize(size: string): void {
    this.query.update(query => ({ ...query, size: Number(size), page: 0 }));
  }
  changePage(offset: number): void {
    const page = this.results();
    if (!page || this.listLoading()) return;
    const next = this.query().page + offset;
    if (next < 0 || next >= page.totalPages) return;
    this.query.update(query => ({ ...query, page: next }));
  }
  status(link: ShortUrl): UrlStatus {
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'EXPIRED';
    return link.active ? 'ACTIVE' : 'INACTIVE';
  }
  shortUrl(link: ShortUrl): string {
    return new URL(`/r/${encodeURIComponent(link.shortCode)}`, window.location.origin).toString();
  }
  async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.actionError.set('');
      this.success.set(this.m.copied);
    } catch { this.actionError.set(this.m.copyError); }
  }
  fieldError(control: AbstractControl, field: 'url' | 'alias' | 'date'): string {
    if (!control.touched || control.valid) return '';
    return control.getError('server') ?? this.m.validation[field];
  }

  createLink(): void {
    if (this.busy()) return;
    this.createError.set('');
    this.success.set('');
    const controls = this.createForm.controls;
    controls.originalUrl.setValue(controls.originalUrl.value.trim());
    controls.customAlias.setValue(controls.customAlias.value.trim());
    controls.expiresAt.updateValueAndValidity();
    if (this.createForm.invalid) { this.createForm.markAllAsTouched(); return; }
    const value = this.createForm.getRawValue();
    const body: CreateUrlRequest = { originalUrl: value.originalUrl };
    if (value.customAlias) body.customAlias = value.customAlias;
    if (value.expiresAt) body.expiresAt = new Date(value.expiresAt).toISOString();
    this.busy.set('create');
    this.api.create(body).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(null)),
    ).subscribe({
      next: created => {
        this.created.set(created);
        this.createForm.reset();
        this.success.set(this.m.created);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          for (const name of ['originalUrl', 'customAlias', 'expiresAt'] as const) {
            const message = error.error?.fieldErrors?.[name];
            if (typeof message === 'string') {
              controls[name].setErrors({ server: message });
              controls[name].markAsTouched();
            }
          }
        }
        this.createError.set(this.problem(error));
      },
    });
  }

  openEditor(link: ShortUrl): void {
    if (this.busy() || this.detailsLoading() !== null) return;
    this.actionError.set('');
    this.detailsLoading.set(link.id);
    this.api.details(link.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.detailsLoading.set(null)),
    ).subscribe({
      next: fresh => {
        this.editing.set(fresh);
        this.editForm.reset({ active: fresh.active, expiresAt: this.localDate(fresh.expiresAt) });
        this.editDialog.nativeElement.showModal();
      },
      error: (error: HttpErrorResponse) => {
        this.actionError.set(this.problem(error));
        if (error.status === 404) this.refresh();
      },
    });
  }
  closeEditor(event?: Event): void {
    if (this.busy()) { event?.preventDefault(); return; }
    this.editDialog.nativeElement.close();
    this.editing.set(null);
  }
  saveEdit(): void {
    const link = this.editing();
    if (!link || !this.canSave || this.busy()) return;
    const value = this.editForm.getRawValue();
    const body: UpdateUrlRequest = {};
    if (value.expiresAt !== this.localDate(link.expiresAt)) {
      const time = new Date(value.expiresAt).getTime();
      if (!value.expiresAt || !Number.isFinite(time) || time <= Date.now()) {
        this.editForm.controls.expiresAt.setErrors({ server: this.m.validation.date });
        this.editForm.controls.expiresAt.markAsTouched();
        return;
      }
      body.expiresAt = new Date(time).toISOString();
    }
    const expiration = body.expiresAt ?? link.expiresAt;
    if (value.active && expiration && new Date(expiration).getTime() <= Date.now()) {
      this.editForm.controls.expiresAt.setErrors({ server: this.m.validation.renew });
      this.editForm.controls.expiresAt.markAsTouched();
      return;
    }
    if (value.active !== link.active || (value.active && this.status(link) === 'EXPIRED')) {
      body.active = value.active;
    }
    if (Object.keys(body).length === 0) return;
    this.busy.set('edit');
    this.actionError.set('');
    this.api.update(link.id, body).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(null)),
    ).subscribe({
      next: () => {
        this.editDialog.nativeElement.close();
        this.editing.set(null);
        this.success.set(this.m.updated);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.actionError.set(this.problem(error));
        const message = error.error?.fieldErrors?.expiresAt;
        if (typeof message === 'string') {
          this.editForm.controls.expiresAt.setErrors({ server: message });
          this.editForm.controls.expiresAt.markAsTouched();
        }
        if (error.status === 404) {
          this.editDialog.nativeElement.close();
          this.editing.set(null);
          this.refresh();
        }
      },
    });
  }

  requestDelete(link: ShortUrl): void {
    if (this.busy() || this.detailsLoading() !== null) return;
    this.deleting.set(link);
    this.actionError.set('');
    this.deleteDialog.nativeElement.showModal();
  }
  closeDelete(event?: Event): void {
    if (this.busy()) { event?.preventDefault(); return; }
    this.deleteDialog.nativeElement.close();
    this.deleting.set(null);
  }
  deleteLink(): void {
    const link = this.deleting();
    if (!link || this.busy()) return;
    this.busy.set('delete');
    this.actionError.set('');
    this.api.delete(link.id).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(null)),
    ).subscribe({
      next: () => {
        this.deleteDialog.nativeElement.close();
        this.deleting.set(null);
        this.success.set(this.m.deleted);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.actionError.set(this.problem(error));
        if (error.status === 404) {
          this.deleteDialog.nativeElement.close();
          this.deleting.set(null);
          this.refresh();
        }
      },
    });
  }
  logout(): void {
    if (this.loggingOut() || this.busy()) return;
    this.loggingOut.set(true);
    this.actionError.set('');
    this.auth.logout().pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loggingOut.set(false)),
    ).subscribe({
      next: () => this.router.navigate(['/login']),
      error: (error: HttpErrorResponse) => {
        this.actionError.set(this.problem(error, this.m.logoutError));
      },
    });
  }
  private localDate(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  private problem(error: HttpErrorResponse, fallback = this.m.errors.default): string {
    if (error.status === 401) {
      if (!this.leaving) {
        this.leaving = true;
        this.auth.clearIdentity();
        this.statistics.set(null);
        this.results.set(null);
        this.created.set(null);
        this.createForm.reset();
        this.editing.set(null);
        this.deleting.set(null);
        this.editDialog?.nativeElement.close();
        this.deleteDialog?.nativeElement.close();
        void this.router.navigate(['/login']);
      }
      return '';
    }
    const errors: Record<string, string> = this.m.errors;
    return errors[String(error.status)] ?? fallback;
  }
}
