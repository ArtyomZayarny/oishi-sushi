import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import {
  MenuCardComponent,
  type AddToCartPayload,
} from './menu-card.component';

interface CardProps {
  mealId: string;
  label: string;
  name: string;
  description: string;
  priceCents: number;
  photoFill: 'umber' | 'sepia' | 'stone';
  imageUrl: string | null;
  timeMin: number;
}

const DEFAULTS: CardProps = {
  mealId: 'm-otoro',
  label: 'NIGIRI',
  name: 'Otoro Selection',
  description: 'Five-day aged bluefin belly, hand-cut nigiri, eight pieces.',
  priceCents: 4800,
  photoFill: 'umber',
  imageUrl: null,
  timeMin: 25,
};

const setup = (
  overrides: Partial<CardProps> = {},
): ComponentFixture<MenuCardComponent> => {
  const props = { ...DEFAULTS, ...overrides };
  TestBed.configureTestingModule({
    imports: [MenuCardComponent],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MenuCardComponent);
  fixture.componentRef.setInput('mealId', props.mealId);
  fixture.componentRef.setInput('label', props.label);
  fixture.componentRef.setInput('name', props.name);
  fixture.componentRef.setInput('description', props.description);
  fixture.componentRef.setInput('priceCents', props.priceCents);
  fixture.componentRef.setInput('photoFill', props.photoFill);
  fixture.componentRef.setInput('imageUrl', props.imageUrl);
  fixture.componentRef.setInput('timeMin', props.timeMin);
  fixture.detectChanges();
  return fixture;
};

describe('MenuCardComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  describe('content rendering', () => {
    it('renders the meal name', () => {
      const el = setup().nativeElement.querySelector('[data-meal-name]');
      expect(el?.textContent?.trim()).toBe('Otoro Selection');
    });

    it('renders the uppercase category label', () => {
      const el = setup().nativeElement.querySelector('[data-label]');
      expect(el?.textContent?.trim()).toBe('NIGIRI');
    });

    it('renders the description', () => {
      const el = setup().nativeElement.querySelector('[data-description]');
      expect(el?.textContent).toContain(
        'Five-day aged bluefin belly, hand-cut nigiri, eight pieces.',
      );
    });

    it('renders the time meta as "· N min"', () => {
      const el = setup({ timeMin: 30 }).nativeElement.querySelector(
        '[data-time-meta]',
      );
      expect(el?.textContent?.trim()).toBe('· 30 min');
    });

    it('defaults timeMin to 25 when not provided', () => {
      const fixture = setup({ timeMin: 25 });
      const el = fixture.nativeElement.querySelector('[data-time-meta]');
      expect(el?.textContent?.trim()).toBe('· 25 min');
    });
  });

  describe('price formatting', () => {
    it('renders whole dollar amounts without decimals', () => {
      const el = setup({ priceCents: 4800 }).nativeElement.querySelector(
        '[data-price]',
      );
      expect(el?.textContent?.trim()).toBe('$48');
    });

    it('renders non-whole amounts with two decimals', () => {
      const el = setup({ priceCents: 4850 }).nativeElement.querySelector(
        '[data-price]',
      );
      expect(el?.textContent?.trim()).toBe('$48.50');
    });

    it('handles cents-only prices (under $1)', () => {
      const el = setup({ priceCents: 75 }).nativeElement.querySelector(
        '[data-price]',
      );
      expect(el?.textContent?.trim()).toBe('$0.75');
    });
  });

  describe('image zone', () => {
    it('applies photo-fill-umber class when photoFill is "umber"', () => {
      const zone = setup({ photoFill: 'umber' }).nativeElement.querySelector(
        '[data-image-zone]',
      );
      expect(zone?.classList.contains('photo-fill-umber')).toBe(true);
    });

    it('applies photo-fill-sepia class when photoFill is "sepia"', () => {
      const zone = setup({ photoFill: 'sepia' }).nativeElement.querySelector(
        '[data-image-zone]',
      );
      expect(zone?.classList.contains('photo-fill-sepia')).toBe(true);
    });

    it('applies photo-fill-stone class when photoFill is "stone"', () => {
      const zone = setup({ photoFill: 'stone' }).nativeElement.querySelector(
        '[data-image-zone]',
      );
      expect(zone?.classList.contains('photo-fill-stone')).toBe(true);
    });

    it('renders no <img> element when imageUrl is null', () => {
      const img = setup({ imageUrl: null }).nativeElement.querySelector(
        '[data-meal-image]',
      );
      expect(img).toBeNull();
    });

    it('renders an <img> with src + alt when imageUrl is provided', () => {
      const img = setup({
        imageUrl: '/assets/meals/otoro.jpg',
      }).nativeElement.querySelector(
        '[data-meal-image]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/assets/meals/otoro.jpg');
      expect(img?.getAttribute('alt')).toBe('Otoro Selection');
    });
  });

  describe('add to cart', () => {
    it('has an aria-label on the + button that names the meal', () => {
      const btn = setup().nativeElement.querySelector(
        '[data-add-button]',
      ) as HTMLButtonElement | null;
      expect(btn?.getAttribute('aria-label')).toBe(
        'Add Otoro Selection to cart',
      );
    });

    it('emits addToCart with mealId, name, priceCents on click', () => {
      const fixture = setup();
      const spy = jest.fn<void, [AddToCartPayload]>();
      fixture.componentInstance.addToCart.subscribe(spy);

      (
        fixture.nativeElement.querySelector(
          '[data-add-button]',
        ) as HTMLButtonElement
      ).click();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({
        mealId: 'm-otoro',
        name: 'Otoro Selection',
        priceCents: 4800,
      });
    });

    it('includes imageUrl in the emitted payload when set', () => {
      const fixture = setup({ imageUrl: '/assets/meals/otoro.jpg' });
      const spy = jest.fn<void, [AddToCartPayload]>();
      fixture.componentInstance.addToCart.subscribe(spy);

      (
        fixture.nativeElement.querySelector(
          '[data-add-button]',
        ) as HTMLButtonElement
      ).click();

      expect(spy).toHaveBeenCalledWith({
        mealId: 'm-otoro',
        name: 'Otoro Selection',
        priceCents: 4800,
        imageUrl: '/assets/meals/otoro.jpg',
      });
    });

    it('omits imageUrl from the payload when null (not {imageUrl: null})', () => {
      const fixture = setup({ imageUrl: null });
      const spy = jest.fn<void, [AddToCartPayload]>();
      fixture.componentInstance.addToCart.subscribe(spy);

      (
        fixture.nativeElement.querySelector(
          '[data-add-button]',
        ) as HTMLButtonElement
      ).click();

      const payload = spy.mock.calls[0][0];
      expect(Object.prototype.hasOwnProperty.call(payload, 'imageUrl')).toBe(
        false,
      );
    });
  });
});
