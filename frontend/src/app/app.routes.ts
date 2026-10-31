import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { MessagesService } from './core/i18n/messages';
import { authGuard, guestGuard } from './core/guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    data: { home: true },
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: () => inject(MessagesService).text().titles.login,
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: () => inject(MessagesService).text().titles.register,
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'dashboard',
    title: () => inject(MessagesService).text().titles.dashboard,
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    title: () => inject(MessagesService).text().titles.account,
    loadComponent: () => import('./features/account/account').then(m => m.Account),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { role: 'ADMIN' },
    title: () => inject(MessagesService).text().titles.admin,
    loadComponent: () => import('./features/admin/admin').then(m => m.Admin),
  },
  { path: '**', redirectTo: '' },
];
