import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import type { Meal, MealCreateReq } from '@org/shared-types';

import { AdminMealsStore } from './admin-meals.store';
import { MealEditorComponent } from './meal-editor.component';

@Component({
  selector: 'app-admin-meals',
  imports: [CurrencyPipe, MealEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-admin-meals class="py-8">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Meals</h1>
          <p class="text-sm text-slate-600">
            All meals, including inactive ones.
          </p>
        </div>
        <button
          data-new-meal
          type="button"
          (click)="store.openNew()"
          class="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + New meal
        </button>
      </header>

      @if (store.meals().length === 0) {
        <p
          data-admin-empty
          class="rounded border border-dashed border-slate-300 p-6 text-center text-slate-500"
        >
          No meals yet. Click <strong>+ New meal</strong> to add one.
        </p>
      } @else {
        <ul class="divide-y divide-slate-200 rounded border border-slate-200">
          @for (m of store.meals(); track m.id) {
            <li
              data-meal-row
              [attr.data-meal-id]="m.id"
              [attr.data-inactive]="m.active ? null : ''"
              class="flex items-center gap-3 px-4 py-3"
              [class.bg-slate-50]="!m.active"
            >
              <img
                [src]="m.imageUrl"
                [alt]="m.name"
                class="h-10 w-10 rounded object-cover"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-slate-900">{{ m.name }}</span>
                  @if (!m.active) {
                    <span
                      class="rounded bg-slate-200 px-1.5 py-0.5 text-xs uppercase text-slate-700"
                    >
                      Inactive
                    </span>
                  }
                </div>
                <div class="text-xs text-slate-500">
                  {{ m.priceCents / 100 | currency: 'USD' }}
                </div>
              </div>
              <button
                type="button"
                [attr.data-edit-meal]="m.id"
                (click)="store.openEdit(m)"
                class="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
              >
                Edit
              </button>
            </li>
          }
        </ul>
      }

      @if (store.editing() !== null) {
        <aside
          data-editor
          class="fixed inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white p-5 shadow-xl"
        >
          <header class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold">
              {{ editingMeal() ? 'Edit meal' : 'New meal' }}
            </h2>
          </header>
          <app-meal-editor
            [meal]="editingMeal()"
            [categories]="store.categories()"
            (save)="handleSave($event)"
            (cancelled)="store.close()"
          />
        </aside>
      }
    </section>
  `,
})
export class AdminMealsComponent {
  readonly store = inject(AdminMealsStore);

  readonly editingMeal = computed<Meal | null>(() => {
    const e = this.store.editing();
    return e === 'new' || e === null ? null : e;
  });

  handleSave(dto: MealCreateReq): void {
    const target = this.store.editing();
    if (target && target !== 'new') {
      this.store.update(target.id, dto);
    } else {
      this.store.create(dto);
    }
  }
}
