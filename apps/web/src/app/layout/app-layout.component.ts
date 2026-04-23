import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CartStore } from '../features/cart/cart.store';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-slate-200 bg-white">
      <nav
        class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"
      >
        <a routerLink="/" class="text-xl font-bold tracking-tight">
          Oishi Sushi
        </a>
        <ul class="flex items-center gap-4 text-sm">
          <li>
            <a
              routerLink="/menu"
              routerLinkActive="font-semibold"
              class="hover:underline"
            >
              Menu
            </a>
          </li>
          @if (isAdmin()) {
            <li>
              <a
                routerLink="/admin"
                routerLinkActive="font-semibold"
                class="hover:underline"
              >
                Admin
              </a>
            </li>
          }
          <li>
            <a routerLink="/cart" class="relative hover:underline">
              Cart
              <span
                data-testid="cart-badge"
                class="ml-1 inline-flex min-w-5 justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-xs text-white"
              >
                {{ cartCount() }}
              </span>
            </a>
          </li>
          @if (isAuthenticated()) {
            <li class="text-slate-600">{{ user()?.firstName }}</li>
          } @else {
            <li>
              <a routerLink="/auth/login" class="hover:underline">Sign in</a>
            </li>
          }
        </ul>
      </nav>
    </header>

    <main class="mx-auto min-h-[60vh] max-w-6xl px-4 py-6">
      <router-outlet />
    </main>

    <footer
      class="border-t border-slate-200 bg-slate-50 py-4 text-center text-sm text-slate-600"
    >
      &copy; 2026 Oishi Sushi
    </footer>

    @if (toasts().length) {
      <div
        class="pointer-events-none fixed bottom-4 right-4 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        @for (t of toasts(); track t.id) {
          <div
            class="pointer-events-auto rounded px-3 py-2 text-sm text-white shadow"
            [class.bg-red-600]="t.level === 'error'"
            [class.bg-emerald-600]="t.level === 'success'"
            [class.bg-slate-900]="t.level === 'info'"
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
