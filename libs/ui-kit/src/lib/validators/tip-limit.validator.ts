import type { AbstractControl, ValidatorFn } from '@angular/forms';

export function tipLimitValidator(
  getSubtotalCents: () => number,
  tipPath = 'payment.tipCents',
): ValidatorFn {
  return (control: AbstractControl) => {
    const raw = control.get(tipPath)?.value;
    const tip = Number(raw);
    if (!Number.isFinite(tip) || tip < 0) return null;
    const subtotal = getSubtotalCents();
    if (tip * 2 <= subtotal) return null;
    return {
      tipExceedsLimit: { max: Math.floor(subtotal / 2), actual: tip },
    };
  };
}
