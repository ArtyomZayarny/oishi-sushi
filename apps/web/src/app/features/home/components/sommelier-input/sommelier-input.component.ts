import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  SommelierAskResponse,
  SommelierConfidence,
  SommelierMealRef,
} from '@org/shared-types';
import { ArrowUp, LucideAngularModule, X } from 'lucide-angular';

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
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink],
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

      <!-- Allergen chips (select-only; F4-AC5) -->
      @if (menuAllergens().length > 0) {
        <div
          data-allergen-chips
          class="mt-2.5 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Exclude allergens"
        >
          <span
            class="mr-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]"
          >
            Avoid
          </span>
          @for (allergen of menuAllergens(); track allergen) {
            <button
              data-allergen-chip
              type="button"
              [attr.aria-pressed]="isAllergenSelected(allergen)"
              (click)="toggleAllergen(allergen)"
              [class]="
                isAllergenSelected(allergen)
                  ? 'rounded-full border border-[var(--amber)] bg-[var(--amber)] px-2.5 py-1 text-[11px] font-medium text-[var(--canvas)] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]'
                  : 'rounded-full border border-[var(--hairline)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]'
              "
            >
              {{ allergen }}
            </button>
          }
        </div>
      }

      @if (variant() === 'full') {
        <div
          class="mt-2 flex items-baseline justify-between text-[10px] text-[var(--text-secondary)]"
        >
          <span data-meta>{{ metaLine() }}</span>
          <span data-powered-by>Powered by Oishi AI</span>
        </div>
      }
    </div>

    <!-- ===================== Answer panel (Option A) ===================== -->
    @if (panelOpen()) {
      <!-- Scrim: click-to-dismiss. Composed from --canvas + opacity. -->
      <button
        data-panel-scrim
        type="button"
        aria-label="Close Kenji"
        tabindex="-1"
        (click)="dismiss()"
        [class]="
          variant() === 'full'
            ? 'fixed inset-0 z-20 cursor-default bg-[var(--canvas)]/70'
            : 'fixed inset-0 z-30 cursor-default bg-[var(--canvas)]/70'
        "
      ></button>

      <section
        data-sommelier-panel
        role="dialog"
        aria-modal="true"
        aria-label="Kenji’s recommendation"
        [class]="
          variant() === 'full'
            ? 'fixed inset-x-10 bottom-[120px] z-30 flex max-h-[560px] flex-col overflow-hidden rounded-[3px] border border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_-8px_40px_rgba(0,0,0,0.45)]'
            : 'fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-t-[12px] border-t border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_-8px_40px_rgba(0,0,0,0.45)]'
        "
      >
        <!-- Panel header -->
        <div
          class="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-5 py-3"
        >
          <span
            class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
          >
            — KENJI
          </span>
          <button
            data-panel-close
            type="button"
            aria-label="Close"
            (click)="dismiss()"
            class="flex h-8 w-8 items-center justify-center rounded-[2px] text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
          >
            <lucide-icon [img]="X" [size]="16" [strokeWidth]="1.5" />
          </button>
        </div>

        <!-- Panel body (scrolls) -->
        <div
          class="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          [style.padding-bottom]="
            variant() === 'compact'
              ? 'max(16px, env(safe-area-inset-bottom))'
              : null
          "
        >
          @switch (status()) {
            @case ('loading') {
              <div data-panel-loading aria-live="polite">
                <p
                  class="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]"
                >
                  KENJI IS THINKING…
                </p>
                <div
                  [class]="
                    variant() === 'full'
                      ? 'mt-4 flex gap-4'
                      : 'mt-4 flex flex-col gap-3'
                  "
                >
                  @for (n of skeletonSlots; track n) {
                    <div
                      class="h-[120px] w-full animate-pulse rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] sm:w-[260px]"
                    ></div>
                  }
                </div>
              </div>
            }

            @case ('error') {
              <div data-panel-error aria-live="assertive" class="py-4">
                <p class="text-[14px] text-[var(--text-primary)]">
                  {{ errorCopy() }}
                </p>
                <button
                  data-retry-button
                  type="button"
                  (click)="retry()"
                  class="mt-4 rounded-[2px] bg-[var(--amber)] px-4 py-2 text-[12px] font-medium text-[var(--canvas)] transition-colors duration-150 hover:bg-[var(--amber-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
                >
                  Try again
                </button>
              </div>
            }

            @case ('abstain') {
              <div data-panel-abstain class="py-2">
                <p
                  data-answer-text
                  class="text-[14px] leading-relaxed text-[var(--text-primary)]"
                >
                  {{ response()?.answer }}
                </p>
                <a
                  data-browse-menu
                  routerLink="/menu"
                  (click)="dismiss()"
                  class="mt-5 inline-flex items-center gap-1.5 rounded-[2px] border border-[var(--amber)] px-4 py-2 text-[12px] font-medium text-[var(--amber)] transition-colors duration-150 hover:bg-[var(--amber)] hover:text-[var(--canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
                >
                  Browse the full menu →
                </a>
              </div>
            }

            @case ('answer') {
              <div data-panel-answer>
                <p
                  data-answer-text
                  class="text-[14px] leading-relaxed text-[var(--text-primary)]"
                >
                  {{ response()?.answer }}
                </p>

                <div
                  [class]="
                    variant() === 'full'
                      ? 'mt-4 flex gap-4 overflow-x-auto pb-1'
                      : 'mt-4 flex flex-col gap-3'
                  "
                >
                  @for (
                    rec of response()?.recommendations ?? [];
                    track rec.mealId
                  ) {
                    <article
                      data-rec-card
                      [class]="
                        variant() === 'full'
                          ? 'flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)]'
                          : 'flex w-full overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)]'
                      "
                    >
                      <!-- Image with fallback for imageUrl: null -->
                      @if (rec.imageUrl) {
                        <img
                          data-rec-image
                          [src]="rec.imageUrl"
                          [alt]="rec.name"
                          [class]="
                            variant() === 'full'
                              ? 'h-[110px] w-full object-cover'
                              : 'h-[96px] w-[96px] shrink-0 object-cover'
                          "
                        />
                      } @else {
                        <div
                          data-rec-image-fallback
                          aria-hidden="true"
                          [class]="
                            variant() === 'full'
                              ? 'flex h-[110px] w-full items-center justify-center bg-[var(--photo-umber)]'
                              : 'flex h-[96px] w-[96px] shrink-0 items-center justify-center bg-[var(--photo-umber)]'
                          "
                        >
                          <span
                            class="h-2 w-2 rotate-45 bg-[var(--amber)] opacity-60"
                          ></span>
                        </div>
                      }

                      <div class="flex min-w-0 flex-1 flex-col p-3">
                        <h3
                          data-rec-name
                          class="font-display truncate text-[15px] font-light leading-tight text-[var(--text-primary)]"
                        >
                          {{ rec.name }}
                        </h3>
                        <p
                          data-rec-why
                          class="mt-1 line-clamp-2 text-[11px] leading-[15px] text-[var(--text-secondary)]"
                        >
                          {{ rec.why }}
                        </p>
                        <div
                          class="mt-auto flex items-end justify-between gap-2 pt-2"
                        >
                          <span
                            data-rec-price
                            class="font-display text-[14px] font-medium text-[var(--amber)]"
                          >
                            {{ formatPrice(rec.priceCents) }}
                          </span>
                          <button
                            data-rec-add
                            type="button"
                            [attr.aria-label]="'Add ' + rec.name + ' to cart'"
                            (click)="emitAdd(rec)"
                            class="rounded-[2px] border border-[var(--amber)] bg-transparent px-3 py-1.5 text-[11px] font-medium text-[var(--amber)] transition-colors duration-150 hover:bg-[var(--amber)] hover:text-[var(--canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </article>
                  }
                </div>

                @if ((response()?.sources ?? []).length > 0) {
                  <p
                    data-sources
                    class="mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/80"
                  >
                    Sources: {{ sourcesLine() }}
                  </p>
                }
              </div>
            }
          }
        </div>
      </section>
    }
  `,
})
export class SommelierInputComponent {
  private readonly cart = inject(CartStore);
  private readonly sommelier = inject(SommelierService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ArrowUp = ArrowUp;
  readonly X = X;
  readonly placeholder =
    'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';
  readonly variant = input<'full' | 'compact'>('full');
  /** Distinct allergen vocabulary from the loaded menu, passed down by the
   *  home page (no duplicate fetch, SSR-clean). Drives the select-only chips
   *  (F4-AC5) — the chip set is the ONLY way to populate `avoidAllergens`. */
  readonly menuAllergens = input<string[]>([]);

  /** Emits the chosen recommendation. T12 wires this to CartStore; T11 only
   *  emits — the panel never touches the cart itself. */
  readonly addToCart = output<SommelierMealRef>();

  readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
  });

  /** State machine (spec §5 F7). The template binds `loading`; the answer
   *  panel renders off `status` / `response` / `error`. */
  readonly status = signal<SommelierStatus>('idle');
  readonly response = signal<SommelierAskResponse | null>(null);
  readonly error = signal<SommelierError | null>(null);
  /** True exactly while the HTTP request is in flight (F7-AC1). */
  readonly loading = computed(() => this.status() === 'loading');
  /** The overlay/sheet is mounted for every non-idle state. */
  readonly panelOpen = computed(() => this.status() !== 'idle');

  /** Currently selected allergen chips (select-only; F4-AC5). */
  private readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Short, kind-specific error copy (timeout vs upstream). */
  readonly errorCopy = computed(() => {
    const kind = this.error()?.kind;
    return kind === 'timeout'
      ? 'That took too long. Please try again.'
      : 'Kenji is temporarily unavailable. Please try again.';
  });

  /** Fixed set of shimmer placeholders shown during loading. */
  readonly skeletonSlots = [0, 1, 2] as const;

  /** Compact, display-only sources summary (e.g. "menu, knowledge base").
   *  [n] markers stay inline in the answer text; this is just provenance. */
  readonly sourcesLine = computed(() => {
    const sources = this.response()?.sources ?? [];
    const kinds = new Set(
      sources.map((s) => (s.type === 'kb' ? 'knowledge base' : 'menu')),
    );
    return [...kinds].join(', ');
  });

  /** The query + allergen snapshot backing the in-flight/last request — retry
   *  re-issues THESE, not the live input/chips (F7-AC2). */
  private lastQuery = '';
  private lastAvoid: string[] = [];

  readonly metaLine = computed(() => {
    const count = this.cart.totalQuantity();
    if (count === 0) {
      return `Your cart is empty · delivery in ${DELIVERY_ETA_MIN} min`;
    }
    const totalDollars = (this.cart.grandTotalCents() / 100).toFixed(2);
    const noun = count === 1 ? 'item' : 'items';
    return `Your order: ${count} ${noun} · $${totalDollars} · delivery in ${DELIVERY_ETA_MIN} min`;
  });

  isAllergenSelected(allergen: string): boolean {
    return this.selected().has(allergen);
  }

  toggleAllergen(allergen: string): void {
    const next = new Set(this.selected());
    if (next.has(allergen)) {
      next.delete(allergen);
    } else {
      next.add(allergen);
    }
    this.selected.set(next);
  }

  onSubmit(): void {
    if (this.loading()) return;
    const query = this.form.controls.query.value.trim();
    if (!query) return;
    this.run(query, this.currentAvoid());
  }

  /** Re-issue the same query+allergens that failed (F7-AC2). */
  retry(): void {
    if (this.status() !== 'error') return;
    if (!this.lastQuery) return;
    this.run(this.lastQuery, this.lastAvoid);
  }

  /** Close the panel and return to idle (✕ button / scrim click). */
  dismiss(): void {
    this.status.set('idle');
  }

  emitAdd(rec: SommelierMealRef): void {
    this.addToCart.emit(rec);
  }

  formatPrice(cents: number): string {
    const dollars = cents / 100;
    return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  }

  private currentAvoid(): string[] {
    // Preserve menu order; only known menu allergens can ever be sent.
    return this.menuAllergens().filter((a) => this.selected().has(a));
  }

  private run(query: string, avoidAllergens: string[]): void {
    this.lastQuery = query;
    this.lastAvoid = avoidAllergens;
    this.error.set(null);
    this.status.set('loading');

    const req =
      avoidAllergens.length > 0 ? { query, avoidAllergens } : { query };

    this.sommelier
      .ask(req)
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
