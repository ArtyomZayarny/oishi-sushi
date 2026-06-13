import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  SommelierAskRequest,
  SommelierAskResponse,
} from '@org/shared-types';
import {
  catchError,
  type Observable,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';

import { API_BASE_URL } from './menu.service';

/**
 * Client-side ceiling on a single sommelier request. The server enforces a
 * shorter 25s timeout (spec §7.5) and returns a 503 before this fires; this is
 * the network-hang fallback only.
 */
export const SOMMELIER_CLIENT_TIMEOUT_MS = 30000;

export type SommelierErrorKind = 'http' | 'timeout';

/**
 * Typed failure surfaced by {@link SommelierService.ask}. The component maps
 * this to the `error` state; `kind` distinguishes an upstream/HTTP failure from
 * a client-side timeout, and `status` carries the HTTP code when present.
 */
export class SommelierError extends Error {
  constructor(
    readonly kind: SommelierErrorKind,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(`sommelier request failed (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'SommelierError';
  }
}

@Injectable({ providedIn: 'root' })
export class SommelierService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * POST a grounded question to `/api/sommelier`. Same-origin relative URL so
   * SSR and the browser share one path. Times out client-side after
   * {@link SOMMELIER_CLIENT_TIMEOUT_MS}; HTTP and timeout failures are mapped to
   * a typed {@link SommelierError}.
   */
  ask(req: SommelierAskRequest): Observable<SommelierAskResponse> {
    return this.http
      .post<SommelierAskResponse>(`${this.base}/sommelier`, req)
      .pipe(
        timeout(SOMMELIER_CLIENT_TIMEOUT_MS),
        catchError((err: unknown) => throwError(() => this.toTyped(err))),
      );
  }

  private toTyped(err: unknown): SommelierError {
    if (err instanceof HttpErrorResponse) {
      // Network failures arrive here too, as status 0.
      return new SommelierError('http', err.status, err);
    }
    if (err instanceof TimeoutError) {
      return new SommelierError('timeout', undefined, err);
    }
    // Defensive: any other failure is treated as a non-status http error.
    return new SommelierError('http', undefined, err);
  }
}
