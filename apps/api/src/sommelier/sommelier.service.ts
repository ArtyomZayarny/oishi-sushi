import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SommelierAskResponse } from '@org/shared-types';
import { SommelierAskDto } from './dto/sommelier-ask.dto';

@Injectable()
export class SommelierService {
  /**
   * T2 PLACEHOLDER — returns a canned, wire-valid {@link SommelierAskResponse}.
   *
   * No retrieval, no LLM, no DB join yet. The real pipeline lands across T6
   * (hard allergen filter + newest marking), T7 (grounded LLM orchestration),
   * and T8 (fail-closed post-validation + server-side name/price join). This
   * stub exists only so the route is real, validated, throttled and
   * cost-guarded end-to-end, and so the frontend (T10–T12) has a stable,
   * renderable shape to build against from day one.
   *
   * The shape is deliberately `confidence: 'high'` with non-empty
   * recommendations AND matching non-empty sources, so the F1-AC4 invariant
   * ("sources non-empty whenever recommendations non-empty") holds.
   */
  ask(dto: SommelierAskDto): SommelierAskResponse {
    // The query is echoed only to keep the placeholder honest about what it
    // received; T7 replaces this with a grounded, model-generated answer.
    const preview = dto.query.slice(0, 60);
    return {
      answer:
        `This is a placeholder sommelier reply to "${preview}" [1][2]. ` +
        'Live, grounded recommendations arrive once the knowledge base and ' +
        'model orchestration land (T7/T8).',
      recommendations: [
        {
          mealId: 'placeholder-meal-1',
          name: 'Placeholder Roll',
          priceCents: 1290,
          imageUrl: null,
          why: 'Placeholder reason — replaced by a grounded justification in T8.',
        },
        {
          mealId: 'placeholder-meal-2',
          name: 'Placeholder Nigiri',
          priceCents: 990,
          imageUrl: null,
          why: 'Placeholder reason — replaced by a grounded justification in T8.',
        },
      ],
      sources: [
        { type: 'menu', ref: 'placeholder-meal-1' },
        { type: 'menu', ref: 'placeholder-meal-2' },
      ],
      confidence: 'high',
      requestId: `req_${randomUUID()}`,
    };
  }
}
