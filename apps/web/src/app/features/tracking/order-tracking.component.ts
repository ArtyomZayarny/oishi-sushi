import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { OrderStatus } from '@org/shared-types';

import { OrdersService } from '../../services/orders.service';

const BADGE_CLASSES: Record<OrderStatus, string> = {
  PENDING: 'bg-slate-400 text-white',
  CONFIRMED: 'bg-sky-500 text-white',
  PREPARING: 'bg-amber-500 text-white',
  READY: 'bg-emerald-500 text-white',
  DELIVERED: 'bg-emerald-600 text-white',
  CANCELLED: 'bg-rose-600 text-white',
};

@Component({
  selector: 'app-order-tracking',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-order-tracking class="py-8">
      <header class="mb-4">
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">
          Order #{{ id() }}
        </h1>
        <p class="text-sm text-slate-500">
          Live updates — this page reflects status changes without reload.
        </p>
      </header>

      <span
        data-badge
        [attr.data-flash-key]="flashKey()"
        [class]="badgeClass()"
        class="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-transform"
      >
        {{ status() }}
      </span>
    </section>
  `,
  styles: [
    `
      [data-badge] {
        animation: badge-pop 420ms ease-out;
      }
      @keyframes badge-pop {
        0% {
          transform: scale(1);
        }
        40% {
          transform: scale(1.18);
        }
        100% {
          transform: scale(1);
        }
      }
    `,
  ],
})
export class OrderTrackingComponent {
  private readonly orders = inject(OrdersService);

  readonly id = input.required<string>();
  readonly initialStatus = input<OrderStatus | undefined>('PENDING');

  private readonly flash = signal(0);

  readonly status = linkedSignal<OrderStatus>(
    () => this.initialStatus() ?? 'PENDING',
  );
  readonly flashKey = this.flash.asReadonly();
  readonly badgeClass = computed(() => BADGE_CLASSES[this.status()]);

  constructor() {
    effect(() => {
      const event = this.orders.statusChanges();
      if (!event || event.orderId !== this.id()) return;
      this.status.set(event.status);
      this.flash.update((n) => n + 1);
    });
  }
}
