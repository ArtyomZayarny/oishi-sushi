import { provideZonelessChangeDetection, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { OrderStatus, OrderStatusEvent } from '@org/shared-types';

import { OrdersService } from '../../services/orders.service';
import { OrderTrackingComponent } from './order-tracking.component';

type Fixture = ComponentFixture<OrderTrackingComponent>;

const makeEvent = (orderId: string, status: OrderStatus): OrderStatusEvent => ({
  orderId,
  userId: 'u1',
  status,
  timestamp: '2026-04-24T00:00:00Z',
});

const badgeOf = (fixture: Fixture): HTMLElement =>
  fixture.nativeElement.querySelector('[data-badge]') as HTMLElement;

describe('OrderTrackingComponent', () => {
  let statusChanges: ReturnType<typeof signal<OrderStatusEvent | null>>;

  const setup = (props: { id: string; initialStatus?: OrderStatus }): Fixture => {
    statusChanges = signal<OrderStatusEvent | null>(null);
    TestBed.configureTestingModule({
      imports: [OrderTrackingComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: OrdersService, useValue: { statusChanges } },
      ],
    });
    const fixture = TestBed.createComponent(OrderTrackingComponent);
    fixture.componentRef.setInput('id', props.id);
    if (props.initialStatus) {
      fixture.componentRef.setInput('initialStatus', props.initialStatus);
    }
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => TestBed.resetTestingModule());

  it('renders the initial status as a badge', () => {
    const fixture = setup({ id: 'o1', initialStatus: 'PENDING' });
    expect(badgeOf(fixture).textContent).toContain('PENDING');
  });

  it('falls back to PENDING when no initial status is provided', () => {
    const fixture = setup({ id: 'o1' });
    expect(badgeOf(fixture).textContent).toContain('PENDING');
  });

  it('updates the badge when the status signal emits for this orderId', () => {
    const fixture = setup({ id: 'o1', initialStatus: 'PENDING' });
    statusChanges.set(makeEvent('o1', 'CONFIRMED'));
    fixture.detectChanges();
    expect(badgeOf(fixture).textContent).toContain('CONFIRMED');
  });

  it('ignores status events for a different orderId', () => {
    const fixture = setup({ id: 'o1', initialStatus: 'PENDING' });
    statusChanges.set(makeEvent('o-other', 'DELIVERED'));
    fixture.detectChanges();
    expect(badgeOf(fixture).textContent).toContain('PENDING');
  });

  it('increments a flash key on every matching status change', () => {
    const fixture = setup({ id: 'o1', initialStatus: 'PENDING' });
    const keyBefore = badgeOf(fixture).getAttribute('data-flash-key');

    statusChanges.set(makeEvent('o1', 'CONFIRMED'));
    fixture.detectChanges();
    const keyAfterFirst = badgeOf(fixture).getAttribute('data-flash-key');
    expect(keyAfterFirst).not.toBe(keyBefore);

    statusChanges.set(makeEvent('o1', 'PREPARING'));
    fixture.detectChanges();
    const keyAfterSecond = badgeOf(fixture).getAttribute('data-flash-key');
    expect(keyAfterSecond).not.toBe(keyAfterFirst);
  });

  it('does not bump the flash key for non-matching events', () => {
    const fixture = setup({ id: 'o1', initialStatus: 'PENDING' });
    const keyBefore = badgeOf(fixture).getAttribute('data-flash-key');
    statusChanges.set(makeEvent('o-other', 'DELIVERED'));
    fixture.detectChanges();
    expect(badgeOf(fixture).getAttribute('data-flash-key')).toBe(keyBefore);
  });
});
