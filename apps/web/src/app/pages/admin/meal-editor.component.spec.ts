import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import type { Category, Meal } from '@org/shared-types';

import { MealEditorComponent } from './meal-editor.component';

const CATEGORIES: Category[] = [
  { id: 'c1', name: 'Maki', slug: 'maki', sortOrder: 1 },
  { id: 'c2', name: 'Nigiri', slug: 'nigiri', sortOrder: 2 },
];

const EXISTING_MEAL: Meal = {
  id: 'm1',
  name: 'Salmon Maki',
  description: 'Fresh salmon, 6 pcs',
  priceCents: 1250,
  imageUrl: '/img/m1.jpg',
  active: true,
  deletedAt: null,
  categoryId: 'c1',
  allergens: ['fish', 'soy'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  options: [
    { id: 'o1', mealId: 'm1', name: 'Extra wasabi', priceDeltaCents: 50 },
  ],
};

const fillValidForm = (
  fixture: ComponentFixture<MealEditorComponent>,
): void => {
  fixture.componentInstance.form.patchValue({
    name: 'Tuna Roll',
    description: 'Classic tuna roll',
    priceCents: 999,
    imageUrl: '/img/tuna.jpg',
    categoryId: 'c1',
    active: true,
  });
  fixture.detectChanges();
};

describe('MealEditorComponent', () => {
  const setup = (meal: Meal | null = null) => {
    TestBed.configureTestingModule({
      imports: [MealEditorComponent],
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(MealEditorComponent);
    fixture.componentRef.setInput('meal', meal);
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => TestBed.resetTestingModule());

  describe('form structure', () => {
    it('builds the expected top-level controls', () => {
      const { form } = setup().componentInstance;
      expect(form.get('name')).toBeInstanceOf(FormControl);
      expect(form.get('description')).toBeInstanceOf(FormControl);
      expect(form.get('priceCents')).toBeInstanceOf(FormControl);
      expect(form.get('imageUrl')).toBeInstanceOf(FormControl);
      expect(form.get('categoryId')).toBeInstanceOf(FormControl);
      expect(form.get('active')).toBeInstanceOf(FormControl);
      expect(form.get('allergens')).toBeInstanceOf(FormArray);
      expect(form.get('options')).toBeInstanceOf(FormArray);
    });

    it('marks name, description, priceCents, imageUrl, categoryId as required', () => {
      const { form } = setup().componentInstance;
      for (const path of [
        'name',
        'description',
        'priceCents',
        'imageUrl',
        'categoryId',
      ]) {
        expect(form.get(path)?.errors?.['required']).toBe(true);
      }
    });

    it('defaults active to true for a new meal', () => {
      const { form } = setup().componentInstance;
      expect(form.get('active')?.value).toBe(true);
    });

    it('renders the image URL input as plain text/url (not file upload)', () => {
      const fixture = setup();
      const input = fixture.nativeElement.querySelector(
        '[data-image-url]',
      ) as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.type).not.toBe('file');
    });
  });

  describe('options FormArray', () => {
    it('starts empty for a new meal', () => {
      const { form } = setup().componentInstance;
      expect((form.get('options') as FormArray).length).toBe(0);
    });

    it('addOption() appends a FormGroup with name and priceDeltaCents controls', () => {
      const fixture = setup();
      fixture.componentInstance.addOption();
      fixture.detectChanges();
      const options = fixture.componentInstance.form.get(
        'options',
      ) as FormArray;
      expect(options.length).toBe(1);
      const first = options.at(0);
      expect(first).toBeInstanceOf(FormGroup);
      expect(first.get('name')).toBeInstanceOf(FormControl);
      expect(first.get('priceDeltaCents')).toBeInstanceOf(FormControl);
    });

    it('addOption() renders a new option row in the template', () => {
      const fixture = setup();
      fixture.componentInstance.addOption();
      fixture.componentInstance.addOption();
      fixture.detectChanges();
      const rows = fixture.nativeElement.querySelectorAll('[data-option-row]');
      expect(rows.length).toBe(2);
    });

    it('removeOption(i) removes the option at the given index', () => {
      const fixture = setup();
      fixture.componentInstance.addOption();
      fixture.componentInstance.addOption();
      fixture.componentInstance.removeOption(0);
      fixture.detectChanges();
      const options = fixture.componentInstance.form.get(
        'options',
      ) as FormArray;
      expect(options.length).toBe(1);
    });
  });

  describe('allergens chips', () => {
    it('allergens is a FormArray of strings, empty by default', () => {
      const { form } = setup().componentInstance;
      expect((form.get('allergens') as FormArray).length).toBe(0);
    });

    it('addAllergen(value) pushes a new control into the array', () => {
      const fixture = setup();
      fixture.componentInstance.addAllergen('fish');
      fixture.componentInstance.addAllergen('soy');
      fixture.detectChanges();
      const allergens = fixture.componentInstance.form.get(
        'allergens',
      ) as FormArray;
      expect(allergens.length).toBe(2);
      expect(allergens.at(0).value).toBe('fish');
      expect(allergens.at(1).value).toBe('soy');
    });

    it('renders a chip per allergen', () => {
      const fixture = setup();
      fixture.componentInstance.addAllergen('fish');
      fixture.componentInstance.addAllergen('soy');
      fixture.detectChanges();
      const chips = fixture.nativeElement.querySelectorAll(
        '[data-allergen-chip]',
      );
      expect(chips.length).toBe(2);
    });

    it('removeAllergen(i) drops the control at the given index', () => {
      const fixture = setup();
      fixture.componentInstance.addAllergen('fish');
      fixture.componentInstance.addAllergen('soy');
      fixture.componentInstance.removeAllergen(0);
      fixture.detectChanges();
      const allergens = fixture.componentInstance.form.get(
        'allergens',
      ) as FormArray;
      expect(allergens.length).toBe(1);
      expect(allergens.at(0).value).toBe('soy');
    });

    it('ignores duplicate allergens', () => {
      const fixture = setup();
      fixture.componentInstance.addAllergen('fish');
      fixture.componentInstance.addAllergen('fish');
      const allergens = fixture.componentInstance.form.get(
        'allergens',
      ) as FormArray;
      expect(allergens.length).toBe(1);
    });
  });

  describe('pre-population for edit mode', () => {
    it('patches the form with the meal values', () => {
      const fixture = setup(EXISTING_MEAL);
      const { form } = fixture.componentInstance;
      expect(form.get('name')?.value).toBe('Salmon Maki');
      expect(form.get('description')?.value).toBe('Fresh salmon, 6 pcs');
      expect(form.get('priceCents')?.value).toBe(1250);
      expect(form.get('imageUrl')?.value).toBe('/img/m1.jpg');
      expect(form.get('categoryId')?.value).toBe('c1');
      expect(form.get('active')?.value).toBe(true);
    });

    it('seeds the allergens FormArray from meal.allergens', () => {
      const { form } = setup(EXISTING_MEAL).componentInstance;
      const allergens = form.get('allergens') as FormArray;
      expect(allergens.length).toBe(2);
      expect(allergens.value).toEqual(['fish', 'soy']);
    });

    it('seeds the options FormArray from meal.options', () => {
      const { form } = setup(EXISTING_MEAL).componentInstance;
      const options = form.get('options') as FormArray;
      expect(options.length).toBe(1);
      expect(options.at(0).value).toEqual({
        name: 'Extra wasabi',
        priceDeltaCents: 50,
      });
    });
  });

  describe('submit + cancel', () => {
    it('submit button is disabled while the form is invalid', () => {
      const fixture = setup();
      const btn = fixture.nativeElement.querySelector(
        '[data-editor-save]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('submit button is enabled once the form is valid', () => {
      const fixture = setup();
      fillValidForm(fixture);
      const btn = fixture.nativeElement.querySelector(
        '[data-editor-save]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('emits save with the create DTO when submit() is called', () => {
      const fixture = setup();
      fillValidForm(fixture);
      fixture.componentInstance.addAllergen('fish');
      const saveSpy = jest.fn();
      fixture.componentInstance.save.subscribe(saveSpy);
      fixture.componentInstance.submit();
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tuna Roll',
          description: 'Classic tuna roll',
          priceCents: 999,
          imageUrl: '/img/tuna.jpg',
          categoryId: 'c1',
          active: true,
          allergens: ['fish'],
        }),
      );
    });

    it('does not emit save when the form is invalid', () => {
      const fixture = setup();
      const saveSpy = jest.fn();
      fixture.componentInstance.save.subscribe(saveSpy);
      fixture.componentInstance.submit();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('emits cancelled when the cancel button is clicked', () => {
      const fixture = setup();
      const cancelSpy = jest.fn();
      fixture.componentInstance.cancelled.subscribe(cancelSpy);
      const btn = fixture.nativeElement.querySelector(
        '[data-editor-cancel]',
      ) as HTMLButtonElement;
      btn.click();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
  });
});
