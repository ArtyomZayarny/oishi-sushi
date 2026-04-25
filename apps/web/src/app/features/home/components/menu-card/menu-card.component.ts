import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

export interface AddToCartPayload {
  mealId: string;
  name: string;
  priceCents: number;
  imageUrl?: string;
}

type PhotoFill = 'umber' | 'sepia' | 'stone';

type Variant = 'desktop' | 'mobile';

@Component({
  selector: 'app-menu-card',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'group block' },
  template: `
    @if (variant() === 'mobile') {
      <article
        class="menu-card relative flex h-[110px] w-full overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] transition-colors duration-150 active:border-[var(--amber)] focus-within:border-[var(--amber)]"
      >
        <div
          data-image-zone
          [class]="'relative h-full w-[110px] shrink-0 ' + photoFillClass()"
        >
          @if (imageUrl()) {
            <img
              data-meal-image
              [src]="imageUrl()"
              [alt]="name()"
              class="h-full w-full object-cover"
            />
          }
        </div>

        <div class="flex min-w-0 flex-1 flex-col px-3 py-2">
          <span
            data-label
            class="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--text-secondary)]/80"
          >
            {{ label() }}
          </span>
          <h3
            data-meal-name
            class="font-display mt-0.5 truncate text-[15px] font-light leading-tight tracking-[-0.01em] text-[var(--text-primary)]"
          >
            {{ name() }}
          </h3>
          <p
            data-description
            class="mt-1 line-clamp-2 text-[11px] leading-[14px] text-[var(--text-secondary)]"
          >
            {{ description() }}
          </p>
          <div class="mt-auto flex items-end justify-between gap-2">
            <span
              data-price
              class="font-display tabular text-[14px] font-medium text-[var(--amber)]"
            >
              {{ formattedPrice() }}
              <span
                data-time-meta
                class="ml-1 text-[10px] font-normal text-[var(--text-secondary)]"
              >
                · {{ timeMin() }} min
              </span>
            </span>
            <button
              data-add-button
              type="button"
              [attr.aria-label]="'Add ' + name() + ' to cart'"
              (click)="emitAdd()"
              class="plus-button relative h-9 w-9 shrink-0 rounded-[2px] border border-[var(--amber)] bg-transparent transition-colors duration-150 active:bg-[var(--amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
            >
              <span
                aria-hidden="true"
                class="plus-bar absolute left-1/2 top-1/2 h-[1.5px] w-3 -translate-x-1/2 -translate-y-1/2 bg-[var(--amber)]"
              ></span>
              <span
                aria-hidden="true"
                class="plus-bar absolute left-1/2 top-1/2 h-3 w-[1.5px] -translate-x-1/2 -translate-y-1/2 bg-[var(--amber)]"
              ></span>
            </button>
          </div>
        </div>
      </article>
    } @else {
      <article
        class="menu-card relative grid h-[300px] w-[440px] grid-cols-[200px_240px] rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] transition-colors duration-150 group-hover:border-[var(--amber)] group-hover:[filter:drop-shadow(0_0_4px_rgba(212,128,58,0.15))] focus-within:border-[var(--amber)]"
      >
        <!-- Image zone (200×300) -->
        <div
          data-image-zone
          [class]="'relative h-full w-full ' + photoFillClass()"
        >
          @if (imageUrl()) {
            <img
              data-meal-image
              [src]="imageUrl()"
              [alt]="name()"
              class="h-full w-full object-cover"
            />
          }
          <span
            data-label
            class="absolute left-4 top-4 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--text-secondary)]/70"
          >
            {{ label() }}
          </span>
        </div>

        <!-- Content zone (240×300) -->
        <div class="relative h-full px-4">
          <h3
            data-meal-name
            class="font-display absolute left-4 right-4 top-[52px] text-[22px] font-light leading-none tracking-[-0.01em] text-[var(--text-primary)]"
          >
            {{ name() }}
          </h3>
          <div
            aria-hidden="true"
            class="absolute left-4 top-[84px] h-px w-6 bg-[var(--amber)]"
          ></div>
          <p
            data-description
            class="absolute left-4 right-4 top-[104px] max-w-[200px] text-[12px] leading-[18px] text-[var(--text-secondary)]"
          >
            {{ description() }}
          </p>
          <div
            class="absolute inset-x-4 bottom-3 flex items-end justify-between"
          >
            <div>
              <span
                data-price
                class="font-display tabular text-[18px] font-medium text-[var(--amber)]"
              >
                {{ formattedPrice() }}
              </span>
              <span
                data-time-meta
                class="mt-1 block text-[10px] text-[var(--text-secondary)]"
              >
                · {{ timeMin() }} min
              </span>
            </div>
            <button
              data-add-button
              type="button"
              [attr.aria-label]="'Add ' + name() + ' to cart'"
              (click)="emitAdd()"
              class="plus-button relative h-8 w-8 rounded-[2px] border border-[var(--amber)] bg-transparent transition-colors duration-150 group-hover:bg-[var(--amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
            >
              <span
                aria-hidden="true"
                class="plus-bar absolute left-1/2 top-1/2 h-[1.5px] w-3 -translate-x-1/2 -translate-y-1/2 bg-[var(--amber)] group-hover:bg-[var(--canvas)]"
              ></span>
              <span
                aria-hidden="true"
                class="plus-bar absolute left-1/2 top-1/2 h-3 w-[1.5px] -translate-x-1/2 -translate-y-1/2 bg-[var(--amber)] group-hover:bg-[var(--canvas)]"
              ></span>
            </button>
          </div>
        </div>
      </article>
    }
  `,
})
export class MenuCardComponent {
  mealId = input.required<string>();
  label = input.required<string>();
  name = input.required<string>();
  description = input.required<string>();
  priceCents = input.required<number>();
  photoFill = input.required<PhotoFill>();
  imageUrl = input<string | null>(null);
  timeMin = input<number>(25);
  variant = input<Variant>('desktop');

  addToCart = output<AddToCartPayload>();

  photoFillClass = computed(() => `photo-fill-${this.photoFill()}`);

  formattedPrice = computed(() => {
    const cents = this.priceCents();
    const dollars = cents / 100;
    return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  });

  emitAdd(): void {
    const url = this.imageUrl();
    const payload: AddToCartPayload = {
      mealId: this.mealId(),
      name: this.name(),
      priceCents: this.priceCents(),
      ...(url ? { imageUrl: url } : {}),
    };
    this.addToCart.emit(payload);
  }
}
