import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { ToastService } from '../services/toast.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let navigate: jest.Mock;
  let toastError: jest.Mock;

  beforeEach(() => {
    navigate = jest.fn();
    toastError = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: { navigate } },
        { provide: ToastService, useValue: { error: toastError } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('redirects to /auth/login on 401 for protected endpoints', () => {
    http.get('/api/orders/abc').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/orders/abc')
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does not redirect on 401 from /auth/me (bootstrap probe)', () => {
    http.get('/api/auth/me').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/auth/me')
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does not redirect on 401 from /auth/login (let the form show the error)', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/auth/login')
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows toast on 5xx', () => {
    http.get('/api/menu').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/menu')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect or toast on 4xx other than 401', () => {
    http.get('/api/admin/menu').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/admin/menu')
      .flush(
        { message: 'forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('rethrows the error so callers can handle it', () => {
    const errSpy = jest.fn();
    http.get('/api/menu').subscribe({ error: errSpy });
    httpMock
      .expectOne('/api/menu')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(errSpy).toHaveBeenCalled();
  });

  describe('on the server', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      navigate = jest.fn();
      toastError = jest.fn();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([errorInterceptor])),
          provideHttpClientTesting(),
          { provide: PLATFORM_ID, useValue: 'server' },
          { provide: Router, useValue: { navigate } },
          { provide: ToastService, useValue: { error: toastError } },
        ],
      });
      http = TestBed.inject(HttpClient);
      httpMock = TestBed.inject(HttpTestingController);
    });

    it('does not navigate or toast (side effects belong on the client)', () => {
      http.get('/api/orders/abc').subscribe({ error: () => undefined });
      httpMock
        .expectOne('/api/orders/abc')
        .flush(
          { message: 'nope' },
          { status: 401, statusText: 'Unauthorized' },
        );
      http.get('/api/menu').subscribe({ error: () => undefined });
      httpMock
        .expectOne('/api/menu')
        .flush(
          { message: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );
      expect(navigate).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
    });
  });
});
