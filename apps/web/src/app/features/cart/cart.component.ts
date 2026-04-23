import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartStore } from './cart.store';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-cart class="py-8">
      <header class="mb-6 flex items-baseline justify-between">
        <h1 class="text-3xl font-bold tracking-tight">Your cart</h1>
        @if (store.totalQuantity() > 0) {
          <button
            type="button"
            data-clear
            class="text-sm text-slate-500 underline hover:text-slate-900"
            (click)="store.clearCart()"
          >
            Clear cart
          </button>
        }
      </header>

      @if (store.items().length) {
        <ul class="divide-y divide-slate-200 rounded border border-slate-200">
          @for (item of store.items(); track item.mealId) {
            <li
              data-cart-item
              [attr.data-meal-id]="item.mealId"
              class="flex items-center gap-4 p-4"
            >
              @if (item.imageUrl) {
                <img
                  [src]="item.imageUrl"
                  [alt]="item.name"
                  class="h-14 w-14 rounded object-cover"
                />
              }
              <div class="flex-1">
                <p class="font-medium text-slate-900">{{ item.name }}</p>
                <p class="text-sm text-slate-500">
                  {{ item.priceCents / 100 | currency: 'USD' }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  data-dec
                  class="h-8 w-8 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                  (click)="store.updateQty(item.mealId, item.quantity - 1)"
                >
                  −
                </button>
                <span data-qty class="w-8 text-center font-medium">
                  {{ item.quantity }}
                </span>
                <button
                  type="button"
                  data-inc
                  class="h-8 w-8 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                  (click)="store.updateQty(item.mealId, item.quantity + 1)"
                >
                  +
                </button>
                <button
                  type="button"
                  data-remove
                  class="ml-2 text-sm text-slate-500 underline hover:text-slate-900"
                  (click)="store.removeItem(item.mealId)"
                >
                  Remove
                </button>
              </div>
            </li>
          }
        </ul>

        <dl
          class="mt-6 grid gap-1 rounded border border-slate-200 bg-slate-50 p-4 text-sm"
        >
          <div class="flex justify-between">
            <dt class="text-slate-500">Subtotal</dt>
            <dd data-subtotal class="font-medium">
              {{ store.subtotalCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-slate-500">Tax (15%)</dt>
            <dd data-tax class="font-medium">
              {{ store.taxCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2">
            <dt class="text-base font-semibold text-slate-900">Total</dt>
            <dd data-grand-total class="text-base font-semibold text-slate-900">
              {{ store.grandTotalCents() / 100 | currency: 'USD' }}
            </dd>
          </div>
        </dl>
      } @else {
        <p
          data-empty
          class="rounded border border-dashed border-slate-300 p-6 text-center text-slate-500"
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
