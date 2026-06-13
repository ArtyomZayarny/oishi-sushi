import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type {
  SommelierAskRequest,
  SommelierAskResponse,
} from '@org/shared-types';
import { type Observable, Subject } from 'rxjs';

import { CartStore } from '../../../../features/cart/cart.store';
import {
  SommelierError,
  SommelierService,
} from '../../../../services/sommelier.service';
import { SommelierInputComponent } from './sommelier-input.component';

const PLACEHOLDER =
  'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';

const ANSWER: SommelierAskResponse = {
  answer: 'The Spicy Tuna Roll [1] is your best bet.',
  recommendations: [
    {
      mealId: 'cm_str',
      name: 'Spicy Tuna Roll',
      priceCents: 1290,
      imageUrl: '/img/str.jpg',
      why: 'Sriracha-marinated tuna.',
    },
  ],
  sources: [{ type: 'menu', ref: 'cm_str' }],
  confidence: 'high',
  requestId: 'req_1',
};

const ABSTAIN: SommelierAskResponse = {
  answer: "We don't serve pizza — we're a sushi shop.",
  recommendations: [],
  sources: [],
  confidence: 'abstain',
  requestId: 'req_2',
};

/** Fake service whose ask() hands back a Subject the test drives manually. */
class FakeSommelierService {
  calls: SommelierAskRequest[] = [];
  subjects: Subject<SommelierAskResponse>[] = [];
  ask(req: SommelierAskRequest): Observable<SommelierAskResponse> {
    this.calls.push(req);
    const s = new Subject<SommelierAskResponse>();
    this.subjects.push(s);
    return s.asObservable();
  }
  get last(): Subject<SommelierAskResponse> {
    return this.subjects[this.subjects.length - 1];
  }
}

const setup = (): {
  fixture: ComponentFixture<SommelierInputComponent>;
  cart: InstanceType<typeof CartStore>;
  api: FakeSommelierService;
} => {
  const api = new FakeSommelierService();
  TestBed.configureTestingModule({
    imports: [SommelierInputComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: SommelierService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(SommelierInputComponent);
  fixture.detectChanges();
  return { fixture, cart: TestBed.inject(CartStore), api };
};

describe('SommelierInputComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => {
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

  describe('submit flow — wires SommelierService (no stub timer)', () => {
    it('is a no-op when the query is empty', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.onSubmit();
      expect(api.calls.length).toBe(0);
    });

    it('is a no-op when the query is whitespace-only', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('   ');
      fixture.componentInstance.onSubmit();
      expect(api.calls.length).toBe(0);
    });

    it('calls SommelierService.ask with the trimmed query on submit', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('  hello  ');
      fixture.componentInstance.onSubmit();
      expect(api.calls.length).toBe(1);
      expect(api.calls[0].query).toBe('hello');
    });

    it('ignores repeat submits while a request is in flight', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('first');
      fixture.componentInstance.onSubmit();
      fixture.componentInstance.form.controls.query.setValue('second');
      fixture.componentInstance.onSubmit();
      expect(api.calls.length).toBe(1);
      expect(api.calls[0].query).toBe('first');
    });
  });

  describe('F7-AC1 — loading reflects HTTP in-flight (fake 1500ms timer removed)', () => {
    it('keeps loading=true past 1500ms while the request is still pending (no fake timer)', () => {
      // The deleted stub flipped loading off after a 1500ms fake timer. Prove
      // the timer is gone: advancing the clock past 1500ms must NOT clear
      // loading while the HTTP request is still in flight.
      jest.useFakeTimers();
      try {
        const { fixture } = setup();
        fixture.componentInstance.form.controls.query.setValue('x');
        fixture.componentInstance.onSubmit();
        expect(fixture.componentInstance.loading()).toBe(true);
        jest.advanceTimersByTime(5000);
        expect(fixture.componentInstance.loading()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('sets loading=true synchronously on submit and keeps it true while pending', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.loading()).toBe(false);
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      expect(fixture.componentInstance.loading()).toBe(true);
      expect(fixture.componentInstance.status()).toBe('loading');
    });

    it('clears loading exactly when the request resolves', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      expect(fixture.componentInstance.loading()).toBe(true);

      api.last.next(ANSWER);
      api.last.complete();

      expect(fixture.componentInstance.loading()).toBe(false);
    });

    it('clears loading when the request errors', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      expect(fixture.componentInstance.loading()).toBe(true);

      api.last.error(new SommelierError('http', 503));

      expect(fixture.componentInstance.loading()).toBe(false);
    });
  });

  describe('state machine — idle | loading | answer | abstain | error', () => {
    it('starts in idle with no response and no error', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.status()).toBe('idle');
      expect(fixture.componentInstance.response()).toBeNull();
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('a high/low confidence response lands in the answer state carrying the response', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('spicy tuna');
      fixture.componentInstance.onSubmit();
      api.last.next(ANSWER);
      api.last.complete();

      expect(fixture.componentInstance.status()).toBe('answer');
      expect(fixture.componentInstance.response()).toEqual(ANSWER);
      expect(fixture.componentInstance.error()).toBeNull();
    });

    it('a confidence:"abstain" response lands in the abstain state', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('pizza?');
      fixture.componentInstance.onSubmit();
      api.last.next(ABSTAIN);
      api.last.complete();

      expect(fixture.componentInstance.status()).toBe('abstain');
      expect(fixture.componentInstance.response()).toEqual(ABSTAIN);
    });

    it('an error lands in the error state carrying the typed error', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      const e = new SommelierError('timeout');
      api.last.error(e);

      expect(fixture.componentInstance.status()).toBe('error');
      expect(fixture.componentInstance.error()).toBe(e);
    });
  });

  describe('F7-AC2 — error state retry re-issues the SAME query', () => {
    it('exposes the last submitted query for retry', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('something spicy');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('http', 503));
      expect(fixture.componentInstance.status()).toBe('error');

      // user clears/retypes the box — retry must NOT depend on the live input
      fixture.componentInstance.form.controls.query.setValue('');
      fixture.componentInstance.retry();

      expect(api.calls.length).toBe(2);
      expect(api.calls[1].query).toBe('something spicy');
    });

    it('retry returns to loading then to answer on success', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('tuna');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('http', 503));

      fixture.componentInstance.retry();
      expect(fixture.componentInstance.status()).toBe('loading');
      api.last.next(ANSWER);
      api.last.complete();
      expect(fixture.componentInstance.status()).toBe('answer');
    });

    it('retry is a no-op when not in the error state', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.retry();
      expect(api.calls.length).toBe(0);
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
