import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Meal } from '@org/shared-types';
import { of } from 'rxjs';

import { CartStore } from '../../features/cart/cart.store';
import {
  type CategoryWithMeals,
  MenuService,
} from '../../services/menu.service';
import { HomeComponent } from './home.component';

const buildMeal = (overrides: Partial<Meal>): Meal => ({
  id: 'id',
  name: 'name',
  description: 'desc',
  priceCents: 100,
  imageUrl: null,
  active: true,
  deletedAt: null,
  categoryId: 'cat',
  allergens: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const SPEC_CATEGORIES: CategoryWithMeals[] = [
  {
    id: 'c1',
    name: 'Maki',
    slug: 'maki',
    sortOrder: 1,
    meals: [
      buildMeal({
        id: 'm-truffle',
        name: 'Toro Truffle Roll',
        description:
          'Fatty tuna, shaved black truffle, micro shiso, gold leaf.',
        priceCents: 3800,
        categoryId: 'c1',
      }),
    ],
  },
  {
    id: 'c2',
    name: 'Nigiri',
    slug: 'nigiri',
    sortOrder: 2,
    meals: [
      buildMeal({
        id: 'm-otoro',
        name: 'Otoro Selection',
        description:
          'Five-day aged bluefin belly, hand-cut nigiri, eight pieces.',
        priceCents: 4800,
        categoryId: 'c2',
      }),
    ],
  },
  {
    id: 'c3',
    name: 'Omakase',
    slug: 'omakase',
    sortOrder: 3,
    meals: [
      buildMeal({
        id: 'm-omakase',
        name: 'Chef’s Omakase',
        description:
          'Twelve pieces chosen by our chef each morning, cold-chain delivery.',
        priceCents: 9500,
        categoryId: 'c3',
      }),
    ],
  },
  {
    id: 'c4',
    name: 'Sashimi',
    slug: 'sashimi',
    sortOrder: 4,
    meals: [
      buildMeal({
        id: 'm-moriawase',
        name: 'Sashimi Moriawase',
        description:
          "Seven cuts of the morning's best — hamachi, uni, kanpachi, and more.",
        priceCents: 7200,
        categoryId: 'c4',
      }),
    ],
  },
  {
    id: 'c5',
    name: 'Donburi',
    slug: 'donburi',
    sortOrder: 5,
    meals: [
      buildMeal({
        id: 'm-ikura',
        name: 'Ikura Don',
        description:
          'Salmon roe cured in soy and sake over warm vinegared rice.',
        priceCents: 3200,
        categoryId: 'c5',
      }),
    ],
  },
  {
    id: 'c6',
    name: 'Sets',
    slug: 'sets',
    sortOrder: 6,
    meals: [
      buildMeal({
        id: 'm-couples',
        name: 'Couple’s Set',
        description:
          'Twenty pieces for two, balanced across nigiri, maki, and sashimi.',
        priceCents: 12800,
        categoryId: 'c6',
      }),
    ],
  },
];

const setup = (
  categories: CategoryWithMeals[] = SPEC_CATEGORIES,
): {
  fixture: ComponentFixture<HomeComponent>;
  cart: InstanceType<typeof CartStore>;
} => {
  const menuStub: Partial<MenuService> = {
    list: () => of(categories),
  };
  TestBed.configureTestingModule({
    imports: [HomeComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: MenuService, useValue: menuStub },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return { fixture, cart: TestBed.inject(CartStore) };
};

describe('HomeComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => localStorage.clear());

  describe('header band', () => {
    it('renders the OISHI wordmark', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-wordmark-oishi]');
      expect(el?.textContent?.trim()).toBe('OISHI');
    });

    it('renders the SUSHI secondary wordmark', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-wordmark-sushi]');
      expect(el?.textContent?.trim()).toBe('SUSHI');
    });

    it('renders the amber diamond between OISHI and SUSHI', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-wordmark-diamond]');
      expect(el).not.toBeNull();
    });

    it('renders MENU as a router link pointing to /menu', () => {
      const { fixture } = setup();
      const link = fixture.nativeElement.querySelector(
        '[data-nav-menu]',
      ) as HTMLAnchorElement | null;
      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe('/menu');
    });

    it('renders STORY and DELIVERY as disabled buttons', () => {
      const { fixture } = setup();
      const story = fixture.nativeElement.querySelector(
        '[data-nav-story]',
      ) as HTMLButtonElement | null;
      const delivery = fixture.nativeElement.querySelector(
        '[data-nav-delivery]',
      ) as HTMLButtonElement | null;
      expect(story?.disabled).toBe(true);
      expect(delivery?.disabled).toBe(true);
      expect(story?.getAttribute('aria-disabled')).toBe('true');
      expect(delivery?.getAttribute('aria-disabled')).toBe('true');
    });

    it('hides the cart badge digit when the cart is empty', () => {
      const { fixture } = setup();
      const badge = fixture.nativeElement.querySelector('[data-cart-badge]');
      expect(badge).toBeNull();
    });

    it('shows the cart badge digit when items are present', () => {
      const { fixture, cart } = setup();
      cart.addItem({ mealId: 'x', name: 'x', priceCents: 100 });
      cart.addItem({ mealId: 'x', name: 'x', priceCents: 100 });
      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('[data-cart-badge]');
      expect(badge?.textContent?.trim()).toBe('2');
    });

    it('cart link routes to /cart', () => {
      const { fixture } = setup();
      const link = fixture.nativeElement.querySelector(
        '[data-cart-link]',
      ) as HTMLAnchorElement | null;
      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe('/cart');
    });
  });

  describe('menu grid band', () => {
    it('renders the — TODAY’S SELECTION label', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-section-meta]');
      expect(el?.textContent?.trim()).toBe('— TODAY’S SELECTION');
    });

    it('renders exactly 6 menu cards', () => {
      const { fixture } = setup();
      const cards = fixture.nativeElement.querySelectorAll('app-menu-card');
      expect(cards.length).toBe(6);
    });

    it('renders the 6 meals in the spec-defined display order', () => {
      const { fixture } = setup();
      const names = Array.from(
        fixture.nativeElement.querySelectorAll('[data-meal-name]'),
      ).map((el) => (el as HTMLElement).textContent?.trim());
      expect(names).toEqual([
        'Otoro Selection',
        'Chef’s Omakase',
        'Toro Truffle Roll',
        'Sashimi Moriawase',
        'Ikura Don',
        'Couple’s Set',
      ]);
    });

    it('shows a loading placeholder until the 6 meals resolve', () => {
      const { fixture } = setup([]);
      const loading = fixture.nativeElement.querySelector('[data-loading]');
      expect(loading).not.toBeNull();
      const cards = fixture.nativeElement.querySelectorAll('app-menu-card');
      expect(cards.length).toBe(0);
    });
  });

  describe('cart integration', () => {
    it('adds an item to the cart when MenuCard emits addToCart', () => {
      const { fixture, cart } = setup();
      const firstCard = fixture.nativeElement.querySelector(
        '[data-add-button]',
      ) as HTMLButtonElement;
      firstCard.click();
      fixture.detectChanges();
      expect(cart.totalQuantity()).toBe(1);
      expect(cart.items()[0].name).toBe('Otoro Selection');
    });
  });

  describe('sommelier band', () => {
    it('renders the sommelier input component', () => {
      const { fixture } = setup();
      const somm = fixture.nativeElement.querySelector('app-sommelier-input');
      expect(somm).not.toBeNull();
    });
  });
});
