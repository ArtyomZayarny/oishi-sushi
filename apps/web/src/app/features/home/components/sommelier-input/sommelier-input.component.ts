import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type {
  SommelierAskResponse,
  SommelierConfidence,
} from '@org/shared-types';
import { ArrowUp, LucideAngularModule } from 'lucide-angular';

import { CartStore } from '../../../../features/cart/cart.store';
import {
  SommelierError,
  SommelierService,
} from '../../../../services/sommelier.service';

const DELIVERY_ETA_MIN = 40;

/** UI journey states (spec §5 F7). `answer` vs `abstain` is driven by the
 *  response `confidence`: `'abstain'` ⇒ abstain, otherwise answer. */
export type SommelierStatus =
  | 'idle'
  | 'loading'
  | 'answer'
  | 'abstain'
  | 'error';

@Component({
  selector: 'app-sommelier-input',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block w-full">
      @if (variant() === 'full') {
        <div
          class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-9"
        >
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
            Ask what’s freshest tonight, what pairs with sake, what to try
            first.
          </span>
        </div>
      }

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

      @if (variant() === 'full') {
        <div
          class="mt-2 flex items-baseline justify-between text-[10px] text-[var(--text-secondary)]"
        >
          <span data-meta>{{ metaLine() }}</span>
          <span data-powered-by>Powered by Oishi AI</span>
        </div>
      }
    </div>
  `,
})
export class SommelierInputComponent {
  private readonly cart = inject(CartStore);
  private readonly sommelier = inject(SommelierService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ArrowUp = ArrowUp;
  readonly placeholder =
    'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';
  readonly variant = input<'full' | 'compact'>('full');

  readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });

  /** State machine (spec §5 F7). The template binds `loading`; T11 consumes
   *  `status` / `response` / `error` to render the answer panel + states. */
  readonly status = signal<SommelierStatus>('idle');
  readonly response = signal<SommelierAskResponse | null>(null);
  readonly error = signal<SommelierError | null>(null);
  /** True exactly while the HTTP request is in flight (F7-AC1). */
  readonly loading = computed(() => this.status() === 'loading');

  /** The query backing the current in-flight/last request — retry re-issues
   *  THIS, not the live input box (F7-AC2). */
  private lastQuery = '';

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
    this.run(query);
  }

  /** Re-issue the same query that failed (F7-AC2). No-op unless in error. */
  retry(): void {
    if (this.status() !== 'error') return;
    if (!this.lastQuery) return;
    this.run(this.lastQuery);
  }

  private run(query: string): void {
    this.lastQuery = query;
    this.error.set(null);
    this.status.set('loading');

    this.sommelier
      .ask({ query })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.response.set(res);
          this.status.set(this.stateFor(res.confidence));
        },
        error: (err: SommelierError) => {
          this.error.set(err);
          this.status.set('error');
        },
      });
  }

  private stateFor(confidence: SommelierConfidence): SommelierStatus {
    return confidence === 'abstain' ? 'abstain' : 'answer';
  }
}
