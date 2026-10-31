import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CsrfToken, UserResponse } from '../models/auth.model';
import { PageResponse, ShortUrl, UrlStatus } from '../models/dashboard.model';

export interface UsersQuery {
  page: number;
  size: number;
  search: string;
  active: '' | 'true' | 'false';
  role: '' | 'USER' | 'ADMIN';
  sort: string;
}

export interface AdminUrlsQuery {
  page: number;
  size: number;
  search: string;
  status: '' | UrlStatus;
  userId: number | null;
  sort: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  users(query: UsersQuery) {
    let params = this.params(query);
    if (query.active) params = params.set('active', query.active);
    if (query.role) params = params.set('role', query.role);
    return this.http.get<PageResponse<UserResponse>>(`${this.base}/admin/users`, {
      params, withCredentials: true,
    });
  }

  urls(query: AdminUrlsQuery) {
    let params = this.params(query);
    if (query.status) params = params.set('status', query.status);
    if (query.userId !== null) params = params.set('userId', query.userId);
    return this.http.get<PageResponse<ShortUrl>>(`${this.base}/admin/urls`, {
      params, withCredentials: true,
    });
  }

  setActive(userId: number, active: boolean) {
    return this.http.get<CsrfToken>(`${this.base}/auth/csrf`, {
      withCredentials: true,
    }).pipe(switchMap(csrf => this.http.patch<UserResponse>(
      `${this.base}/admin/users/${userId}/status`,
      { active },
      { withCredentials: true, headers: { [csrf.headerName]: csrf.token } },
    )));
  }

  private params(query: { page: number; size: number; sort: string; search: string }) {
    let params = new HttpParams()
      .set('page', query.page).set('size', query.size).set('sort', query.sort);
    if (query.search.trim()) params = params.set('search', query.search.trim());
    return params;
  }
}
