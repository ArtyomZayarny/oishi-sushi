import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  SommelierAskRequest,
  SommelierAskResponse,
} from '@org/shared-types';

import {
  SOMMELIER_CLIENT_TIMEOUT_MS,
  SommelierError,
  SommelierService,
} from './sommelier.service';

const ANSWER: SommelierAskResponse = {
  answer: 'The Spicy Tuna Roll [1] brings the heat you asked for.',
  recommendations: [
    {
      mealId: 'cm_str',
      name: 'Spicy Tuna Roll',
      priceCents: 1290,
      imageUrl: '/img/str.jpg',
      why: 'Sriracha-marinated tuna — the spiciest tuna item on the menu.',
    },
  ],
  sources: [{ type: 'menu', ref: 'cm_str' }],
  confidence: 'high',
  requestId: 'req_01H',
};

interface Harness {
  service: SommelierService;
  http: HttpTestingController;
}

const setup = (): Harness => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    service: TestBed.inject(SommelierService),
    http: TestBed.inject(HttpTestingController),
  };
};

describe('SommelierService (T10)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('ask() — typed POST /api/sommelier', () => {
    it('POSTs the request body to /api/sommelier and emits the typed response', () => {
      const { service, http } = setup();
      const req: SommelierAskRequest = {
        query: 'something spicy with tuna',
        avoidAllergens: ['shellfish'],
      };

      let result: SommelierAskResponse | undefined;
      service.ask(req).subscribe((r) => (result = r));

      const httpReq = http.expectOne('/api/sommelier');
      expect(httpReq.request.method).toBe('POST');
      expect(httpReq.request.body).toEqual(req);
      httpReq.flush(ANSWER);

      expect(result).toEqual(ANSWER);
      http.verify();
    });

    it('targets the same-origin relative /api base (no absolute host)', () => {
      const { service, http } = setup();
      service.ask({ query: 'hi' }).subscribe();
      const httpReq = http.expectOne('/api/sommelier');
      expect(httpReq.request.url).toBe('/api/sommelier');
      httpReq.flush(ANSWER);
      http.verify();
    });
  });

  describe('error mapping → SommelierError', () => {
    it('maps an HTTP 503 to a SommelierError of kind "http" carrying the status', () => {
      const { service, http } = setup();
      let err: unknown;
      service.ask({ query: 'hi' }).subscribe({ error: (e) => (err = e) });

      http
        .expectOne('/api/sommelier')
        .flush(
          { statusCode: 503, error: 'SOMMELIER_UNAVAILABLE', message: 'x' },
          { status: 503, statusText: 'Service Unavailable' },
        );

      expect(err).toBeInstanceOf(SommelierError);
      expect((err as SommelierError).kind).toBe('http');
      expect((err as SommelierError).status).toBe(503);
      http.verify();
    });

    it('maps a network failure to a SommelierError of kind "http"', () => {
      const { service, http } = setup();
      let err: unknown;
      service.ask({ query: 'hi' }).subscribe({ error: (e) => (err = e) });

      http
        .expectOne('/api/sommelier')
        .error(new ProgressEvent('network error'));

      expect(err).toBeInstanceOf(SommelierError);
      expect((err as SommelierError).kind).toBe('http');
      http.verify();
    });
  });

  describe('30s client timeout (F7-AC2)', () => {
    it('emits a SommelierError of kind "timeout" when the request hangs past 30s', () => {
      const { service, http } = setup();
      let err: unknown;
      service.ask({ query: 'hi' }).subscribe({ error: (e) => (err = e) });

      // request is in flight but never flushed
      http.expectOne('/api/sommelier');
      jest.advanceTimersByTime(SOMMELIER_CLIENT_TIMEOUT_MS);

      expect(err).toBeInstanceOf(SommelierError);
      expect((err as SommelierError).kind).toBe('timeout');
    });

    it('does NOT time out when the response arrives before 30s', () => {
      const { service, http } = setup();
      let result: SommelierAskResponse | undefined;
      let err: unknown;
      service
        .ask({ query: 'hi' })
        .subscribe({ next: (r) => (result = r), error: (e) => (err = e) });

      jest.advanceTimersByTime(SOMMELIER_CLIENT_TIMEOUT_MS - 1);
      http.expectOne('/api/sommelier').flush(ANSWER);

      expect(result).toEqual(ANSWER);
      expect(err).toBeUndefined();
    });

    it('pins the client timeout to 30000ms', () => {
      expect(SOMMELIER_CLIENT_TIMEOUT_MS).toBe(30000);
    });
  });
});
