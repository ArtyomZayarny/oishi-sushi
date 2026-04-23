import { FormControl } from '@angular/forms';

import { e164PhoneValidator } from './e164.validator';

describe('e164PhoneValidator', () => {
  const validate = (value: string) =>
    e164PhoneValidator()(new FormControl(value));

  it('accepts a typical US E.164 number', () => {
    expect(validate('+14155552671')).toBeNull();
  });

  it('accepts an E.164 number with the minimum 2 digits', () => {
    expect(validate('+12')).toBeNull();
  });

  it('accepts an E.164 number with the maximum 15 digits', () => {
    expect(validate('+123456789012345')).toBeNull();
  });

  it('treats an empty value as valid (use Validators.required separately)', () => {
    expect(validate('')).toBeNull();
    expect(e164PhoneValidator()(new FormControl(null))).toBeNull();
  });

  it('rejects a value missing the leading plus', () => {
    expect(validate('14155552671')).toEqual({ e164: true });
  });

  it('rejects a value starting with +0', () => {
    expect(validate('+04155552671')).toEqual({ e164: true });
  });

  it('rejects a value with non-digit characters', () => {
    expect(validate('+1 (415) 555-2671')).toEqual({ e164: true });
  });

  it('rejects a value with 16+ digits', () => {
    expect(validate('+1234567890123456')).toEqual({ e164: true });
  });

  it('rejects a value that is just the plus sign', () => {
    expect(validate('+')).toEqual({ e164: true });
  });
});
