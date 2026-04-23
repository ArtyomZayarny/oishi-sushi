import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Category, Meal } from '@org/shared-types';

import { AdminMealsComponent } from './admin-meals.component';

const buildMeal = (overrides: Partial<Meal> = {}): Meal => ({
  id: 'm1',
  name: 'Salmon Maki',
  description: 'Desc',
  priceCents: 1250,
  imageUrl: '/img/m1.jpg',
  active: true,
  deletedAt: null,
  categoryId: 'c1',
  allergens: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const CATEGORIES: Category[] = [
  { id: 'c1', name: 'Maki', slug: 'maki', sortOrder: 1 },
];

describe('AdminMealsComponent', () => {
  const setup = () => {
    TestBed.configureTestingModule({
      imports: [AdminMealsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const fixture = TestBed.createComponent(AdminMealsComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  };

  const flushInitialLoad = (
    http: HttpTestingController,
    meals: Meal[],
    categories: Category[] = CATEGORIES,
  ): void => {
    http.expectOne('/api/admin/menu').flush(meals);
    http
      .expectOne('/api/menu')
      .flush(categories.map((c) => ({ ...c, meals: [] })));
  };

  const openNewEditor = (fixture: ComponentFixture<AdminMealsComponent>) => {
    (
      fixture.nativeElement.querySelector(
        '[data-new-meal]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
  };

  beforeEach(() => TestBed.resetTestingModule());

  describe('initial load', () => {
    it('GETs /api/admin/menu and /api/menu on init', () => {
      const { http } = setup();
      http.expectOne('/api/admin/menu').flush([]);
      http.expectOne('/api/menu').flush([]);
      http.verify();
    });

    it('renders one row per meal, including inactive meals', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, [
        buildMeal({ id: 'm1', name: 'Active Meal', active: true }),
        buildMeal({ id: 'm2', name: 'Inactive Meal', active: false }),
      ]);
      fixture.detectChanges();
      const rows = fixture.nativeElement.querySelectorAll('[data-meal-row]');
      expect(rows.length).toBe(2);
    });

    it('flags inactive rows with a data-inactive marker', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, [
        buildMeal({ id: 'm1', active: true }),
        buildMeal({ id: 'm2', name: 'Off the menu', active: false }),
      ]);
      fixture.detectChanges();
      const inactive =
        fixture.nativeElement.querySelectorAll('[data-inactive]');
      expect(inactive.length).toBe(1);
    });

    it('renders an empty state when there are no meals', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      const empty = fixture.nativeElement.querySelector('[data-admin-empty]');
      expect(empty).not.toBeNull();
    });
  });

  describe('editor slide-over', () => {
    it('is hidden by default', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-editor]')).toBeNull();
    });

    it('opens when the New Meal button is clicked', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      openNewEditor(fixture);
      expect(
        fixture.nativeElement.querySelector('[data-editor]'),
      ).not.toBeNull();
    });

    it('opens with pre-filled values when an Edit button is clicked', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, [buildMeal({ id: 'm1', name: 'Tuna Maki' })]);
      fixture.detectChanges();
      (
        fixture.nativeElement.querySelector(
          '[data-edit-meal="m1"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const editor = fixture.nativeElement.querySelector('[data-editor]');
      expect(editor).not.toBeNull();
      const nameInput = editor?.querySelector(
        '[data-name]',
      ) as HTMLInputElement | null;
      expect(nameInput?.value).toBe('Tuna Maki');
    });
  });

  describe('optimistic create', () => {
    const CREATE_DTO = {
      name: 'Ebi Maki',
      description: 'Shrimp roll',
      priceCents: 999,
      imageUrl: '/img/ebi.jpg',
      categoryId: 'c1',
      allergens: [],
      active: true,
    };

    it('adds the new meal to the list before the server responds', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, [buildMeal({ id: 'm1', name: 'Existing' })]);
      fixture.detectChanges();
      openNewEditor(fixture);

      fixture.componentInstance.handleSave(CREATE_DTO);
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('[data-meal-row]');
      expect(rows.length).toBe(2);
      expect(fixture.nativeElement.textContent).toContain('Ebi Maki');

      // POST is in flight; confirm it was issued
      const postReq = http.expectOne({
        method: 'POST',
        url: '/api/admin/menu',
      });
      expect(postReq.request.body).toEqual(CREATE_DTO);
      postReq.flush(buildMeal({ id: 'm-new', name: 'Ebi Maki' }));
      http.verify();
    });

    it('reconciles the optimistic row with the server id on success', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      openNewEditor(fixture);

      fixture.componentInstance.handleSave(CREATE_DTO);
      fixture.detectChanges();

      http
        .expectOne({ method: 'POST', url: '/api/admin/menu' })
        .flush(buildMeal({ id: 'server-123', name: 'Ebi Maki' }));
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('[data-meal-row]');
      expect(rows.length).toBe(1);
      expect(
        fixture.nativeElement.querySelector(
          '[data-meal-row][data-meal-id="server-123"]',
        ),
      ).not.toBeNull();
      http.verify();
    });

    it('rolls back the optimistic row when the POST fails', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      openNewEditor(fixture);

      fixture.componentInstance.handleSave(CREATE_DTO);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('[data-meal-row]').length,
      ).toBe(1);

      const postReq = http.expectOne({
        method: 'POST',
        url: '/api/admin/menu',
      });
      postReq.flush(
        { message: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelectorAll('[data-meal-row]').length,
      ).toBe(0);
      http.verify();
    });

    it('closes the editor after a successful save', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, []);
      fixture.detectChanges();
      openNewEditor(fixture);
      expect(
        fixture.nativeElement.querySelector('[data-editor]'),
      ).not.toBeNull();

      fixture.componentInstance.handleSave(CREATE_DTO);
      http
        .expectOne({ method: 'POST', url: '/api/admin/menu' })
        .flush(buildMeal({ id: 'server-123' }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-editor]')).toBeNull();
      http.verify();
    });
  });

  describe('update existing meal', () => {
    it('PUTs to /api/admin/menu/:id when an existing meal is saved', () => {
      const { fixture, http } = setup();
      flushInitialLoad(http, [buildMeal({ id: 'm1', name: 'Old' })]);
      fixture.detectChanges();
      (
        fixture.nativeElement.querySelector(
          '[data-edit-meal="m1"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      fixture.componentInstance.handleSave({
        name: 'Renamed',
        description: 'Still the same roll',
        priceCents: 1500,
        imageUrl: '/img/m1.jpg',
        categoryId: 'c1',
        allergens: [],
        active: true,
      });
      fixture.detectChanges();

      const req = http.expectOne({
        method: 'PUT',
        url: '/api/admin/menu/m1',
      });
      expect(req.request.body).toEqual(
        expect.objectContaining({ name: 'Renamed', priceCents: 1500 }),
      );
      req.flush(buildMeal({ id: 'm1', name: 'Renamed', priceCents: 1500 }));
      http.verify();
    });
  });
});
