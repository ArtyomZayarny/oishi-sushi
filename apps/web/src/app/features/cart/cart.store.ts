import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import {
  patchState,
  signalStore,
  watchState,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { CART_STORAGE_KEY, CART_TAX_RATE, type CartItem } from './cart.types';

interface CartState {
  items: CartItem[];
}

const INITIAL_STATE: CartState = { items: [] };

type NewItemInput = Omit<CartItem, 'quantity'>;

const hydrate = (storage: Storage | null): CartState => {
  if (!storage) return INITIAL_STATE;
  const raw = storage.getItem(CART_STORAGE_KEY);
  if (!raw) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return { items: (parsed as { items: CartItem[] }).items };
    }
  } catch {
    // malformed JSON — fall through to empty state
  }
  return INITIAL_STATE;
};

const persist = (storage: Storage | null, state: CartState): void => {
  storage?.setItem(CART_STORAGE_KEY, JSON.stringify({ items: state.items }));
};

export const CartStore = signalStore(
  { providedIn: 'root' },
  withState<CartState>(INITIAL_STATE),
  withComputed(({ items }) => {
    const subtotalCents = computed(() =>
      items().reduce((sum, i) => sum + i.priceCents * i.quantity, 0),
    );
    const taxCents = computed(() =>
      Math.round(subtotalCents() * CART_TAX_RATE),
    );
    const grandTotalCents = computed(() => subtotalCents() + taxCents());
    const totalQuantity = computed(() =>
      items().reduce((sum, i) => sum + i.quantity, 0),
    );
    return { subtotalCents, taxCents, grandTotalCents, totalQuantity };
  }),
  withMethods((store) => ({
    addItem(item: NewItemInput): void {
      const existing = store.items().find((i) => i.mealId === item.mealId);
      if (existing) {
        patchState(store, {
          items: store
            .items()
            .map((i) =>
              i.mealId === item.mealId ? { ...i, quantity: i.quantity + 1 } : i,
            ),
        });
        return;
      }
      patchState(store, {
        items: [...store.items(), { ...item, quantity: 1 }],
      });
    },
    removeItem(mealId: string): void {
      patchState(store, {
        items: store.items().filter((i) => i.mealId !== mealId),
      });
    },
    updateQty(mealId: string, quantity: number): void {
      if (!store.items().some((i) => i.mealId === mealId)) return;
      if (quantity <= 0) {
        patchState(store, {
          items: store.items().filter((i) => i.mealId !== mealId),
        });
        return;
      }
      patchState(store, {
        items: store
          .items()
          .map((i) => (i.mealId === mealId ? { ...i, quantity } : i)),
      });
    },
    clearCart(): void {
      patchState(store, { items: [] });
    },
  })),
  withHooks({
    onInit(store) {
      const platformId = inject(PLATFORM_ID);
      const storage: Storage | null = isPlatformBrowser(platformId)
        ? globalThis.localStorage
        : null;
      const hydrated = hydrate(storage);
      if (hydrated.items.length) {
        patchState(store, hydrated);
      }
      if (storage) {
        watchState(store, (state) => persist(storage, state as CartState));
      }
    },
  }),
);
