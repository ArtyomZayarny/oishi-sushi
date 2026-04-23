import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CartStore } from './cart.store';
import { CART_STORAGE_KEY, type CartItem } from './cart.types';

type NewItemInput = Omit<CartItem, 'quantity'>;

const ITEM_A: NewItemInput = {
  mealId: 'm1',
  name: 'Salmon Maki',
  priceCents: 1000,
  imageUrl: '/img/m1.jpg',
};

const ITEM_B: NewItemInput = {
  mealId: 'm2',
  name: 'Tuna Nigiri',
  priceCents: 500,
};

const setup = () => {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  return TestBed.inject(CartStore);
};

const readStorage = (): { items: CartItem[] } | null => {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { items: CartItem[] }) : null;
};

describe('CartStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('initial state', () => {
    it('starts empty when localStorage is empty', () => {
      const store = setup();
      expect(store.items()).toEqual([]);
      expect(store.subtotalCents()).toBe(0);
      expect(store.taxCents()).toBe(0);
      expect(store.grandTotalCents()).toBe(0);
      expect(store.totalQuantity()).toBe(0);
    });
  });

  describe('addItem', () => {
    it('adds a new item with quantity 1', () => {
      const store = setup();
      store.addItem(ITEM_A);
      expect(store.items()).toEqual([{ ...ITEM_A, quantity: 1 }]);
    });

    it('increments quantity when the same mealId is added again', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_A);
      store.addItem(ITEM_A);
      expect(store.items()).toHaveLength(1);
      expect(store.items()[0].quantity).toBe(3);
    });

    it('keeps items in insertion order when adding distinct meals', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_B);
      expect(store.items().map((i) => i.mealId)).toEqual(['m1', 'm2']);
    });
  });

  describe('removeItem', () => {
    it('removes the item matching the mealId', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_B);
      store.removeItem('m1');
      expect(store.items()).toHaveLength(1);
      expect(store.items()[0].mealId).toBe('m2');
    });

    it('is a noop when the mealId is not in the cart', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.removeItem('does-not-exist');
      expect(store.items()).toHaveLength(1);
    });
  });

  describe('updateQty', () => {
    it('sets an explicit quantity on an existing item', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.updateQty('m1', 5);
      expect(store.items()[0].quantity).toBe(5);
    });

    it('removes the item when quantity drops to 0', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.updateQty('m1', 0);
      expect(store.items()).toEqual([]);
    });

    it('removes the item when quantity is negative', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.updateQty('m1', -3);
      expect(store.items()).toEqual([]);
    });

    it('is a noop when the mealId is not in the cart', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.updateQty('missing', 9);
      expect(store.items()).toHaveLength(1);
      expect(store.items()[0].quantity).toBe(1);
    });
  });

  describe('clearCart', () => {
    it('empties every item', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_B);
      store.clearCart();
      expect(store.items()).toEqual([]);
    });
  });

  describe('computed totals', () => {
    it('subtotalCents is the sum of priceCents * quantity across items', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_B);
      store.updateQty('m1', 2);
      store.updateQty('m2', 3);
      // 1000*2 + 500*3 = 3500
      expect(store.subtotalCents()).toBe(3500);
    });

    it('taxCents is 15% of subtotal', () => {
      const store = setup();
      store.addItem(ITEM_A);
      // 1000 * 0.15 = 150
      expect(store.taxCents()).toBe(150);
    });

    it('taxCents rounds fractional cents to the nearest integer', () => {
      const store = setup();
      store.addItem({ ...ITEM_A, priceCents: 333 });
      // 333 * 0.15 = 49.95 → 50
      expect(store.taxCents()).toBe(50);
    });

    it('grandTotalCents is subtotal + tax', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.updateQty('m1', 2);
      expect(store.subtotalCents()).toBe(2000);
      expect(store.taxCents()).toBe(300);
      expect(store.grandTotalCents()).toBe(2300);
    });

    it('totalQuantity sums quantities across all items', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.addItem(ITEM_B);
      store.updateQty('m1', 2);
      store.updateQty('m2', 4);
      expect(store.totalQuantity()).toBe(6);
    });
  });

  describe('localStorage hydration', () => {
    it('hydrates items from localStorage on init', () => {
      const items: CartItem[] = [
        { mealId: 'm1', name: 'Salmon Maki', priceCents: 1000, quantity: 2 },
      ];
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items }));
      const store = setup();
      expect(store.items()).toEqual(items);
      expect(store.subtotalCents()).toBe(2000);
      expect(store.taxCents()).toBe(300);
    });

    it('ignores malformed localStorage payloads', () => {
      localStorage.setItem(CART_STORAGE_KEY, 'not-json');
      const store = setup();
      expect(store.items()).toEqual([]);
    });

    it('ignores localStorage payloads that are missing items', () => {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
      const store = setup();
      expect(store.items()).toEqual([]);
    });
  });

  describe('localStorage persistence', () => {
    it('writes the current cart on every state change', () => {
      const store = setup();
      store.addItem(ITEM_A);
      expect(readStorage()?.items).toEqual([{ ...ITEM_A, quantity: 1 }]);

      store.addItem(ITEM_A);
      expect(readStorage()?.items[0].quantity).toBe(2);

      store.updateQty('m1', 5);
      expect(readStorage()?.items[0].quantity).toBe(5);

      store.removeItem('m1');
      expect(readStorage()?.items).toEqual([]);
    });

    it('persists an empty cart after clearCart', () => {
      const store = setup();
      store.addItem(ITEM_A);
      store.clearCart();
      expect(readStorage()?.items).toEqual([]);
    });
  });
});
