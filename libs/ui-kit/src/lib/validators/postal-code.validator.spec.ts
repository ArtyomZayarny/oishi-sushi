import { FormControl } from '@angular/forms';

import {
  postalCodeValidator,
  type PostalCodeCountry,
} from './postal-code.validator';

describe('postalCodeValidator', () => {
  const validate = (country: PostalCodeCountry, value: string) =>
    postalCodeValidator(country)(new FormControl(value));

  it('treats an empty value as valid', () => {
    expect(validate('US', '')).toBeNull();
    expect(postalCodeValidator('US')(new FormControl(null))).toBeNull();
  });

  describe('US', () => {
    it('accepts 5-digit ZIP', () => {
      expect(validate('US', '94103')).toBeNull();
    });
    it('accepts ZIP+4', () => {
      expect(validate('US', '94103-1234')).toBeNull();
    });
    it('rejects 4-digit codes', () => {
      expect(validate('US', '9410')).toEqual({
        postalCode: { country: 'US' },
      });
    });
    it('rejects codes with letters', () => {
      expect(validate('US', 'A4103')).toEqual({
        postalCode: { country: 'US' },
      });
    });
  });

  describe('CA', () => {
    it('accepts A1A 1A1', () => {
      expect(validate('CA', 'K1A 0B1')).toBeNull();
    });
    it('accepts A1A1A1 without a space', () => {
      expect(validate('CA', 'K1A0B1')).toBeNull();
    });
    it('accepts lowercase', () => {
      expect(validate('CA', 'k1a 0b1')).toBeNull();
    });
    it('rejects invalid pattern', () => {
      expect(validate('CA', '12345')).toEqual({
        postalCode: { country: 'CA' },
      });
    });
  });

  describe('UA', () => {
    it('accepts 5-digit UA code', () => {
      expect(validate('UA', '01001')).toBeNull();
    });
    it('rejects codes with wrong length', () => {
      expect(validate('UA', '0100')).toEqual({
        postalCode: { country: 'UA' },
      });
    });
  });

  describe('GB', () => {
    it('accepts SW1A 1AA', () => {
      expect(validate('GB', 'SW1A 1AA')).toBeNull();
    });
    it('accepts M1 1AA', () => {
      expect(validate('GB', 'M1 1AA')).toBeNull();
    });
    it('accepts EC1A1BB without a space', () => {
      expect(validate('GB', 'EC1A1BB')).toBeNull();
    });
    it('rejects non-UK patterns', () => {
      expect(validate('GB', '12345')).toEqual({
        postalCode: { country: 'GB' },
      });
    });
  });
});
