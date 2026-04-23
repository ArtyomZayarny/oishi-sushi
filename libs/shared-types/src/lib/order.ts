import type { OrderStatus } from './enums.js';

export interface OrderItem {
  id: string;
  orderId: string;
  mealId: string;
  quantity: number;
  unitPriceCents: number;
  itemNote: string | null;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  deliveryAddress: string;
  deliveryPostal: string;
  phone: string;
  notes: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  items?: OrderItem[];
}

export interface OrderCreateItemReq {
  mealId: string;
  quantity: number;
  itemNote?: string | null;
}

export interface OrderCreateReq {
  items: OrderCreateItemReq[];
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  deliveryAddress: string;
  deliveryPostal: string;
  phone: string;
  notes?: string | null;
}

export interface OrderStatusPatchReq {
  status: OrderStatus;
}

export interface OrderStatusEvent {
  orderId: string;
  userId: string;
  status: OrderStatus;
  timestamp: string;
}
