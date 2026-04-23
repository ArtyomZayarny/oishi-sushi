import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import type { User } from '@org/shared-types';

import { AuthService } from '../services/auth.service';
import { adminGuard } from './admin.guard';

const CUSTOMER: User = {
  id: 'u1',
  email: 'c@example.com',
  firstName: 'Cust',
  lastName: 'One',
  role: 'CUSTOMER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const ADMIN: User = {
  ...CUSTOMER,
  id: 'u2',
  email: 'a@example.com',
  role: 'ADMIN',
};

describe('adminGuard', () => {
  let currentUser: ReturnType<typeof signal<User | null>>;
  let rootTree: UrlTree;
  let parseUrl: jest.Mock;

  beforeEach(() => {
    currentUser = signal<User | null>(null);
    rootTree = {} as UrlTree;
    parseUrl = jest.fn((url: string) =>
      url === '/' ? rootTree : ({} as UrlTree),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { currentUser } },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      adminGuard(
        {} as import('@angular/router').ActivatedRouteSnapshot,
        {} as import('@angular/router').RouterStateSnapshot,
      ),
    );

  it('returns the / UrlTree when user is null', () => {
    const result = run();
    expect(parseUrl).toHaveBeenCalledWith('/');
    expect(result).toBe(rootTree);
  });

  it('returns the / UrlTree when user is a non-admin', () => {
    currentUser.set(CUSTOMER);
    const result = run();
    expect(parseUrl).toHaveBeenCalledWith('/');
    expect(result).toBe(rootTree);
  });

  it('returns true when user role is ADMIN', () => {
    currentUser.set(ADMIN);
    const result = run();
    expect(result).toBe(true);
    expect(parseUrl).not.toHaveBeenCalled();
  });

  it('returns true (defers to client) when running on the server', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: AuthService, useValue: { currentUser } },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
    const result = TestBed.runInInjectionContext(() =>
      adminGuard(
        {} as import('@angular/router').ActivatedRouteSnapshot,
        {} as import('@angular/router').RouterStateSnapshot,
      ),
    );
    expect(result).toBe(true);
    expect(parseUrl).not.toHaveBeenCalled();
  });
});
