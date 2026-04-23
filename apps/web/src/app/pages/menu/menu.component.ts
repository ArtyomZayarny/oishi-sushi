import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { MealCardDetailsComponent } from './meal-card-details.component';
import { MealCardSkelComponent } from './meal-card-skel.component';
import type { MenuData } from './menu.resolver';

@Component({
  selector: 'app-menu',
  imports: [MealCardDetailsComponent, MealCardSkelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-8">
      <header class="mb-6">
        <h1 class="text-3xl font-bold tracking-tight">Menu</h1>
        <p class="mt-1 text-slate-600">
          Seasonal picks from our chefs, refreshed daily.
        </p>
      </header>

      @if (categories().length) {
        @for (c of categories(); track c.id) {
          <section data-category [attr.data-category-id]="c.id" class="mb-10">
            <h2
              data-category-name
              class="mb-4 text-xl font-semibold tracking-tight text-slate-900"
            >
              {{ c.name }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (m of c.meals; track m.id) {
                <div [attr.data-meal]="m.id">
                  @defer (on viewport) {
                    <app-meal-card-details [meal]="m" />
                  } @placeholder {
                    <app-meal-card-skel />
                  }
                </div>
              } @empty {
                <p class="text-sm text-slate-500">
                  No meals in this category yet.
                </p>
              }
            </div>
          </section>
        }
      } @else {
        <p
          data-empty
          class="rounded border border-dashed border-slate-300 p-6 text-center text-slate-500"
        >
          Menu is currently being updated. Check back soon.
        </p>
      }
    </section>
  `,
})
export class MenuComponent {
  private readonly route = inject(ActivatedRoute);
  readonly categories = toSignal(
    this.route.data.pipe(map((d) => (d['menu'] ?? []) as MenuData)),
    { initialValue: [] as MenuData },
  );
}
