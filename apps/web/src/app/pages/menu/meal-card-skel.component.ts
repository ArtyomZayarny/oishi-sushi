import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-meal-card-skel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-meal-skel
      aria-hidden="true"
      class="flex h-full animate-pulse flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div class="aspect-[4/3] w-full bg-slate-200"></div>
      <div class="flex flex-1 flex-col gap-2 p-4">
        <div class="h-4 w-2/3 rounded bg-slate-200"></div>
        <div class="h-3 w-full rounded bg-slate-100"></div>
        <div class="h-3 w-5/6 rounded bg-slate-100"></div>
        <div class="mt-auto flex items-center justify-between pt-2">
          <div class="h-5 w-16 rounded bg-slate-200"></div>
          <div class="h-8 w-14 rounded bg-slate-200"></div>
        </div>
      </div>
    </div>
  `,
})
export class MealCardSkelComponent {}
