import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { Category, Meal } from '@org/shared-types';
import { of } from 'rxjs';

import { MenuComponent } from './menu.component';

const buildMeal = (id: string, name: string, categoryId: string): Meal => ({
  id,
  name,
  description: `Desc ${id}`,
  priceCents: 890,
  imageUrl: `/img/${id}.jpg`,
  active: true,
  deletedAt: null,
  categoryId,
  allergens: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const CATEGORIES: Array<Category & { meals: Meal[] }> = [
  {
    id: 'c1',
    name: 'Maki',
    slug: 'maki',
    sortOrder: 1,
    meals: [
      buildMeal('m1', 'Salmon Maki', 'c1'),
      buildMeal('m2', 'Tuna Maki', 'c1'),
    ],
  },
  {
    id: 'c2',
    name: 'Nigiri',
    slug: 'nigiri',
    sortOrder: 2,
    meals: [buildMeal('m3', 'Salmon Nigiri', 'c2')],
  },
];

describe('MenuComponent', () => {
  const build = (data: unknown) => {
    TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { menu: data } },
            data: of({ menu: data }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MenuComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('renders one section per category via @for', () => {
    const fixture = build(CATEGORIES);
    const sections = fixture.nativeElement.querySelectorAll('[data-category]');
    expect(sections.length).toBe(2);
  });

  it('renders the category name heading for each category', () => {
    const fixture = build(CATEGORIES);
    const names = fixture.nativeElement.querySelectorAll(
      '[data-category-name]',
    );
    expect(names.length).toBe(2);
    expect(names[0].textContent).toContain('Maki');
    expect(names[1].textContent).toContain('Nigiri');
  });

  it('renders one meal element per meal across categories', () => {
    const fixture = build(CATEGORIES);
    const meals = fixture.nativeElement.querySelectorAll('[data-meal]');
    expect(meals.length).toBe(3);
  });

  it('renders the empty @if/@empty branch when no categories', () => {
    const fixture = build([]);
    const empty = fixture.nativeElement.querySelector('[data-empty]');
    expect(empty).not.toBeNull();
    const meals = fixture.nativeElement.querySelectorAll('[data-meal]');
    expect(meals.length).toBe(0);
  });
});
