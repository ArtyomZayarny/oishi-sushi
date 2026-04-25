import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CartStore } from '../features/cart/cart.store';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'canvas flex min-h-[100dvh] flex-col' },
  template: `
    <header class="border-b border-[var(--hairline)] bg-[var(--canvas)]">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6"
      >
        <a routerLink="/" class="flex items-baseline gap-2">
          <span
            class="font-display text-[18px] font-medium tracking-[0.15em] sm:text-[20px]"
          >
            OISHI
          </span>
          <span
            aria-hidden="true"
            class="block h-1.5 w-1.5 rotate-45 self-center bg-[var(--amber)]"
          ></span>
          <span
            class="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]"
          >
            SUSHI
          </span>
        </a>
        <ul
          class="flex items-center gap-5 text-[11px] font-medium uppercase tracking-[0.16em] sm:gap-8"
        >
          <li>
            <a
              routerLink="/menu"
              routerLinkActive="text-[var(--amber)]"
              class="rounded-[2px] outline-none transition-colors hover:text-[var(--amber)] focus:outline-none focus-visible:text-[var(--amber)]"
            >
              Menu
            </a>
          </li>
          @if (isAdmin()) {
            <li>
              <a
                routerLink="/admin"
                routerLinkActive="text-[var(--amber)]"
                class="rounded-[2px] outline-none transition-colors hover:text-[var(--amber)] focus:outline-none focus-visible:text-[var(--amber)]"
              >
                Admin
              </a>
            </li>
          }
          <li>
            <a
              routerLink="/cart"
              class="relative flex items-center gap-2 rounded-[2px] outline-none transition-colors hover:text-[var(--amber)] focus:outline-none focus-visible:text-[var(--amber)]"
            >
              Cart
              @if (cartCount() > 0) {
                <span
                  data-testid="cart-badge"
                  class="grid h-5 min-w-[20px] place-items-center rounded-full bg-[var(--amber)] px-1.5 text-[10px] font-semibold text-[var(--canvas)]"
                >
                  {{ cartCount() }}
                </span>
              }
            </a>
          </li>
          @if (isAuthenticated()) {
            <li class="text-[var(--text-secondary)]">
              {{ user()?.firstName }}
            </li>
          } @else {
            <li>
              <a
                routerLink="/auth/login"
                class="rounded-[2px] outline-none transition-colors hover:text-[var(--amber)] focus:outline-none focus-visible:text-[var(--amber)]"
              >
                Sign in
              </a>
            </li>
          }
        </ul>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <router-outlet />
    </main>

    <footer
      class="border-t border-[var(--hairline)] bg-[var(--canvas)] py-5 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]"
    >
      © 2026 Oishi Sushi
    </footer>

    @if (toasts().length) {
      <div
        class="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        @for (t of toasts(); track t.id) {
          <div
            class="pointer-events-auto rounded-[2px] border border-[var(--hairline)] bg-[var(--card-lifted)] px-4 py-2 text-[12px] text-[var(--text-primary)] shadow-lg"
            [class.border-red-500]="t.level === 'error'"
            [class.text-red-200]="t.level === 'error'"
            [class.border-emerald-500]="t.level === 'success'"
            [class.text-emerald-200]="t.level === 'success'"
          >
            {{ t.text }}
          </div>
        }
      </div>
    }
  `,
})
export class AppLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly cart = inject(CartStore);

  readonly user = this.auth.currentUser;
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly isAdmin = this.auth.isAdmin;
  readonly toasts = this.toast.messages;
  readonly cartCount = this.cart.totalQuantity;
}
