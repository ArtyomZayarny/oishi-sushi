import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { FormArray } from '@angular/forms';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type {
  Category,
  Meal,
  MealCreateReq,
  MealOption,
} from '@org/shared-types';

@Component({
  selector: 'app-meal-editor',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex h-full flex-col gap-4"
    >
      <label class="grid gap-1 text-sm">
        <span class="text-slate-600">Name</span>
        <input
          data-name
          formControlName="name"
          class="rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <label class="grid gap-1 text-sm">
        <span class="text-slate-600">Description</span>
        <textarea
          data-description
          formControlName="description"
          rows="3"
          class="rounded border border-slate-300 px-2 py-1"
        ></textarea>
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1 text-sm">
          <span class="text-slate-600">Price (cents)</span>
          <input
            data-price
            type="number"
            min="0"
            formControlName="priceCents"
            class="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-slate-600">Category</span>
          <select
            data-category
            formControlName="categoryId"
            class="rounded border border-slate-300 px-2 py-1"
          >
            <option value="" disabled>Select a category…</option>
            @for (c of categories(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </label>
      </div>

      <label class="grid gap-1 text-sm">
        <span class="text-slate-600">Image URL</span>
        <input
          data-image-url
          type="url"
          formControlName="imageUrl"
          placeholder="https://…"
          class="rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input data-active type="checkbox" formControlName="active" />
        <span class="text-slate-600">Active</span>
      </label>

      <fieldset class="rounded border border-slate-200 p-3">
        <legend class="px-1 text-xs font-semibold uppercase text-slate-500">
          Allergens
        </legend>
        <div class="flex flex-wrap gap-1">
          @for (value of allergenValues(); track value; let i = $index) {
            <span
              data-allergen-chip
              class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
            >
              {{ value }}
              <button
                type="button"
                (click)="removeAllergen(i)"
                class="text-amber-900 hover:text-amber-700"
                aria-label="Remove allergen"
              >
                ×
              </button>
            </span>
          }
        </div>
        <div class="mt-2 flex gap-2">
          <input
            #allergenInput
            data-new-allergen
            placeholder="e.g. soy"
            (keydown.enter)="
              $event.preventDefault(); commitAllergen(allergenInput)
            "
            class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            data-add-allergen
            (click)="commitAllergen(allergenInput)"
            class="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            Add
          </button>
        </div>
      </fieldset>

      <fieldset class="rounded border border-slate-200 p-3">
        <legend class="px-1 text-xs font-semibold uppercase text-slate-500">
          Options
        </legend>
        <div formArrayName="options" class="flex flex-col gap-2">
          @for (opt of optionsArray.controls; track $index) {
            <div
              data-option-row
              [formGroupName]="$index"
              class="flex items-center gap-2"
            >
              <input
                data-option-name
                formControlName="name"
                placeholder="Name"
                class="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <input
                data-option-price
                formControlName="priceDeltaCents"
                type="number"
                placeholder="± cents"
                class="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                (click)="removeOption($index)"
                class="text-red-600 hover:text-red-800"
                aria-label="Remove option"
              >
                ×
              </button>
            </div>
          }
        </div>
        <button
          type="button"
          data-add-option
          (click)="addOption()"
          class="mt-2 rounded border border-slate-300 px-2 py-1 text-sm"
        >
          + Add option
        </button>
      </fieldset>

      <div class="mt-auto flex justify-end gap-2 pt-2">
        <button
          type="button"
          data-editor-cancel
          (click)="cancelled.emit()"
          class="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-editor-save
          [disabled]="form.invalid"
          class="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save
        </button>
      </div>
    </form>
  `,
})
export class MealEditorComponent {
  readonly meal = input<Meal | null>(null);
  readonly categories = input<readonly Category[]>([]);
  readonly save = output<MealCreateReq>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);

  readonly allergenValues = signal<readonly string[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    description: ['', [Validators.required, Validators.minLength(1)]],
    priceCents: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    imageUrl: ['', [Validators.required, Validators.minLength(1)]],
    categoryId: ['', [Validators.required]],
    active: [true],
    allergens: this.fb.array<FormControl<string>>([]),
    options: this.fb.array<ReturnType<MealEditorComponent['buildOptionGroup']>>(
      [],
    ),
  });

  constructor() {
    effect(() => {
      const m = this.meal();
      if (m) this.applyMeal(m);
    });
  }

  get allergensArray(): FormArray<FormControl<string>> {
    return this.form.get('allergens') as FormArray<FormControl<string>>;
  }

  get optionsArray(): FormArray<
    ReturnType<MealEditorComponent['buildOptionGroup']>
  > {
    return this.form.get('options') as FormArray<
      ReturnType<MealEditorComponent['buildOptionGroup']>
    >;
  }

  addOption(option?: Pick<MealOption, 'name' | 'priceDeltaCents'>): void {
    this.optionsArray.push(this.buildOptionGroup(option));
  }

  removeOption(index: number): void {
    this.optionsArray.removeAt(index);
  }

  addAllergen(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (this.allergenValues().includes(trimmed)) return;
    this.allergensArray.push(this.fb.nonNullable.control(trimmed));
    this.allergenValues.update((xs) => [...xs, trimmed]);
  }

  commitAllergen(input: HTMLInputElement): void {
    this.addAllergen(input.value);
    input.value = '';
  }

  removeAllergen(index: number): void {
    this.allergensArray.removeAt(index);
    this.allergenValues.update((xs) => xs.filter((_, i) => i !== index));
  }

  submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const priceCents = Number(raw.priceCents);
    this.save.emit({
      name: raw.name,
      description: raw.description,
      priceCents: Number.isFinite(priceCents) ? priceCents : 0,
      imageUrl: raw.imageUrl,
      categoryId: raw.categoryId,
      allergens: [...raw.allergens],
      active: raw.active,
    });
  }

  private applyMeal(m: Meal): void {
    this.form.patchValue({
      name: m.name,
      description: m.description,
      priceCents: m.priceCents,
      imageUrl: m.imageUrl,
      categoryId: m.categoryId,
      active: m.active,
    });
    while (this.allergensArray.length) this.allergensArray.removeAt(0);
    for (const a of m.allergens) {
      this.allergensArray.push(this.fb.nonNullable.control(a));
    }
    this.allergenValues.set([...m.allergens]);
    while (this.optionsArray.length) this.optionsArray.removeAt(0);
    for (const opt of m.options ?? []) {
      this.optionsArray.push(this.buildOptionGroup(opt));
    }
  }

  private buildOptionGroup(
    seed?: Pick<MealOption, 'name' | 'priceDeltaCents'>,
  ) {
    return this.fb.nonNullable.group({
      name: [seed?.name ?? '', [Validators.required, Validators.minLength(1)]],
      priceDeltaCents: this.fb.nonNullable.control<number>(
        seed?.priceDeltaCents ?? 0,
        [Validators.required],
      ),
    });
  }
}
