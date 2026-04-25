import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-cart>
      <header class="mb-8 flex items-baseline justify-between">
        <h1
          class="font-display text-[32px] font-light tracking-[-0.01em] text-[var(--text-primary)] sm:text-[40px]"
        >
          Your cart
        </h1>
        @if (store.totalQuantity() > 0) {
          <button
            type="button"
            data-clear
            class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--amber)]"
            (click)="store.clearCart()"
          >
            Clear cart
          </button>
        }
      </header>

      @if (store.items().length) {
        <ul class="flex flex-col gap-3 sm:gap-4">
          @for (item of store.items(); track item.mealId) {
            <li
              data-cart-item
              [attr.data-meal-id]="item.mealId"
              class="flex items-center gap-4 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] p-3 sm:p-4"
            >
              @if (item.imageUrl) {
                <img
                  [src]="item.imageUrl"
                  [alt]="item.name"
                  class="h-16 w-16 shrink-0 rounded-[2px] object-cover sm:h-20 sm:w-20"
                />
              }
              <div class="min-w-0 flex-1">
                <p
                  class="font-display truncate text-[16px] font-light leading-tight tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]"
                >
                  {{ item.name }}
                </p>
                <p
                  class="font-display tabular mt-1 text-[14px] font-medium text-[var(--amber)]"
                >
                  {{ item.priceCents / 100 | currency: 'USD' }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  data-dec
                  aria-label="Decrease quantity"
                  class="h-9 w-9 rounded-[2px] border border-[var(--hairline)] text-[16px] text-[var(--text-primary)] transition-colors hover:border-[var(--amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
                  (click)="store.updateQty(item.mealId, item.quantity - 1)"
                >
                  −
                </button>
                <span
                  data-qty
                  class="font-display tabular w-6 text-center text-[14px] font-medium text-[var(--text-primary)]"
                >
                  {{ item.quantity }}
                </span>
                <button
                  type="button"
                  data-inc
                  aria-label="Increase quantity"
                  class="h-9 w-9 rounded-[2px] border border-[var(--hairline)] text-[16px] text-[var(--text-primary)] transition-colors hover:border-[var(--amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
                  (click)="store.updateQty(item.mealId, item.quantity + 1)"
                >
                  +
                </button>
                <button
                  type="button"
                  data-remove
                  class="ml-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--amber)]"
                  (click)="store.removeItem(item.mealId)"
                >
                  Remove
                </button>
              </div>
            </li>
          }
        </ul>

        <dl
          class="mt-8 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] p-5 sm:p-6"
        >
          <div class="flex items-baseline justify-between text-[12px]">
            <dt class="text-[var(--text-secondary)]">Subtotal</dt>
            <dd
              data-subtotal
              class="font-display tabular text-[var(--text-primary)]"
            >
              {{ store.subtotalCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
          <div class="mt-2 flex items-baseline justify-between text-[12px]">
            <dt class="text-[var(--text-secondary)]">Tax (15%)</dt>
            <dd
              data-tax
              class="font-display tabular text-[var(--text-primary)]"
            >
              {{ store.taxCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
          <div
            class="mt-4 flex items-baseline justify-between border-t border-[var(--hairline)] pt-4"
          >
            <dt
              class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
            >
              — Total
            </dt>
            <dd
              data-grand-total
              class="font-display tabular text-[20px] font-medium text-[var(--amber)] sm:text-[22px]"
            >
              {{ store.grandTotalCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
        </dl>
      } @else {
        <p
          data-empty
          class="rounded-[2px] border border-dashed border-[var(--hairline)] p-8 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]"
        >
          Your cart is empty. Browse the menu to add items.
        </p>
      }
    </section>
  `,
})
export class CartComponent {
  readonly store = inject(CartStore);
}
