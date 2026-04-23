import type { AbstractControl, ValidatorFn } from '@angular/forms';

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

export function e164PhoneValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' && E164_PATTERN.test(value)
      ? null
      : { e164: true };
  };
}
