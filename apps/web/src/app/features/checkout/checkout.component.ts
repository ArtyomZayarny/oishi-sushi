import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import type { FormArray } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import type { OrderCreateItemReq, OrderCreateReq } from '@org/shared-types';
import {
  e164PhoneValidator,
  postalCodeValidator,
  tipLimitValidator,
} from '@org/ui-kit';

import { OrdersService } from '../../services/orders.service';
import { CartStore } from '../cart/cart.store';

@Component({
  selector: 'app-checkout',
  imports: [CurrencyPipe, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-checkout class="py-8">
      <h1 class="mb-6 text-3xl font-bold tracking-tight">Checkout</h1>

      @if (store.items().length === 0) {
        <p
          data-empty
          class="rounded border border-dashed border-slate-300 p-6 text-center text-slate-500"
        >
          Your cart is empty. Add items from the menu to check out.
        </p>
      } @else {
        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          class="grid gap-6 lg:grid-cols-[2fr_1fr]"
        >
          <div class="space-y-6">
            <fieldset
              formGroupName="customer"
              class="rounded border border-slate-200 p-4"
            >
              <legend class="px-1 text-sm font-semibold text-slate-700">
                Contact
              </legend>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-sm">
                  <span class="text-slate-600">First name</span>
                  <input
                    data-first-name
                    formControlName="firstName"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <label class="text-sm">
                  <span class="text-slate-600">Last name</span>
                  <input
                    data-last-name
                    formControlName="lastName"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <label class="text-sm sm:col-span-2">
                  <span class="text-slate-600"
                    >Phone (E.164, e.g. +14155552671)</span
                  >
                  <input
                    data-phone
                    formControlName="phone"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset
              formGroupName="delivery"
              class="rounded border border-slate-200 p-4"
            >
              <legend class="px-1 text-sm font-semibold text-slate-700">
                Delivery
              </legend>
              <div class="grid gap-3">
                <label class="text-sm">
                  <span class="text-slate-600">Address</span>
                  <input
                    data-address
                    formControlName="address"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <label class="text-sm">
                  <span class="text-slate-600">Postal code (US)</span>
                  <input
                    data-postal
                    formControlName="postalCode"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <label class="text-sm">
                  <span class="text-slate-600">Notes (optional)</span>
                  <input
                    data-notes
                    formControlName="notes"
                    class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset class="rounded border border-slate-200 p-4">
              <legend class="px-1 text-sm font-semibold text-slate-700">
                Item notes
              </legend>
              <ul formArrayName="items" class="divide-y divide-slate-200">
                @for (
                  item of store.items();
                  track item.mealId;
                  let i = $index
                ) {
                  <li [formGroupName]="i" class="py-2 text-sm">
                    <label class="block">
                      <span class="text-slate-600">
                        {{ item.name }} (×{{ item.quantity }})
                      </span>
                      <input
                        data-item-note
                        formControlName="note"
                        placeholder="e.g. no wasabi"
                        class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                      />
                    </label>
                  </li>
                }
              </ul>
            </fieldset>

            <fieldset
              formGroupName="payment"
              class="rounded border border-slate-200 p-4"
            >
              <legend class="px-1 text-sm font-semibold text-slate-700">
                Payment
              </legend>
              <label class="block text-sm">
                <span class="text-slate-600">Tip (cents)</span>
                <input
                  data-tip
                  type="number"
                  min="0"
                  formControlName="tipCents"
                  class="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              @if (form.errors?.['tipExceedsLimit']) {
                <p data-tip-error class="mt-1 text-xs text-red-600">
                  Tip can be at most 50% of the subtotal.
                </p>
              }
            </fieldset>
          </div>

          <aside
            class="h-fit rounded border border-slate-200 bg-slate-50 p-4 text-sm"
          >
            <h2 class="mb-3 text-base font-semibold text-slate-900">
              Order summary
            </h2>
            <dl class="grid gap-1">
              <div class="flex justify-between">
                <dt class="text-slate-500">Subtotal</dt>
                <dd data-subtotal class="font-medium">
                  {{ store.subtotalCents() / 100 | currency: 'USD' }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-slate-500">Tax</dt>
                <dd data-tax class="font-medium">
                  {{ store.taxCents() / 100 | currency: 'USD' }}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-slate-500">Tip</dt>
                <dd data-tip-display class="font-medium">
                  {{ tipCentsValue() / 100 | currency: 'USD' }}
                </dd>
              </div>
              <div
                class="mt-2 flex justify-between border-t border-slate-200 pt-2"
              >
                <dt class="text-base font-semibold text-slate-900">Total</dt>
                <dd data-total class="text-base font-semibold text-slate-900">
                  {{ totalCents() / 100 | currency: 'USD' }}
                </dd>
              </div>
            </dl>
            <button
              type="submit"
              data-submit
              [disabled]="form.invalid"
              class="mt-4 w-full rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Place order
            </button>
          </aside>
        </form>
      }
    </section>
  `,
})
export class CheckoutComponent {
  readonly store = inject(CartStore);
  private readonly fb = inject(FormBuilder);
  private readonly ordersService = inject(OrdersService);
  private readonly router = inject(Router);

  readonly form = this.fb.group(
    {
      customer: this.fb.group({
        firstName: ['', [Validators.required]],
        lastName: ['', [Validators.required]],
        phone: ['', [Validators.required, e164PhoneValidator()]],
      }),
      delivery: this.fb.group({
        address: ['', [Validators.required]],
        postalCode: ['', [Validators.required, postalCodeValidator('US')]],
        notes: [''],
      }),
      payment: this.fb.group({
        tipCents: [0],
      }),
      items: this.fb.array(
        this.store
          .items()
          .map((i) => this.fb.group({ mealId: [i.mealId], note: [''] })),
      ),
    },
    { validators: [tipLimitValidator(() => this.store.subtotalCents())] },
  );

  constructor() {
    effect(() => {
      const items = this.store.items();
      this.syncItemsFormArray(items.map((i) => i.mealId));
      this.form.updateValueAndValidity();
    });
  }

  tipCentsValue(): number {
    const raw = this.form.get('payment.tipCents')?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  totalCents(): number {
    return (
      this.store.subtotalCents() + this.store.taxCents() + this.tipCentsValue()
    );
  }

  submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const cartItems = this.store.items();
    const items: OrderCreateItemReq[] = cartItems.map((cart, idx) => {
      const note = raw.items[idx]?.note?.trim() ?? '';
      return {
        mealId: cart.mealId,
        quantity: cart.quantity,
        itemNote: note.length > 0 ? note : null,
      };
    });
    const notes = raw.delivery.notes?.trim() ?? '';
    const tipCents = this.tipCentsValue();
    const dto: OrderCreateReq = {
      items,
      subtotalCents: this.store.subtotalCents(),
      taxCents: this.store.taxCents(),
      tipCents,
      totalCents: this.store.subtotalCents() + this.store.taxCents() + tipCents,
      deliveryAddress: raw.delivery.address ?? '',
      deliveryPostal: raw.delivery.postalCode ?? '',
      phone: raw.customer.phone ?? '',
      notes: notes.length > 0 ? notes : null,
    };
    this.ordersService.create(dto).subscribe((order) => {
      this.store.clearCart();
      void this.router.navigate(['/orders', order.id]);
    });
  }

  private syncItemsFormArray(mealIds: readonly string[]): void {
    const array = this.form.get('items') as FormArray;
    while (array.length > mealIds.length) array.removeAt(array.length - 1);
    while (array.length < mealIds.length) {
      const idx = array.length;
      array.push(this.fb.group({ mealId: [mealIds[idx]], note: [''] }));
    }
    mealIds.forEach((id, idx) => {
      const ctrl = array.at(idx)?.get('mealId');
      if (ctrl && ctrl.value !== id) ctrl.setValue(id, { emitEvent: false });
    });
  }
}
