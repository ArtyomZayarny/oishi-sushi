export interface SommelierAskRequest {
  /** Customer's free-text question. Server validation: 1..500 chars. */
  query: string;
  /** Allergens to hard-exclude BEFORE generation. Values come from the menu's
   *  known allergen vocabulary (UI is select-only). Optional, ≤20 items, each 1..50 chars. */
  avoidAllergens?: string[];
}

export type SommelierConfidence = 'high' | 'low' | 'abstain';

export interface SommelierMealRef {
  /** Meal.id (cuid). Guaranteed member of MenuService.listPublic() at response time. */
  mealId: string;
  /** Snapshot fields joined server-side — never model output. */
  name: string;
  priceCents: number;
  imageUrl: string | null;
  /** 1–2 sentence grounded justification (model output, length-capped). */
  why: string;
}

export interface SommelierSource {
  type: 'menu' | 'kb';
  /** mealId for 'menu'; KB front-matter `source` slug for 'kb'. */
  ref: string;
  /** KB front-matter `section`; present only when `type: 'kb'`. */
  section?: string;
}

export interface SommelierAskResponse {
  /** Display-only text; may contain [n] citation markers (1-based into `sources`).
   *  Clients MUST NOT parse meal data out of this string — use `recommendations`. */
  answer: string;
  /** 0..5 entries. Empty when confidence === 'abstain'. */
  recommendations: SommelierMealRef[];
  sources: SommelierSource[];
  confidence: SommelierConfidence;
  /** Server-generated id for log/eval correlation. */
  requestId: string;
}
