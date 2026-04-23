import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds withCredentials: true to every request', () => {
    http.get('/api/auth/me').subscribe();
    const req = httpMock.expectOne('/api/auth/me');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('adds withCredentials: true to POST requests', () => {
    http.post('/api/orders', { foo: 'bar' }).subscribe();
    const req = httpMock.expectOne('/api/orders');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });
});
