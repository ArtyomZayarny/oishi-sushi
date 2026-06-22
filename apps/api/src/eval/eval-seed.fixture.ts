import type { Category, Meal } from '@prisma/client';
import type { CategoryWithMeals } from '../menu/menu.service';

/**
 * T9 — in-memory mirror of the committed 6-meal `prisma/seed.ts`, for the
 * DB-free mocked-subset spec (`eval-mock.spec.ts`). Names use the seed's U+2019
 * apostrophe; allergen tags and category names match the seed exactly. `createdAt`
 * is staggered (newest first in this list) so `markNewest` has a deterministic
 * top-5 (cuid ids are NOT insertion-ordered — the spec relies on distinct dates,
 * cf. T6's fixture note).
 *
 * Shape matches `MenuService.listPublic()`: `CategoryWithMeals[]`, one meal per
 * category in the seed, ordered by category `sortOrder`.
 */

interface SeedMealSpec {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  allergens: string[];
  categoryName: string;
  categorySlug: string;
  sortOrder: number;
  /** Days-ago offset; 0 = newest. */
  ageDays: number;
}

const BASE = new Date('2026-06-01T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const SEED: SeedMealSpec[] = [
  {
    id: 'meal_otoro',
    name: 'Otoro Selection',
    description: 'Five-day aged bluefin belly, hand-cut nigiri, eight pieces.',
    priceCents: 4800,
    imageUrl: '/assets/meals/otoro-selection.jpg',
    allergens: ['fish'],
    categoryName: 'Nigiri',
    categorySlug: 'nigiri',
    sortOrder: 2,
    ageDays: 0,
  },
  {
    id: 'meal_omakase',
    name: 'Chef’s Omakase',
    description:
      'Twelve pieces chosen by our chef each morning, cold-chain delivery.',
    priceCents: 9500,
    imageUrl: '/assets/meals/chefs-omakase.jpg',
    allergens: ['fish', 'shellfish'],
    categoryName: 'Omakase',
    categorySlug: 'omakase',
    sortOrder: 3,
    ageDays: 1,
  },
  {
    id: 'meal_toro_truffle',
    name: 'Toro Truffle Roll',
    description: 'Fatty tuna, shaved black truffle, micro shiso, gold leaf.',
    priceCents: 3800,
    imageUrl: '/assets/meals/toro-truffle-roll.jpg',
    allergens: ['fish'],
    categoryName: 'Maki',
    categorySlug: 'maki',
    sortOrder: 1,
    ageDays: 2,
  },
  {
    id: 'meal_sashimi',
    name: 'Sashimi Moriawase',
    description:
      "Seven cuts of the morning's best — hamachi, uni, kanpachi, and more.",
    priceCents: 7200,
    imageUrl: '/assets/meals/sashimi-moriawase.jpg',
    allergens: ['fish', 'shellfish'],
    categoryName: 'Sashimi',
    categorySlug: 'sashimi',
    sortOrder: 4,
    ageDays: 3,
  },
  {
    id: 'meal_ikura',
    name: 'Ikura Don',
    description: 'Salmon roe cured in soy and sake over warm vinegared rice.',
    priceCents: 3200,
    imageUrl: '/assets/meals/ikura-don.jpg',
    allergens: ['fish', 'soy'],
    categoryName: 'Donburi',
    categorySlug: 'donburi',
    sortOrder: 5,
    ageDays: 4,
  },
  {
    id: 'meal_couples',
    name: 'Couple’s Set',
    description:
      'Twenty pieces for two, balanced across nigiri, maki, and sashimi.',
    priceCents: 12800,
    imageUrl: '/assets/meals/couples-set.jpg',
    allergens: ['fish', 'shellfish'],
    categoryName: 'Sets',
    categorySlug: 'sets',
    sortOrder: 6,
    ageDays: 5,
  },
];

/** Resolve `Meal.name` → seed id (mirrors the live runtime resolution). */
export const SEED_NAME_TO_ID: ReadonlyMap<string, string> = new Map(
  SEED.map((m) => [m.name, m.id]),
);

function toMeal(spec: SeedMealSpec, categoryId: string): Meal {
  const createdAt = new Date(BASE - spec.ageDays * DAY);
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    priceCents: spec.priceCents,
    imageUrl: spec.imageUrl,
    active: true,
    categoryId,
    allergens: spec.allergens,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  } as Meal;
}

function toCategory(spec: SeedMealSpec): CategoryWithMeals {
  const categoryId = `cat_${spec.categorySlug}`;
  const createdAt = new Date(BASE);
  return {
    id: categoryId,
    name: spec.categoryName,
    slug: spec.categorySlug,
    sortOrder: spec.sortOrder,
    createdAt,
    updatedAt: createdAt,
    meals: [toMeal(spec, categoryId)],
  } as Category & { meals: Meal[] };
}

/**
 * The seed as `MenuService.listPublic()` would return it — categories in
 * `sortOrder` order, each with its single active meal.
 */
export function seedSnapshot(): CategoryWithMeals[] {
  return [...SEED]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((spec) => toCategory(spec));
}
