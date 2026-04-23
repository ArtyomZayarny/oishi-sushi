import type { AbstractControl, ValidatorFn } from '@angular/forms';

export type PostalCodeCountry = 'US' | 'CA' | 'UA' | 'GB';

const PATTERNS: Record<PostalCodeCountry, RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
  UA: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
};

export function postalCodeValidator(country: PostalCodeCountry): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' && PATTERNS[country].test(value)
      ? null
      : { postalCode: { country } };
  };
}
