import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const toast = inject(ToastService);
  const platformId = inject(PLATFORM_ID);
  return next(req).pipe(
    catchError((err: unknown) => {
      // Side effects (navigate, toast) only make sense in the browser; on the
      // server they would cause SSR to re-render unrelated routes.
      if (isPlatformBrowser(platformId) && err instanceof HttpErrorResponse) {
        if (err.status === 401 && !isAuthProbe(req.url)) {
          router.navigate(['/auth/login']);
        } else if (err.status >= 500) {
          toast.error('Something went wrong. Please try again.');
        }
      }
      return throwError(() => err);
    }),
  );
};

// /api/auth/me probes auth state on bootstrap; a 401 there just means
// "no session yet" and must not bounce the user to the login page.
const isAuthProbe = (url: string): boolean => /\/auth\/(me|login)$/.test(url);
