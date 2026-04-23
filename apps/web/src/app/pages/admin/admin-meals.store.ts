import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import type {
  Category,
  Meal,
  MealCreateReq,
  MealUpdateReq,
} from '@org/shared-types';
import {
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import {
  API_BASE_URL,
  type CategoryWithMeals,
} from '../../services/menu.service';

export type EditingTarget = Meal | 'new' | null;

interface AdminMealsState {
  meals: Meal[];
  categories: Category[];
  editing: EditingTarget;
}

const INITIAL_STATE: AdminMealsState = {
  meals: [],
  categories: [],
  editing: null,
};

const nowIso = (): string => new Date().toISOString();

export const AdminMealsStore = signalStore(
  { providedIn: 'root' },
  withState<AdminMealsState>(INITIAL_STATE),
  withMethods((store) => {
    const http = inject(HttpClient);
    const base = inject(API_BASE_URL);
    return {
      openNew(): void {
        patchState(store, { editing: 'new' });
      },
      openEdit(meal: Meal): void {
        patchState(store, { editing: meal });
      },
      close(): void {
        patchState(store, { editing: null });
      },
      create(dto: MealCreateReq): void {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimistic: Meal = {
          id: tempId,
          name: dto.name,
          description: dto.description,
          priceCents: dto.priceCents,
          imageUrl: dto.imageUrl,
          active: dto.active ?? true,
          deletedAt: null,
          categoryId: dto.categoryId,
          allergens: [...dto.allergens],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        patchState(store, { meals: [...store.meals(), optimistic] });
        http.post<Meal>(`${base}/admin/menu`, dto).subscribe({
          next: (saved) => {
            patchState(store, {
              meals: store.meals().map((m) => (m.id === tempId ? saved : m)),
              editing: null,
            });
          },
          error: () => {
            patchState(store, {
              meals: store.meals().filter((m) => m.id !== tempId),
            });
          },
        });
      },
      update(id: string, dto: MealUpdateReq): void {
        http.put<Meal>(`${base}/admin/menu/${id}`, dto).subscribe((saved) => {
          patchState(store, {
            meals: store.meals().map((m) => (m.id === id ? saved : m)),
            editing: null,
          });
        });
      },
    };
  }),
  withHooks({
    onInit(store) {
      const http = inject(HttpClient);
      const base = inject(API_BASE_URL);
      http.get<Meal[]>(`${base}/admin/menu`).subscribe((meals) => {
        patchState(store, { meals });
      });
      http.get<CategoryWithMeals[]>(`${base}/menu`).subscribe((cats) => {
        patchState(store, {
          categories: cats.map(({ id, name, slug, sortOrder }) => ({
            id,
            name,
            slug,
            sortOrder,
          })),
        });
      });
    },
  }),
);
