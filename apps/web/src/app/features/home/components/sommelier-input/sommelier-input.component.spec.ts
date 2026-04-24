import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { CartStore } from '../../../../features/cart/cart.store';
import { SommelierInputComponent } from './sommelier-input.component';

const PLACEHOLDER =
  'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';

const setup = (): {
  fixture: ComponentFixture<SommelierInputComponent>;
  cart: InstanceType<typeof CartStore>;
} => {
  TestBed.configureTestingModule({
    imports: [SommelierInputComponent],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(SommelierInputComponent);
  fixture.detectChanges();
  return { fixture, cart: TestBed.inject(CartStore) };
};

describe('SommelierInputComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  describe('static content', () => {
    it('renders the "— SOMMELIER AI" label in amber', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-label]');
      expect(el?.textContent?.trim()).toBe('— SOMMELIER AI');
    });

    it('renders the italic tagline', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-tagline]');
      expect(el?.textContent).toContain(
        'Ask what’s freshest tonight, what pairs with sake, what to try first.',
      );
    });

    it('renders the exact placeholder text from the spec', () => {
      const { fixture } = setup();
      const input = fixture.nativeElement.querySelector(
        '[data-kenji-input]',
      ) as HTMLInputElement | null;
      expect(input?.getAttribute('placeholder')).toBe(PLACEHOLDER);
    });

    it('renders the "Powered by Oishi AI" static footer text', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-powered-by]');
      expect(el?.textContent?.trim()).toBe('Powered by Oishi AI');
    });

    it('attaches a visually-hidden label to the input', () => {
      const { fixture } = setup();
      const label = fixture.nativeElement.querySelector(
        'label[for="kenji"]',
      ) as HTMLLabelElement | null;
      expect(label).not.toBeNull();
      expect(label?.classList.contains('sr-only')).toBe(true);
    });
  });

  describe('meta line (cart-derived)', () => {
    it('reads "Your cart is empty · delivery in 40 min" when cart empty', () => {
      const { fixture } = setup();
      const el = fixture.nativeElement.querySelector('[data-meta]');
      expect(el?.textContent?.trim()).toBe(
        'Your cart is empty · delivery in 40 min',
      );
    });

    it('shows "N items" plural when quantity > 1', () => {
      const { fixture, cart } = setup();
      cart.addItem({ mealId: 'm1', name: 'Otoro', priceCents: 4800 });
      cart.addItem({ mealId: 'm1', name: 'Otoro', priceCents: 4800 });
      fixture.detectChanges();
      const el = fixture.nativeElement.querySelector('[data-meta]');
      // subtotal 9600 + 15% tax = 9600 + 1440 = 11040 → $110.40
      expect(el?.textContent?.trim()).toBe(
        'Your order: 2 items · $110.40 · delivery in 40 min',
      );
    });

    it('shows "1 item" singular when quantity === 1', () => {
      const { fixture, cart } = setup();
      cart.addItem({ mealId: 'm1', name: 'Otoro', priceCents: 4800 });
      fixture.detectChanges();
      const el = fixture.nativeElement.querySelector('[data-meta]');
      // 4800 + 15% = 5520 → $55.20
      expect(el?.textContent?.trim()).toBe(
        'Your order: 1 item · $55.20 · delivery in 40 min',
      );
    });
  });

  describe('submit flow (stub)', () => {
    it('is a no-op when the query is empty', () => {
      const { fixture } = setup();
      const logSpy = jest.spyOn(console, 'info').mockImplementation();
      fixture.componentInstance.onSubmit();
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('is a no-op when the query is whitespace-only', () => {
      const { fixture } = setup();
      const logSpy = jest.spyOn(console, 'info').mockImplementation();
      fixture.componentInstance.form.controls.query.setValue('   ');
      fixture.componentInstance.onSubmit();
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('logs the trimmed query and toggles loading on submit', () => {
      const { fixture } = setup();
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      fixture.componentInstance.form.controls.query.setValue('  hello  ');
      fixture.componentInstance.onSubmit();

      expect(fixture.componentInstance.loading()).toBe(true);
      expect(logSpy).toHaveBeenCalledWith('[sommelier:stub]', 'hello');

      jest.advanceTimersByTime(1500);
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.form.controls.query.value).toBe('');

      logSpy.mockRestore();
    });

    it('ignores repeat submits while loading', () => {
      const { fixture } = setup();
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      fixture.componentInstance.form.controls.query.setValue('first');
      fixture.componentInstance.onSubmit();
      // second call while loading
      fixture.componentInstance.form.controls.query.setValue('second');
      fixture.componentInstance.onSubmit();

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[sommelier:stub]', 'first');

      logSpy.mockRestore();
    });
  });

  describe('send button state', () => {
    it('renders the arrow-up lucide icon by default', () => {
      const { fixture } = setup();
      const icon = fixture.nativeElement.querySelector('lucide-icon');
      expect(icon).not.toBeNull();
    });

    it('swaps the icon for an ellipsis while loading', () => {
      const { fixture } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      fixture.detectChanges();
      const ellipsis = fixture.nativeElement.querySelector('[data-ellipsis]');
      expect(ellipsis).not.toBeNull();
    });

    it('disables the send button while loading', () => {
      const { fixture } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-send-button]',
      ) as HTMLButtonElement | null;
      expect(btn?.disabled).toBe(true);
    });
  });
});
