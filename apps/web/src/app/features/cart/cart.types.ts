export interface CartItem {
  mealId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string;
}

export const CART_STORAGE_KEY = 'oishi.cart.v1';
export const CART_TAX_RATE = 0.15;
