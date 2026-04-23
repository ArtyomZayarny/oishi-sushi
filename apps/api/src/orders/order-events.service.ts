import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { OrderStatusEvent } from '@org/shared-types';

@Injectable()
export class OrderEvents {
  private readonly subject = new Subject<OrderStatusEvent>();

  emitStatusChanged(event: OrderStatusEvent): void {
    this.subject.next(event);
  }

  statusChanged$(): Observable<OrderStatusEvent> {
    return this.subject.asObservable();
  }
}
