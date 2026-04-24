import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ArrowUp, LucideAngularModule } from 'lucide-angular';

import { CartStore } from '../../../../features/cart/cart.store';

const LOADING_MS = 1500;
const DELIVERY_ETA_MIN = 40;

@Component({
  selector: 'app-sommelier-input',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block w-full">
      <div class="mb-4 flex items-baseline gap-[36px]">
        <span
          data-label
          class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
        >
          — SOMMELIER AI
        </span>
        <span
          data-tagline
          class="text-[11px] italic text-[var(--text-secondary)]"
        >
          Ask what’s freshest tonight, what pairs with sake, what to try first.
        </span>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <label for="kenji" class="sr-only">Ask the sommelier</label>
        <div
          class="flex h-[50px] w-full items-center gap-4 rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] px-4 transition-colors duration-150 focus-within:border-[var(--amber)]"
        >
          <span
            aria-hidden="true"
            class="block h-[5.66px] w-[5.66px] shrink-0 rotate-45 bg-[var(--amber)]"
          ></span>
          <input
            id="kenji"
            data-kenji-input
            type="text"
            formControlName="query"
            [placeholder]="placeholder"
            class="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:italic placeholder:text-[var(--text-secondary)] focus:outline-none"
          />
          <button
            data-send-button
            type="submit"
            [disabled]="loading()"
            aria-label="Send"
            class="flex h-8 w-10 items-center justify-center rounded-[2px] bg-[var(--amber)] disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
          >
            @if (loading()) {
              <span
                data-ellipsis
                class="text-[14px] leading-none text-[var(--text-primary)]"
                >…</span
              >
            } @else {
              <lucide-icon
                [img]="ArrowUp"
                [size]="16"
                [strokeWidth]="1.5"
                class="text-[var(--text-primary)]"
              />
            }
          </button>
        </div>
      </form>

      <div
        class="mt-2 flex items-baseline justify-between text-[10px] text-[var(--text-secondary)]"
      >
        <span data-meta>{{ metaLine() }}</span>
        <span data-powered-by>Powered by Oishi AI</span>
      </div>
    </div>
  `,
})
export class SommelierInputComponent {
  private readonly cart = inject(CartStore);

  readonly ArrowUp = ArrowUp;
  readonly placeholder =
    'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';

  readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });
  readonly loading = signal(false);

  readonly metaLine = computed(() => {
    const count = this.cart.totalQuantity();
    if (count === 0) {
      return `Your cart is empty · delivery in ${DELIVERY_ETA_MIN} min`;
    }
    const totalDollars = (this.cart.grandTotalCents() / 100).toFixed(2);
    const noun = count === 1 ? 'item' : 'items';
    return `Your order: ${count} ${noun} · $${totalDollars} · delivery in ${DELIVERY_ETA_MIN} min`;
  });

  onSubmit(): void {
    if (this.loading()) return;
    const query = this.form.controls.query.value.trim();
    if (!query) return;

    console.info('[sommelier:stub]', query);
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.form.reset();
    }, LOADING_MS);
  }
}
