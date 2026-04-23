import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import type {
  Order,
  OrderCreateReq,
  OrderStatusEvent,
} from '@org/shared-types';
import type { Observable } from 'rxjs';
import {
  io,
  type Socket,
  type SocketOptions,
  type ManagerOptions,
} from 'socket.io-client';

import { AuthService } from './auth.service';
import { API_BASE_URL } from './menu.service';

type SocketOpts = Partial<ManagerOptions & SocketOptions>;

export interface SocketLike {
  on(event: string, listener: (payload: unknown) => void): unknown;
  disconnect(): unknown;
}

export type SocketFactory = (url?: string, opts?: SocketOpts) => SocketLike;

export const SOCKET_URL = new InjectionToken<string | null>('SOCKET_URL', {
  providedIn: 'root',
  factory: () => null,
});

const defaultSocketFactory: SocketFactory = (url, opts) => {
  const socket: Socket = url ? io(url, opts) : io(opts);
  return socket;
};

export const SOCKET_IO_FACTORY = new InjectionToken<SocketFactory>(
  'SOCKET_IO_FACTORY',
  {
    providedIn: 'root',
    factory: () => defaultSocketFactory,
  },
);

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly socketUrl = inject(SOCKET_URL);
  private readonly socketFactory = inject(SOCKET_IO_FACTORY);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusChanges = signal<OrderStatusEvent | null>(null);
  private socket: SocketLike | null = null;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    effect(() => {
      const user = this.auth.currentUser();
      if (user && !this.socket) {
        this.openSocket();
      } else if (!user && this.socket) {
        this.closeSocket();
      }
    });
    this.destroyRef.onDestroy(() => this.closeSocket());
  }

  create(dto: OrderCreateReq): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders`, dto);
  }

  findOne(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.base}/orders/${id}`);
  }

  private openSocket(): void {
    const opts: SocketOpts = { withCredentials: true };
    const socket = this.socketUrl
      ? this.socketFactory(this.socketUrl, opts)
      : this.socketFactory(undefined, opts);
    socket.on('order:status:changed', (event) => {
      this.statusChanges.set(event as OrderStatusEvent);
    });
    this.socket = socket;
  }

  private closeSocket(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
