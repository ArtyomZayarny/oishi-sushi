import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import type { User } from '@org/shared-types';

import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

const CUSTOMER: User = {
  id: 'u1',
  email: 'c@example.com',
  firstName: 'Cust',
  lastName: 'One',
  role: 'CUSTOMER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('authGuard', () => {
  let currentUser: ReturnType<typeof signal<User | null>>;
  let loginTree: UrlTree;
  let parseUrl: jest.Mock;

  beforeEach(() => {
    currentUser = signal<User | null>(null);
    loginTree = {} as UrlTree;
    parseUrl = jest.fn((url: string) =>
      url === '/auth/login' ? loginTree : ({} as UrlTree),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: Router, useValue: { parseUrl } },
      ],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      authGuard(
        {} as import('@angular/router').ActivatedRouteSnapshot,
        {} as import('@angular/router').RouterStateSnapshot,
      ),
    );

  it('returns the /auth/login UrlTree when user is null', () => {
    const result = run();
    expect(parseUrl).toHaveBeenCalledWith('/auth/login');
    expect(result).toBe(loginTree);
  });

  it('returns true when user is authenticated', () => {
    currentUser.set(CUSTOMER);
    const result = run();
    expect(result).toBe(true);
    expect(parseUrl).not.toHaveBeenCalled();
  });
});
