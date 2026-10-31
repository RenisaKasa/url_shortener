import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CsrfToken } from '../models/auth.model';
import {
  CreateUrlRequest,
  CreateUrlResponse,
  DashboardStatistics,
  PageResponse,
  ShortUrl,
  UpdateUrlRequest,
  UrlQuery,
} from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  statistics() {
    return this.http.get<DashboardStatistics>(`${this.base}/dashboard/statistics`, {
      withCredentials: true,
    });
  }

  list(query: UrlQuery) {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort);

    if (query.search.trim()) {
      params = params.set('search', query.search.trim());
    }

    if (query.status) {
      params = params.set('status', query.status);
    }

    return this.http.get<PageResponse<ShortUrl>>(`${this.base}/urls`, {
      params,
      withCredentials: true,
    });
  }

  details(id: number) {
    return this.http.get<ShortUrl>(`${this.base}/urls/${id}`, {
      withCredentials: true,
    });
  }

  create(body: CreateUrlRequest) {
    return this.write<CreateUrlResponse>('POST', '/urls', body);
  }

  update(id: number, body: UpdateUrlRequest) {
    return this.write<ShortUrl>('PATCH', `/urls/${id}`, body);
  }

  delete(id: number) {
    return this.write<void>('DELETE', `/urls/${id}`);
  }

  private write<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    return this.http
      .get<CsrfToken>(`${this.base}/auth/csrf`, {
        withCredentials: true,
      })
      .pipe(
        switchMap((csrf) =>
          this.http.request<T>(method, `${this.base}${path}`, {
            body,
            withCredentials: true,
            headers: { [csrf.headerName]: csrf.token },
          }),
        ),
      );
  }
}
