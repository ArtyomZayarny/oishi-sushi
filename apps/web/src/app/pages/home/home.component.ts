import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Menu, ShoppingBag, X } from 'lucide-angular';

import { CartStore } from '../../features/cart/cart.store';
import {
  type AddToCartPayload,
  MenuCardComponent,
} from '../../features/home/components/menu-card/menu-card.component';
import { SommelierInputComponent } from '../../features/home/components/sommelier-input/sommelier-input.component';
import {
  type CategoryWithMeals,
  MenuService,
} from '../../services/menu.service';

type PhotoFill = 'umber' | 'sepia' | 'stone';

interface DisplayCardMeta {
  readonly name: string;
  readonly label: string;
  readonly photoFill: PhotoFill;
}

const DISPLAY_ORDER: readonly DisplayCardMeta[] = [
  { name: 'Otoro Selection', label: 'NIGIRI', photoFill: 'umber' },
  { name: 'Chef’s Omakase', label: 'OMAKASE', photoFill: 'sepia' },
  { name: 'Toro Truffle Roll', label: 'MAKI', photoFill: 'stone' },
  { name: 'Sashimi Moriawase', label: 'SASHIMI', photoFill: 'umber' },
  { name: 'Ikura Don', label: 'DONBURI', photoFill: 'sepia' },
  { name: 'Couple’s Set', label: 'SETS', photoFill: 'stone' },
] as const;

interface ResolvedCard {
  mealId: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  label: string;
  photoFill: PhotoFill;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    LucideAngularModule,
    MenuCardComponent,
    SommelierInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'canvas block min-h-[100dvh] w-screen',
  },
  styles: [
    `
      .canvas-fit {
        transform: translate(-50%, -50%);
        transform-origin: center;
      }
    `,
  ],
  template: `
    @if (isDesktop()) {
      <div class="fixed inset-0 overflow-hidden">
        <main
          class="canvas-fit absolute left-1/2 top-1/2 h-[900px] w-[1440px] shadow-[inset_0_0_0_1px_var(--outer-border)]"
          [style.transform]="canvasTransform()"
          aria-label="Oishi Sushi home"
        >
          <!-- Band 1: Header (0 → 56) -->
          <header
            class="flex h-14 items-center border-b border-[var(--hairline)] px-10"
          >
            <div class="flex items-baseline gap-2">
              <span
                data-wordmark-oishi
                class="font-display text-[20px] font-medium tracking-[0.15em]"
              >
                OISHI
              </span>
              <span
                data-wordmark-diamond
                aria-hidden="true"
                class="block h-1.5 w-1.5 rotate-45 self-center bg-[var(--amber)]"
              ></span>
              <span
                data-wordmark-sushi
                class="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]"
              >
                SUSHI
              </span>
            </div>
            <nav
              class="ml-auto flex gap-12 text-[11px] font-medium uppercase tracking-[0.16em]"
            >
              <a
                data-nav-menu
                routerLink="/menu"
                class="hover:text-[var(--amber)]"
              >
                MENU
              </a>
              <button
                data-nav-story
                type="button"
                disabled
                aria-disabled="true"
                class="cursor-not-allowed opacity-60"
              >
                STORY
              </button>
              <button
                data-nav-delivery
                type="button"
                disabled
                aria-disabled="true"
                class="cursor-not-allowed opacity-60"
              >
                DELIVERY
              </button>
            </nav>
            <a
              data-cart-link
              routerLink="/cart"
              [attr.aria-label]="'Open cart (' + cartCount() + ' items)'"
              class="ml-10 flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
            >
              <lucide-icon
                [img]="ShoppingBag"
                [size]="16"
                [strokeWidth]="1.25"
                class="text-[var(--text-primary)]"
              />
              @if (cartCount() > 0) {
                <span
                  data-cart-badge
                  class="grid h-4 w-4 place-items-center rounded-full bg-[var(--amber)] text-[10px] font-semibold text-[var(--canvas)]"
                >
                  {{ cartCount() }}
                </span>
              }
            </a>
          </header>

          <!-- Band 2: Menu grid (56 → 780) -->
          <section class="h-[724px] px-10 pt-10">
            <span
              data-section-meta
              class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
            >
              — TODAY’S SELECTION
            </span>
            @if (meals().length === 6) {
              <div class="mt-6 grid grid-cols-3 gap-5">
                @for (meal of meals(); track meal.mealId) {
                  <app-menu-card
                    [mealId]="meal.mealId"
                    [label]="meal.label"
                    [name]="meal.name"
                    [description]="meal.description"
                    [priceCents]="meal.priceCents"
                    [photoFill]="meal.photoFill"
                    [imageUrl]="meal.imageUrl"
                    (addToCart)="onAddToCart($event)"
                  />
                }
              </div>
            } @else {
              <div
                data-loading
                class="mt-6 text-[12px] text-[var(--text-secondary)]"
              >
                Loading menu…
              </div>
            }
          </section>

          <!-- Band 3: Sommelier (780 → 900) -->
          <section
            class="absolute inset-x-10 bottom-0 h-[120px] border-t border-[var(--hairline)] pt-5"
          >
            <app-sommelier-input />
          </section>
        </main>
      </div>
    } @else {
      <div
        class="mx-auto flex w-full max-w-[768px] flex-col gap-6 px-4 pb-[120px] pt-4 sm:px-6"
      >
        <header
          class="flex items-center justify-between border-b border-[var(--hairline)] pb-4"
        >
          <div class="flex items-baseline gap-2">
            <span
              data-wordmark-oishi
              class="font-display text-[20px] font-medium tracking-[0.15em]"
            >
              OISHI
            </span>
            <span
              data-wordmark-diamond
              aria-hidden="true"
              class="block h-1.5 w-1.5 rotate-45 self-center bg-[var(--amber)]"
            ></span>
            <span
              data-wordmark-sushi
              class="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]"
            >
              SUSHI
            </span>
          </div>
          <div class="flex items-center gap-1">
            <a
              data-cart-link
              routerLink="/cart"
              [attr.aria-label]="'Open cart (' + cartCount() + ' items)'"
              class="flex h-11 items-center gap-2 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
            >
              <lucide-icon
                [img]="ShoppingBag"
                [size]="18"
                [strokeWidth]="1.25"
                class="text-[var(--text-primary)]"
              />
              @if (cartCount() > 0) {
                <span
                  data-cart-badge
                  class="grid h-4 w-4 place-items-center rounded-full bg-[var(--amber)] text-[10px] font-semibold text-[var(--canvas)]"
                >
                  {{ cartCount() }}
                </span>
              }
            </a>
            <button
              data-nav-toggle
              type="button"
              [attr.aria-label]="mobileNavOpen() ? 'Close menu' : 'Open menu'"
              [attr.aria-expanded]="mobileNavOpen()"
              (click)="toggleMobileNav()"
              class="flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
            >
              <lucide-icon
                [img]="Menu"
                [size]="20"
                [strokeWidth]="1.25"
                class="text-[var(--text-primary)]"
              />
            </button>
          </div>
        </header>

        <section>
          <span
            data-section-meta
            class="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--amber)]"
          >
            — TODAY’S SELECTION
          </span>
          @if (meals().length === 6) {
            <div class="mt-4 flex flex-col gap-3">
              @for (meal of meals(); track meal.mealId) {
                <app-menu-card
                  variant="mobile"
                  [mealId]="meal.mealId"
                  [label]="meal.label"
                  [name]="meal.name"
                  [description]="meal.description"
                  [priceCents]="meal.priceCents"
                  [photoFill]="meal.photoFill"
                  [imageUrl]="meal.imageUrl"
                  (addToCart)="onAddToCart($event)"
                />
              }
            </div>
          } @else {
            <div
              data-loading
              class="mt-4 text-[14px] text-[var(--text-secondary)]"
            >
              Loading menu…
            </div>
          }
        </section>
      </div>

      <div
        data-sommelier-dock
        class="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--hairline)] bg-[var(--canvas)] px-4 pt-3 sm:px-6"
        style="padding-bottom: max(12px, env(safe-area-inset-bottom));"
      >
        <app-sommelier-input [variant]="'compact'" />
      </div>

      <aside
        data-mobile-nav
        [class.translate-x-0]="mobileNavOpen()"
        [class.translate-x-full]="!mobileNavOpen()"
        [attr.aria-hidden]="!mobileNavOpen()"
        class="fixed inset-0 z-30 bg-[var(--canvas)] transition-transform duration-200 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
      >
        <div
          class="flex h-14 items-center justify-end border-b border-[var(--hairline)] px-4"
        >
          <button
            data-nav-close
            type="button"
            aria-label="Close menu"
            (click)="closeMobileNav()"
            class="flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber-bright)]"
          >
            <lucide-icon
              [img]="X"
              [size]="20"
              [strokeWidth]="1.25"
              class="text-[var(--text-primary)]"
            />
          </button>
        </div>
        <nav
          class="flex flex-col gap-2 px-6 py-8 text-[14px] font-medium uppercase tracking-[0.16em]"
        >
          <a
            data-nav-menu
            routerLink="/menu"
            (click)="closeMobileNav()"
            class="py-3 hover:text-[var(--amber)]"
          >
            MENU
          </a>
          <button
            data-nav-story
            type="button"
            disabled
            aria-disabled="true"
            class="cursor-not-allowed py-3 text-left opacity-60"
          >
            STORY
          </button>
          <button
            data-nav-delivery
            type="button"
            disabled
            aria-disabled="true"
            class="cursor-not-allowed py-3 text-left opacity-60"
          >
            DELIVERY
          </button>
        </nav>
      </aside>
    }
  `,
})
export class HomeComponent {
  private readonly cart = inject(CartStore);
  private readonly menu = inject(MenuService);

  readonly ShoppingBag = ShoppingBag;
  readonly Menu = Menu;
  readonly X = X;

  readonly cartCount = this.cart.totalQuantity;
  readonly isDesktop = signal(true);
  readonly mobileNavOpen = signal(false);
  readonly canvasScale = signal(1);
  readonly canvasTransform = computed(
    () => `translate(-50%, -50%) scale(${this.canvasScale()})`,
  );

  private readonly menuData = toSignal(this.menu.list(), {
    initialValue: [] as CategoryWithMeals[],
  });

  readonly meals = computed<ResolvedCard[]>(() => {
    const byName = new Map(
      this.menuData()
        .flatMap((c) => c.meals ?? [])
        .map((m) => [m.name, m] as const),
    );
    return DISPLAY_ORDER.flatMap((entry) => {
      const meal = byName.get(entry.name);
      if (!meal) return [];
      return [
        {
          mealId: meal.id,
          name: meal.name,
          description: meal.description,
          priceCents: meal.priceCents,
          imageUrl: meal.imageUrl,
          label: entry.label,
          photoFill: entry.photoFill,
        },
      ];
    });
  });

  constructor() {
    if (typeof window !== 'undefined') {
      this.isDesktop.set(window.innerWidth >= 1200);
      this.canvasScale.set(this.computeCanvasScale());
    }
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(min-width: 1200px)');
      this.isDesktop.set(mq.matches);
      const onMq = (e: MediaQueryListEvent) => this.isDesktop.set(e.matches);
      mq.addEventListener('change', onMq);

      const onResize = () => this.canvasScale.set(this.computeCanvasScale());
      onResize();
      window.addEventListener('resize', onResize);

      destroyRef.onDestroy(() => {
        mq.removeEventListener('change', onMq);
        window.removeEventListener('resize', onResize);
      });
    });
  }

  private computeCanvasScale(): number {
    const w = window.innerWidth / 1440;
    const h = window.innerHeight / 900;
    return Math.min(w, h, 1);
  }

  onAddToCart(payload: AddToCartPayload): void {
    this.cart.addItem(payload);
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((v) => !v);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }
}
