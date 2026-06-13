import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  SommelierAskResponse,
  SommelierMealRef,
  SommelierSource,
} from '@org/shared-types';
import {
  ANTHROPIC_CLIENT,
  type AnthropicClientProvider,
} from './anthropic-client';
import {
  assembleCandidates,
  flattenSnapshot,
  type Candidate,
  type SnapshotMeal,
} from './candidates';
import { SommelierAskDto } from './dto/sommelier-ask.dto';
import { SOMMELIER_MENU, type MenuPort } from './menu.port';
import {
  buildSources,
  buildSystemPrompt,
  buildUserPrompt,
  SOMMELIER_OUTPUT_SCHEMA,
  type SommelierModelOutput,
} from './prompt-builder';
import { DailyTokenBudget } from './daily-token-budget.service';
import {
  SOMMELIER_RETRIEVER,
  type Retriever,
  type RetrievedDoc,
} from './retriever';

/**
 * The typed T7→T8 seam. T7 produces this intermediate from one model call; T8
 * (fail-closed post-validation) consumes `rawOutput`, `candidates`, and
 * `excludedIds` to harden the assembly (subset check, allergen re-check, cap 5,
 * abstain invariant, answer-text scan). `sources` is the prebuilt, CANDIDATE-
 * indexed list the prompt numbered and the response returns (so `[n]` stays
 * aligned even after T8 drops picks). `requestId` correlates logs/eval.
 */
export interface SommelierAskIntermediate {
  rawOutput: SommelierModelOutput;
  candidates: Candidate[];
  excludedIds: string[];
  sources: SommelierSource[];
  requestId: string;
}

@Injectable()
export class SommelierService {
  private readonly logger = new Logger(SommelierService.name);

  constructor(
    @Inject(SOMMELIER_MENU) private readonly menu: MenuPort,
    @Inject(SOMMELIER_RETRIEVER) private readonly retriever: Retriever,
    @Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicClientProvider,
    private readonly budget: DailyTokenBudget,
  ) {}

  /**
   * T7 — grounded LLM orchestration (spec §4 lifecycle steps 2–9). Replaces the
   * T2 canned response.
   *
   * Pipeline:
   *   1. `listPublic()` ONCE → the request-scoped snapshot (§4 step 2 / F5: one
   *      snapshot serves the pre-filter here and the T8 post-validation; never a
   *      second fetch).
   *   2. {@link assembleCandidates} — hard allergen filter (T6) + newest marking;
   *      returns candidates + excludedIds (the latter handed to T8).
   *   3. `retriever.retrieve(query)` — KB docs (T4).
   *   4. Build the grounded system + user prompt; build the EXACT `sources` list
   *      the prompt numbers and the response returns.
   *   5. Call the model (T7 client wrapper) → raw `{answer,picks,confidence}`.
   *   6. `recordUsage(input+output)` — SUCCESS path only (a 503 throws before
   *      here, so no tokens are charged on failure).
   *   7. Assemble {@link SommelierAskResponse}.
   *
   * >>> T8 BOUNDARY <<<  The assembly in {@link assembleResponse} below is the
   * STRAIGHTFORWARD T7 version: it joins name/priceCents/imageUrl server-side
   * from the snapshot (the model can never fabricate a meal or price) and maps
   * picks→recommendations honestly, passing `confidence` THROUGH unchanged. T8
   * REPLACES it with the hardened fail-closed version — subset check against the
   * snapshot, allergen re-check vs `excludedIds`, cap at 5, the
   * `abstain ⟹ recommendations:[]` invariant, the degrade rule, and the
   * answer-text scan (no excluded names, no URLs, length cap). Until T8 lands,
   * this version does NOT enforce those invariants.
   *
   * Logging (§7.7 privacy): logs the requestId, token counts, and outcome flags
   * only — NEVER the raw query text.
   */
  async ask(dto: SommelierAskDto): Promise<SommelierAskResponse> {
    const requestId = `req_${randomUUID()}`;

    // 1. Single snapshot (§4 step 2). Keep the flattened meal rows for the
    //    server-side display join (name/priceCents/imageUrl come from the DB
    //    row, never the model — F5-AC3); the model only ever sees candidates.
    const categories = await this.menu.listPublic();
    const snapshotById = new Map<string, SnapshotMeal>(
      flattenSnapshot(categories).map((m) => [m.id, m]),
    );
    // 2. Hard allergen filter + newest marking (T6).
    const { candidates, excludedIds } = assembleCandidates(
      categories,
      dto.avoidAllergens,
    );
    // 3. KB retrieval (T4) — naive v1 ignores the query and returns all docs.
    const docs: RetrievedDoc[] = await this.retriever.retrieve(dto.query);

    // 4. Grounded prompt + the exact sources list the prompt numbers.
    const sources = buildSources(candidates, docs);
    const system = buildSystemPrompt();
    const userText = buildUserPrompt(dto.query, candidates, docs);

    // 5. Model call (503 on missing-key / SDK error / timeout / malformed).
    const { rawOutput, inputTokens, outputTokens } =
      await this.client.createMessage({
        system,
        userText,
        schema: SOMMELIER_OUTPUT_SCHEMA,
      });

    // 6. Record usage — success path only.
    this.budget.recordUsage(inputTokens + outputTokens);

    const intermediate: SommelierAskIntermediate = {
      rawOutput,
      candidates,
      excludedIds,
      sources,
      requestId,
    };

    const response = this.assembleResponse(intermediate, snapshotById);

    this.logger.log(
      `sommelier ${requestId} ok: tokens=${inputTokens}+${outputTokens} ` +
        `candidates=${candidates.length} excluded=${excludedIds.length} ` +
        `confidence=${response.confidence} recommendations=${response.recommendations.length}`,
    );

    return response;
  }

  /**
   * STRAIGHTFORWARD T7 assembly (see the T8 BOUNDARY note on {@link ask}).
   * Joins display fields server-side from the snapshot by id; maps
   * picks→recommendations; passes confidence through. T8 replaces this with the
   * fail-closed version.
   */
  private assembleResponse(
    intermediate: SommelierAskIntermediate,
    snapshotById: Map<string, SnapshotMeal>,
  ): SommelierAskResponse {
    const { rawOutput, candidates, sources, requestId } = intermediate;
    const candidateIds = new Set(candidates.map((c) => c.id));

    const recommendations: SommelierMealRef[] = [];
    for (const pick of rawOutput.picks) {
      // T7 join: a pick must be a candidate the model was actually offered, and
      // its display fields come from the authoritative snapshot meal row — never
      // the model (F5-AC3: the model structurally cannot fabricate a name or
      // price). A pick whose id is not a candidate is skipped here; T8
      // formalizes this as the fail-closed subset + allergen re-check.
      if (!candidateIds.has(pick.mealId)) {
        continue;
      }
      const meal = snapshotById.get(pick.mealId);
      if (meal === undefined) {
        continue;
      }
      recommendations.push({
        mealId: meal.id,
        name: meal.name,
        priceCents: meal.priceCents,
        imageUrl: meal.imageUrl ?? null,
        why: pick.why,
      });
    }

    return {
      answer: rawOutput.answer,
      recommendations,
      sources,
      confidence: rawOutput.confidence,
      requestId,
    };
  }
}
