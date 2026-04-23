import { FormBuilder } from '@angular/forms';

import { tipLimitValidator } from './tip-limit.validator';

describe('tipLimitValidator', () => {
  const buildForm = (tipCents: number) =>
    new FormBuilder().group({
      payment: new FormBuilder().group({ tipCents: [tipCents] }),
    });

  it('returns null when the tip is exactly 50% of the subtotal', () => {
    const form = buildForm(50);
    form.setValidators(tipLimitValidator(() => 100));
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();
  });

  it('returns null when the tip is below 50% of the subtotal', () => {
    const form = buildForm(10);
    form.setValidators(tipLimitValidator(() => 100));
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();
  });

  it('returns tipExceedsLimit when the tip is above 50% of the subtotal', () => {
    const form = buildForm(60);
    form.setValidators(tipLimitValidator(() => 100));
    form.updateValueAndValidity();
    expect(form.errors?.['tipExceedsLimit']).toEqual({ max: 50, actual: 60 });
    expect(form.valid).toBe(false);
  });

  it('handles odd subtotals with floor-based max', () => {
    const form = buildForm(50);
    form.setValidators(tipLimitValidator(() => 99));
    form.updateValueAndValidity();
    expect(form.errors?.['tipExceedsLimit']).toEqual({ max: 49, actual: 50 });
  });

  it('returns null when the tip is 0 and the subtotal is 0', () => {
    const form = buildForm(0);
    form.setValidators(tipLimitValidator(() => 0));
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();
  });

  it('returns null for negative tip values (other validators cover this)', () => {
    const form = buildForm(-5);
    form.setValidators(tipLimitValidator(() => 100));
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();
  });

  it('reads the latest subtotal each time validation runs', () => {
    let subtotal = 100;
    const form = buildForm(60);
    form.setValidators(tipLimitValidator(() => subtotal));
    form.updateValueAndValidity();
    expect(form.errors).not.toBeNull();

    subtotal = 1000;
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();
  });
});
