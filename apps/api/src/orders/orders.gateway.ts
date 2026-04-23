import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEvents, OrderStatusChangedEvent } from './order-events.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200', 'http://localhost:4000'],
    credentials: true,
  },
})
export class OrdersGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(OrdersGateway.name);
  private subscription?: Subscription;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly events: OrderEvents,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events
      .statusChanged$()
      .subscribe((event) => this.broadcast(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const session = this.extractSession(client);
      if (!session) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<JwtPayload>(session);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true },
      });
      if (!user) {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      client.data.role = user.role;
      await client.join(`user:${user.id}`);
      if (user.role === 'ADMIN') {
        await client.join('admin');
      }
    } catch (err) {
      this.logger.warn(
        `Socket auth rejected: ${(err as Error).message ?? 'unknown'}`,
      );
      client.disconnect(true);
    }
  }

  private broadcast(event: OrderStatusChangedEvent): void {
    const payload = {
      orderId: event.orderId,
      status: event.status,
      timestamp: event.timestamp,
    };
    this.server
      .to(`user:${event.userId}`)
      .emit('order:status:changed', payload);
    this.server.to('admin').emit('order:status:changed', payload);
  }

  private extractSession(client: Socket): string | null {
    const header = client.handshake.headers.cookie;
    if (!header) return null;
    for (const part of header.split(/;\s*/)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      if (part.slice(0, eq) === 'session') {
        return decodeURIComponent(part.slice(eq + 1));
      }
    }
    return null;
  }
}
