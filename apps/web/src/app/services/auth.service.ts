import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import type { AuthResp, LoginReq, User } from '@org/shared-types';
import { catchError, firstValueFrom, of, tap } from 'rxjs';

import { API_BASE_URL } from './menu.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly platformId = inject(PLATFORM_ID);

  readonly currentUser = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  bootstrap(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    return firstValueFrom(
      this.http.get<User>(`${this.base}/auth/me`).pipe(
        tap((user) => this.currentUser.set(user)),
        catchError((err: HttpErrorResponse) => {
          if (err.status !== 401) {
            // Non-auth errors are silent; SPA still renders unauthenticated.
          }
          this.currentUser.set(null);
          return of(null);
        }),
      ),
    ).then(() => undefined);
  }

  login(credentials: LoginReq): Promise<User> {
    return firstValueFrom(
      this.http
        .post<AuthResp>(`${this.base}/auth/login`, credentials)
        .pipe(tap((resp) => this.currentUser.set(resp.user))),
    ).then((resp) => resp.user);
  }
}
