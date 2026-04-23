import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Meal } from '@org/shared-types';

@Component({
  selector: 'app-meal-card-details',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      data-meal-card
      class="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div class="aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <img
          data-meal-image
          [src]="meal().imageUrl"
          [alt]="meal().name"
          loading="lazy"
          class="h-full w-full object-cover"
        />
      </div>
      <div class="flex flex-1 flex-col gap-2 p-4">
        <h3
          data-meal-name
          class="text-base font-semibold tracking-tight text-slate-900"
        >
          {{ meal().name }}
        </h3>
        <p class="line-clamp-2 text-sm text-slate-600">
          {{ meal().description }}
        </p>
        <div class="mt-auto flex items-center justify-between pt-2">
          <span data-meal-price class="text-lg font-bold text-slate-900">
            {{ meal().priceCents / 100 | currency: 'USD' }}
          </span>
          <button
            type="button"
            class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
          >
            Add
          </button>
        </div>
      </div>
    </article>
  `,
})
export class MealCardDetailsComponent {
  readonly meal = input.required<Meal>();
}
