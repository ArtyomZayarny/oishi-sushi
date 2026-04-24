export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  meals?: Meal[];
}

export interface Meal {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  active: boolean;
  deletedAt: string | Date | null;
  categoryId: string;
  allergens: string[];
  createdAt: string | Date;
  updatedAt: string | Date;
  options?: MealOption[];
}

export interface MealOption {
  id: string;
  mealId: string;
  name: string;
  priceDeltaCents: number;
}

export interface MealCreateReq {
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  categoryId: string;
  allergens: string[];
  active?: boolean;
}

export type MealUpdateReq = Partial<MealCreateReq>;
