export interface DashboardStatistics {
  totalUrls: number;
  activeUrls: number;
  expiredUrls: number;
  totalClicks: number;
}

export type UrlStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export interface ShortUrl {
  id: number;
  originalUrl: string;
  shortCode: string;
  userId: number;
  active: boolean;
  expiresAt: string | null;
  clickCount: number;
  lastAccessedAt: string | null;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface UrlQuery {
  page: number;
  size: number;
  search: string;
  status: UrlStatus | '';
  sort: string;
}

export interface CreateUrlRequest {
  originalUrl: string;
  customAlias?: string;
  expiresAt?: string;
}

export interface CreateUrlResponse {
  id: number;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  expiresAt: string | null;
}

export interface UpdateUrlRequest {
  active?: boolean;
  expiresAt?: string;
}
