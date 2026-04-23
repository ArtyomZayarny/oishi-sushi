import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { OrderStatus } from '@prisma/client';

export interface OrderStatusChangedEvent {
  orderId: string;
  userId: string;
  status: OrderStatus;
  timestamp: string;
}

@Injectable()
export class OrderEvents {
  private readonly subject = new Subject<OrderStatusChangedEvent>();

  emitStatusChanged(event: OrderStatusChangedEvent): void {
    this.subject.next(event);
  }

  statusChanged$(): Observable<OrderStatusChangedEvent> {
    return this.subject.asObservable();
  }
}
