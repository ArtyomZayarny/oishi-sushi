import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Meal } from '@org/shared-types';

import { MealCardDetailsComponent } from './meal-card-details.component';

const MEAL: Meal = {
  id: 'm1',
  name: 'Salmon Maki',
  description: 'Fresh salmon roll, 6 pcs',
  priceCents: 1250,
  imageUrl: '/img/m1.jpg',
  active: true,
  deletedAt: null,
  categoryId: 'c1',
  allergens: ['fish'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('MealCardDetailsComponent', () => {
  const build = (meal: Meal) => {
    TestBed.configureTestingModule({
      imports: [MealCardDetailsComponent],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(MealCardDetailsComponent);
    fixture.componentRef.setInput('meal', meal);
    fixture.detectChanges();
    return fixture;
  };

  it('renders meal name', () => {
    const fixture = build(MEAL);
    const name = fixture.nativeElement.querySelector('[data-meal-name]');
    expect(name?.textContent).toContain('Salmon Maki');
  });

  it('renders price formatted as USD from priceCents', () => {
    const fixture = build(MEAL);
    const price = fixture.nativeElement.querySelector('[data-meal-price]');
    expect(price?.textContent).toContain('12.50');
  });

  it('renders an image with the meal imageUrl', () => {
    const fixture = build(MEAL);
    const img = fixture.nativeElement.querySelector(
      'img[data-meal-image]',
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/img/m1.jpg');
    expect(img?.getAttribute('alt')).toContain('Salmon Maki');
  });
});
