import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 401) {
          router.navigate(['/auth/login']);
        } else if (err.status >= 500) {
          toast.error('Something went wrong. Please try again.');
        }
      }
      return throwError(() => err);
    }),
  );
};
