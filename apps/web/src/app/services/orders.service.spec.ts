import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OrderStatusEvent, User } from '@org/shared-types';

import { AuthService } from './auth.service';
import {
  OrdersService,
  SOCKET_IO_FACTORY,
  SOCKET_URL,
  type SocketFactory,
} from './orders.service';

class FakeSocket {
  disconnect = jest.fn();
  private handlers = new Map<string, (payload: unknown) => void>();
  on = jest.fn((event: string, handler: (payload: unknown) => void) => {
    this.handlers.set(event, handler);
    return this;
  });
  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

const USER: User = {
  id: 'u1',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  role: 'CUSTOMER',
  createdAt: '2026-04-24T00:00:00Z',
};

interface Harness {
  service: OrdersService;
  auth: AuthService;
  http: HttpTestingController;
  factory: jest.Mock & SocketFactory;
  sockets: FakeSocket[];
}

const setup = (socketUrl: string | null = null): Harness => {
  const sockets: FakeSocket[] = [];
  const factory = jest.fn(() => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  }) as unknown as jest.Mock & SocketFactory;

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: SOCKET_URL, useValue: socketUrl },
      { provide: SOCKET_IO_FACTORY, useValue: factory },
    ],
  });

  const service = TestBed.inject(OrdersService);
  const auth = TestBed.inject(AuthService);
  const http = TestBed.inject(HttpTestingController);
  return { service, auth, http, factory, sockets };
};

describe('OrdersService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  describe('create', () => {
    it('POSTs to /api/orders with the order dto', () => {
      const { service, http } = setup();
      service
        .create({
          items: [{ mealId: 'm1', quantity: 2 }],
          subtotalCents: 1000,
          taxCents: 150,
          tipCents: 0,
          totalCents: 1150,
          deliveryAddress: '1 Main',
          deliveryPostal: '12345',
          phone: '+15555555555',
        })
        .subscribe();
      const req = http.expectOne('/api/orders');
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'o1' });
      http.verify();
    });
  });

  describe('socket lifecycle (driven by AuthService.currentUser)', () => {
    it('does not open a socket when no user is authenticated', () => {
      const { factory } = setup();
      TestBed.flushEffects();
      expect(factory).not.toHaveBeenCalled();
    });

    it('opens a socket via the injected factory when a user becomes authenticated', () => {
      const { auth, factory } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('passes withCredentials: true in socket options', () => {
      const { auth, factory } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      const opts = factory.mock.calls[0][1] as Record<string, unknown>;
      expect(opts).toEqual(expect.objectContaining({ withCredentials: true }));
    });

    it('passes the SOCKET_URL to the factory when provided', () => {
      const { auth, factory } = setup('http://api.local:4000');
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      expect(factory.mock.calls[0][0]).toBe('http://api.local:4000');
    });

    it('disconnects the socket when the user logs out', () => {
      const { auth, sockets } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      const first = sockets[0];
      auth.currentUser.set(null);
      TestBed.flushEffects();
      expect(first.disconnect).toHaveBeenCalledTimes(1);
    });

    it('does not open a second socket while one is already open', () => {
      const { auth, factory } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      auth.currentUser.set({ ...USER, firstName: 'Changed' });
      TestBed.flushEffects();
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('statusChanges signal', () => {
    it('is null before any event', () => {
      const { service } = setup();
      expect(service.statusChanges()).toBeNull();
    });

    it('emits the payload from order:status:changed events', () => {
      const { service, auth, sockets } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      const event: OrderStatusEvent = {
        orderId: 'o1',
        userId: 'u1',
        status: 'CONFIRMED',
        timestamp: '2026-04-24T00:00:00Z',
      };
      sockets[0].emit('order:status:changed', event);
      expect(service.statusChanges()).toEqual(event);
    });

    it('reflects the most recent event', () => {
      const { service, auth, sockets } = setup();
      auth.currentUser.set(USER);
      TestBed.flushEffects();
      sockets[0].emit('order:status:changed', {
        orderId: 'o1',
        userId: 'u1',
        status: 'CONFIRMED',
        timestamp: '2026-04-24T00:00:00Z',
      });
      sockets[0].emit('order:status:changed', {
        orderId: 'o1',
        userId: 'u1',
        status: 'DELIVERED',
        timestamp: '2026-04-24T00:05:00Z',
      });
      expect(service.statusChanges()?.status).toBe('DELIVERED');
    });
  });
});
