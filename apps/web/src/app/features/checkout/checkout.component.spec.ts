import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';

import { CartStore } from '../cart/cart.store';
import { CART_STORAGE_KEY, type CartItem } from '../cart/cart.types';
import { CheckoutComponent } from './checkout.component';

const CART_ITEMS: CartItem[] = [
  { mealId: 'm1', name: 'Salmon Maki', priceCents: 1000, quantity: 2 },
  { mealId: 'm2', name: 'Tuna Nigiri', priceCents: 500, quantity: 1 },
];

const fillValidForm = (fixture: ComponentFixture<CheckoutComponent>): void => {
  const form = fixture.componentInstance.form;
  form.patchValue({
    customer: {
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+14155552671',
    },
    delivery: {
      address: '123 Main St',
      postalCode: '94103',
      notes: '',
    },
    payment: { tipCents: 100 },
  });
  fixture.detectChanges();
};

describe('CheckoutComponent', () => {
  const setup = (items: CartItem[] = CART_ITEMS) => {
    localStorage.clear();
    if (items.length) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items }));
    }
    const navigate = jest.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      navigate,
      http,
      store: TestBed.inject(CartStore),
    };
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => localStorage.clear());

  describe('form structure', () => {
    it('builds nested customer/delivery/payment groups', () => {
      const { fixture } = setup();
      const { form } = fixture.componentInstance;
      expect(form.get('customer')).toBeInstanceOf(FormGroup);
      expect(form.get('delivery')).toBeInstanceOf(FormGroup);
      expect(form.get('payment')).toBeInstanceOf(FormGroup);
    });

    it('exposes a FormArray of items with one entry per cart item', () => {
      const { fixture } = setup();
      const items = fixture.componentInstance.form.get('items');
      expect(items).toBeInstanceOf(FormArray);
      expect((items as FormArray).length).toBe(CART_ITEMS.length);
      (items as FormArray).controls.forEach((c) => {
        expect(c.get('note')).toBeInstanceOf(FormControl);
      });
    });
  });

  describe('required validators', () => {
    const paths = [
      'customer.firstName',
      'customer.lastName',
      'customer.phone',
      'delivery.address',
      'delivery.postalCode',
    ];
    it.each(paths)('%s is required', (path) => {
      const { fixture } = setup();
      const ctrl = fixture.componentInstance.form.get(path);
      expect(ctrl?.errors?.['required']).toBe(true);
    });
  });

  describe('custom validators', () => {
    it('marks the phone invalid for non-E.164 values', () => {
      const { fixture } = setup();
      const phone = fixture.componentInstance.form.get('customer.phone');
      phone?.setValue('415-555-2671');
      expect(phone?.errors?.['e164']).toBe(true);
    });

    it('clears the E.164 error on a valid phone', () => {
      const { fixture } = setup();
      const phone = fixture.componentInstance.form.get('customer.phone');
      phone?.setValue('+14155552671');
      expect(phone?.errors).toBeNull();
    });

    it('marks the postal code invalid for non-US values by default', () => {
      const { fixture } = setup();
      const postal = fixture.componentInstance.form.get('delivery.postalCode');
      postal?.setValue('ABC-123');
      expect(postal?.errors?.['postalCode']).toEqual({ country: 'US' });
    });

    it('clears the postal-code error on a valid US ZIP', () => {
      const { fixture } = setup();
      const postal = fixture.componentInstance.form.get('delivery.postalCode');
      postal?.setValue('94103');
      expect(postal?.errors).toBeNull();
    });

    it('invalidates the form when tip exceeds 50% of the subtotal', () => {
      const { fixture, store } = setup();
      fillValidForm(fixture);
      expect(fixture.componentInstance.form.valid).toBe(true);
      const halfPlusOne = Math.floor(store.subtotalCents() / 2) + 1;
      fixture.componentInstance.form.patchValue({
        payment: { tipCents: halfPlusOne },
      });
      fixture.detectChanges();
      expect(
        fixture.componentInstance.form.errors?.['tipExceedsLimit'],
      ).toBeTruthy();
      expect(fixture.componentInstance.form.valid).toBe(false);
    });
  });

  describe('submit button', () => {
    it('is disabled while the form is invalid', () => {
      const { fixture } = setup();
      const btn: HTMLButtonElement =
        fixture.nativeElement.querySelector('[data-submit]');
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(true);
    });

    it('is enabled when the form is valid', () => {
      const { fixture } = setup();
      fillValidForm(fixture);
      const btn: HTMLButtonElement =
        fixture.nativeElement.querySelector('[data-submit]');
      expect(btn.disabled).toBe(false);
    });
  });

  describe('valid submit', () => {
    it('POSTs to /api/orders with cart totals, items, and contact info', () => {
      const { fixture, http, store } = setup();
      fillValidForm(fixture);
      fixture.componentInstance.submit();
      const req = http.expectOne('/api/orders');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        items: [
          { mealId: 'm1', quantity: 2, itemNote: null },
          { mealId: 'm2', quantity: 1, itemNote: null },
        ],
        subtotalCents: store.subtotalCents(),
        taxCents: store.taxCents(),
        tipCents: 100,
        totalCents: store.grandTotalCents() + 100,
        deliveryAddress: '123 Main St',
        deliveryPostal: '94103',
        phone: '+14155552671',
        notes: null,
      });
      req.flush({ id: 'ord-123' });
      http.verify();
    });

    it('sends per-item notes from the FormArray', () => {
      const { fixture, http } = setup();
      fillValidForm(fixture);
      const items = fixture.componentInstance.form.get('items') as FormArray;
      items.at(0).patchValue({ note: 'no wasabi' });
      items.at(1).patchValue({ note: '' });
      fixture.componentInstance.submit();
      const req = http.expectOne('/api/orders');
      expect(req.request.body.items).toEqual([
        { mealId: 'm1', quantity: 2, itemNote: 'no wasabi' },
        { mealId: 'm2', quantity: 1, itemNote: null },
      ]);
      req.flush({ id: 'ord-123' });
      http.verify();
    });

    it('navigates to /orders/:id with the response id', async () => {
      const { fixture, http, navigate } = setup();
      fillValidForm(fixture);
      fixture.componentInstance.submit();
      const req = http.expectOne('/api/orders');
      req.flush({ id: 'ord-xyz' });
      await Promise.resolve();
      expect(navigate).toHaveBeenCalledWith(['/orders', 'ord-xyz']);
      http.verify();
    });

    it('clears the cart after a successful submit', async () => {
      const { fixture, http, store } = setup();
      fillValidForm(fixture);
      fixture.componentInstance.submit();
      const req = http.expectOne('/api/orders');
      req.flush({ id: 'ord-xyz' });
      await Promise.resolve();
      expect(store.items()).toEqual([]);
      http.verify();
    });

    it('is a no-op when the form is invalid', () => {
      const { fixture, http } = setup();
      fixture.componentInstance.submit();
      http.expectNone('/api/orders');
    });
  });
});
