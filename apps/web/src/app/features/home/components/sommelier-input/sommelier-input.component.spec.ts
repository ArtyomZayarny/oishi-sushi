import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  SommelierAskRequest,
  SommelierAskResponse,
  SommelierMealRef,
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

const ANSWER_MULTI: SommelierAskResponse = {
  answer: 'Two great picks: Spicy Tuna Roll [1] and Tuna Tataki [2].',
  recommendations: [
    {
      mealId: 'cm_str',
      name: 'Spicy Tuna Roll',
      priceCents: 1290,
      imageUrl: '/img/str.jpg',
      why: 'Sriracha-marinated tuna.',
    },
    {
      mealId: 'cm_tat',
      name: 'Tuna Tataki',
      priceCents: 1590,
      imageUrl: null,
      why: 'Seared rare tuna with pepper crust.',
    },
  ],
  sources: [
    { type: 'menu', ref: 'cm_str' },
    { type: 'menu', ref: 'cm_tat' },
  ],
  confidence: 'high',
  requestId: 'req_3',
};

const ANSWER_LOW: SommelierAskResponse = {
  ...ANSWER,
  confidence: 'low',
  requestId: 'req_low',
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

const setup = (
  inputs: { variant?: 'full' | 'compact'; menuAllergens?: string[] } = {},
): {
  fixture: ComponentFixture<SommelierInputComponent>;
  cart: InstanceType<typeof CartStore>;
  api: FakeSommelierService;
  added: SommelierMealRef[];
} => {
  const api = new FakeSommelierService();
  TestBed.configureTestingModule({
    imports: [SommelierInputComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SommelierService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(SommelierInputComponent);
  if (inputs.variant) fixture.componentRef.setInput('variant', inputs.variant);
  if (inputs.menuAllergens)
    fixture.componentRef.setInput('menuAllergens', inputs.menuAllergens);
  const added: SommelierMealRef[] = [];
  fixture.componentInstance.addToCart.subscribe((m) => added.push(m));
  fixture.detectChanges();
  return { fixture, cart: TestBed.inject(CartStore), api, added };
};

/** Drive a query through to a settled response and flush change detection. */
const ask = (
  fixture: ComponentFixture<SommelierInputComponent>,
  api: FakeSommelierService,
  query: string,
  res: SommelierAskResponse,
): void => {
  fixture.componentInstance.form.controls.query.setValue(query);
  fixture.componentInstance.onSubmit();
  api.last.next(res);
  api.last.complete();
  fixture.detectChanges();
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

    it('clears the input after a successful submit (chat-style)', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue(
        'what pairs with sake',
      );
      fixture.componentInstance.onSubmit();
      expect(api.calls.length).toBe(1);
      expect(fixture.componentInstance.form.controls.query.value).toBe('');
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

  describe('T11 — answer panel visibility (Option A overlay)', () => {
    it('renders no panel while idle', () => {
      const { fixture } = setup();
      expect(
        fixture.nativeElement.querySelector('[data-sommelier-panel]'),
      ).toBeNull();
    });

    it('opens the panel as soon as a request is in flight (loading)', () => {
      const { fixture } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-sommelier-panel]'),
      ).not.toBeNull();
    });

    it('renders a loading skeleton ("KENJI IS THINKING…") while loading', () => {
      const { fixture } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      fixture.detectChanges();
      const skeleton = fixture.nativeElement.querySelector(
        '[data-panel-loading]',
      );
      expect(skeleton).not.toBeNull();
      expect(skeleton?.textContent).toContain('KENJI IS THINKING');
    });
  });

  describe('T11 / F7-AC3 — answer state renders text + exactly N cards', () => {
    it('strips inline [n] citation markers from the displayed answer (API still returns them)', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER_MULTI);
      const text = fixture.nativeElement.querySelector('[data-answer-text]');
      // customer-facing prose: markers gone, surrounding spacing collapsed cleanly
      expect(text?.textContent).toContain(
        'Two great picks: Spicy Tuna Roll and Tuna Tataki.',
      );
      expect(text?.textContent).not.toMatch(/\[\d+\]/);
      // the API response still carries the citations (grounding/audit; F1-AC4)
      expect(fixture.componentInstance.response()?.answer).toContain('[1]');
    });

    it('renders exactly recommendations.length cards', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER_MULTI);
      const cards = fixture.nativeElement.querySelectorAll('[data-rec-card]');
      expect(cards.length).toBe(ANSWER_MULTI.recommendations.length);
      expect(cards.length).toBe(2);
    });

    it('renders one card for a single-recommendation answer', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      expect(
        fixture.nativeElement.querySelectorAll('[data-rec-card]').length,
      ).toBe(1);
    });

    it('shows name, formatted price and the why line on a card', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      const card = fixture.nativeElement.querySelector('[data-rec-card]');
      expect(card?.querySelector('[data-rec-name]')?.textContent).toContain(
        'Spicy Tuna Roll',
      );
      expect(card?.querySelector('[data-rec-price]')?.textContent).toContain(
        '$12.90',
      );
      expect(card?.querySelector('[data-rec-why]')?.textContent).toContain(
        'Sriracha-marinated tuna.',
      );
    });

    it('renders the meal image when imageUrl is present', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      const card = fixture.nativeElement.querySelector('[data-rec-card]');
      const img = card?.querySelector(
        '[data-rec-image]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/img/str.jpg');
    });

    it('renders a fallback (no <img>) when imageUrl is null', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER_MULTI);
      const cards = fixture.nativeElement.querySelectorAll('[data-rec-card]');
      // second card (Tuna Tataki) has imageUrl: null
      const second = cards[1] as HTMLElement;
      expect(second.querySelector('[data-rec-image]')).toBeNull();
      expect(second.querySelector('[data-rec-image-fallback]')).not.toBeNull();
    });

    it('renders a quiet Sources line in the answer state', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER_MULTI);
      expect(
        fixture.nativeElement.querySelector('[data-sources]'),
      ).not.toBeNull();
    });

    it('confidence:"low" renders IDENTICALLY to high — cards present, no disclaimer/badge', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER_LOW);
      expect(fixture.componentInstance.status()).toBe('answer');
      expect(
        fixture.nativeElement.querySelectorAll('[data-rec-card]').length,
      ).toBe(1);
      expect(
        fixture.nativeElement.querySelector('[data-confidence-badge]'),
      ).toBeNull();
    });
  });

  describe('T11 / F6-AC3 — abstain shows fallback + menu link, NEVER a card grid', () => {
    it('renders the abstain copy (the answer text)', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'pizza?', ABSTAIN);
      const text = fixture.nativeElement.querySelector('[data-answer-text]');
      expect(text?.textContent).toContain(
        "We don't serve pizza — we're a sushi shop.",
      );
    });

    it('also strips [n] markers in the abstain panel', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'pizza?', {
        ...ABSTAIN,
        answer: 'We only do sushi here [1] — try the menu.',
      });
      const text = fixture.nativeElement.querySelector('[data-answer-text]');
      expect(text?.textContent).toContain(
        'We only do sushi here — try the menu.',
      );
      expect(text?.textContent).not.toMatch(/\[\d+\]/);
    });

    it('renders NO recommendation cards in the abstain state', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'pizza?', ABSTAIN);
      expect(
        fixture.nativeElement.querySelectorAll('[data-rec-card]').length,
      ).toBe(0);
    });

    it('renders a prominent "Browse the full menu" link to /menu', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'pizza?', ABSTAIN);
      const link = fixture.nativeElement.querySelector(
        '[data-browse-menu]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe('/menu');
      expect(link?.textContent).toContain('menu');
    });
  });

  describe('T11 — error state renders message + Try again → retry()', () => {
    it('renders a "took too long" message for a timeout error', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('timeout'));
      fixture.detectChanges();
      const msg = fixture.nativeElement.querySelector('[data-panel-error]');
      expect(msg?.textContent?.toLowerCase()).toContain('took too long');
    });

    it('renders a "temporarily unavailable" message for an http/503 error', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('x');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('http', 503));
      fixture.detectChanges();
      const msg = fixture.nativeElement.querySelector('[data-panel-error]');
      expect(msg?.textContent?.toLowerCase()).toContain(
        'temporarily unavailable',
      );
    });

    it('the Try again button calls retry() and re-issues the same query', () => {
      const { fixture, api } = setup();
      fixture.componentInstance.form.controls.query.setValue('spicy tuna');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('http', 503));
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector(
        '[data-retry-button]',
      ) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      btn?.click();

      expect(api.calls.length).toBe(2);
      expect(api.calls[1].query).toBe('spicy tuna');
    });
  });

  describe('T11 — dismiss() closes the panel back to idle', () => {
    it('dismiss() resets status to idle', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      expect(fixture.componentInstance.status()).toBe('answer');
      fixture.componentInstance.dismiss();
      expect(fixture.componentInstance.status()).toBe('idle');
    });

    it('removes the panel from the DOM after dismiss()', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      fixture.componentInstance.dismiss();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-sommelier-panel]'),
      ).toBeNull();
    });

    it('the ✕ close button invokes dismiss()', () => {
      const { fixture, api } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      const close = fixture.nativeElement.querySelector(
        '[data-panel-close]',
      ) as HTMLButtonElement | null;
      expect(close).not.toBeNull();
      close?.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.status()).toBe('idle');
    });

    it('clicking the scrim invokes dismiss() (desktop full variant)', () => {
      const { fixture, api } = setup({ variant: 'full' });
      ask(fixture, api, 'spicy tuna', ANSWER);
      const scrim = fixture.nativeElement.querySelector(
        '[data-panel-scrim]',
      ) as HTMLElement | null;
      expect(scrim).not.toBeNull();
      scrim?.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.status()).toBe('idle');
    });
  });

  describe('T11 / F4-AC5 — allergen chips: select-only, from menu vocab, ZERO free-text', () => {
    const ALLERGENS = ['Fish', 'Shellfish', 'Soy', 'Gluten'];

    it('renders one toggle chip per distinct menu allergen passed in', () => {
      const { fixture } = setup({ menuAllergens: ALLERGENS });
      const chips = fixture.nativeElement.querySelectorAll(
        '[data-allergen-chip]',
      );
      expect(chips.length).toBe(ALLERGENS.length);
    });

    it('labels each chip with its allergen value', () => {
      const { fixture } = setup({ menuAllergens: ALLERGENS });
      const chips = Array.from(
        fixture.nativeElement.querySelectorAll('[data-allergen-chip]'),
      ) as HTMLElement[];
      const labels = chips.map((c) => c.textContent?.trim());
      expect(labels).toEqual(expect.arrayContaining(ALLERGENS));
    });

    it('renders ZERO free-text allergen inputs (a typo would defeat the gate)', () => {
      const { fixture } = setup({ menuAllergens: ALLERGENS });
      // Only the Kenji query box may exist; no text input inside the chip group.
      const chipGroup = fixture.nativeElement.querySelector(
        '[data-allergen-chips]',
      );
      expect(chipGroup).not.toBeNull();
      expect(
        chipGroup?.querySelectorAll('input[type="text"]').length ?? 0,
      ).toBe(0);
      expect(chipGroup?.querySelectorAll('input').length ?? 0).toBe(0);
    });

    it('renders no chip group when the menu has no allergens', () => {
      const { fixture } = setup({ menuAllergens: [] });
      expect(
        fixture.nativeElement.querySelector('[data-allergen-chips]'),
      ).toBeNull();
    });

    it('toggleAllergen selects then deselects an allergen', () => {
      const { fixture } = setup({ menuAllergens: ALLERGENS });
      fixture.componentInstance.toggleAllergen('Shellfish');
      expect(fixture.componentInstance.isAllergenSelected('Shellfish')).toBe(
        true,
      );
      fixture.componentInstance.toggleAllergen('Shellfish');
      expect(fixture.componentInstance.isAllergenSelected('Shellfish')).toBe(
        false,
      );
    });

    it('clicking a chip toggles its selected state', () => {
      const { fixture } = setup({ menuAllergens: ALLERGENS });
      const chip = fixture.nativeElement.querySelector(
        '[data-allergen-chip]',
      ) as HTMLButtonElement | null;
      chip?.click();
      fixture.detectChanges();
      expect(chip?.getAttribute('aria-pressed')).toBe('true');
    });

    it('passes selected chips as avoidAllergens on the next ask()', () => {
      const { fixture, api } = setup({ menuAllergens: ALLERGENS });
      fixture.componentInstance.toggleAllergen('Shellfish');
      fixture.componentInstance.toggleAllergen('Soy');
      fixture.componentInstance.form.controls.query.setValue('something safe');
      fixture.componentInstance.onSubmit();

      expect(api.calls.length).toBe(1);
      expect(api.calls[0].query).toBe('something safe');
      expect(api.calls[0].avoidAllergens).toEqual(
        expect.arrayContaining(['Shellfish', 'Soy']),
      );
      expect(api.calls[0].avoidAllergens?.length).toBe(2);
    });

    it('omits avoidAllergens (or empty) when no chip is selected', () => {
      const { fixture, api } = setup({ menuAllergens: ALLERGENS });
      fixture.componentInstance.form.controls.query.setValue('anything');
      fixture.componentInstance.onSubmit();
      const avoid = api.calls[0].avoidAllergens;
      expect(avoid === undefined || avoid.length === 0).toBe(true);
    });

    it('retry re-issues the SAME avoidAllergens snapshot (F7-AC2 stability)', () => {
      const { fixture, api } = setup({ menuAllergens: ALLERGENS });
      fixture.componentInstance.toggleAllergen('Fish');
      fixture.componentInstance.form.controls.query.setValue('no fish please');
      fixture.componentInstance.onSubmit();
      api.last.error(new SommelierError('http', 503));
      fixture.detectChanges();

      // user changes the chips after the failure — retry must use the snapshot
      fixture.componentInstance.toggleAllergen('Soy');
      fixture.componentInstance.retry();

      expect(api.calls.length).toBe(2);
      expect(api.calls[1].query).toBe('no fish please');
      expect(api.calls[1].avoidAllergens).toEqual(['Fish']);
    });
  });

  describe('T11 — addToCart seam (T12 wires CartStore; T11 only emits)', () => {
    it('the card Add button emits addToCart with the recommendation', () => {
      const { fixture, api, added } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      const addBtn = fixture.nativeElement.querySelector(
        '[data-rec-add]',
      ) as HTMLButtonElement | null;
      expect(addBtn).not.toBeNull();
      addBtn?.click();
      expect(added.length).toBe(1);
      expect(added[0]).toEqual(ANSWER.recommendations[0]);
    });

    it('does NOT touch the cart store (T11 is emit-only)', () => {
      const { fixture, api, cart } = setup();
      ask(fixture, api, 'spicy tuna', ANSWER);
      const addBtn = fixture.nativeElement.querySelector(
        '[data-rec-add]',
      ) as HTMLButtonElement | null;
      addBtn?.click();
      expect(cart.totalQuantity()).toBe(0);
    });
  });
});
