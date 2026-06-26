import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SommelierAskResponse, SommelierSource } from '@org/shared-types';
import {
  ANTHROPIC_CLIENT,
  type AnthropicClientProvider,
} from './anthropic-client';
import { extractAvoidedAllergens } from './allergen-extractor';
import {
  assembleCandidates,
  flattenSnapshot,
  type Candidate,
  type SnapshotMeal,
} from './candidates';
import { SommelierAskDto } from './dto/sommelier-ask.dto';
import { SOMMELIER_MENU, type MenuPort } from './menu.port';
import { postValidate } from './post-validate';
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
   *   2. {@link extractAvoidedAllergens} unions the free-text avoidance intent
   *      parsed from the query with the structured chip (F4-AC1, free-text leg),
   *      then {@link assembleCandidates} runs the hard allergen filter (T6) +
   *      newest marking over that effective set; returns candidates + excludedIds
   *      (the latter handed to T8).
   *   3. `retriever.retrieve(query)` — KB docs (T4).
   *   4. Build the grounded system + user prompt; build the EXACT `sources` list
   *      the prompt numbers and the response returns.
   *   5. Call the model (T7 client wrapper) → raw `{answer,picks,confidence}`.
   *   6. `recordUsage(input+output)` — SUCCESS path only (a 503 throws before
   *      here, so no tokens are charged on failure).
   *   7. Fail-closed post-validation + assembly via {@link postValidate} (T8).
   *
   * T8 — fail-closed post-validation (the ENFORCED safety backstop, §4 step 8–9,
   * §7.4). {@link postValidate} consumes the intermediate + the request-scope
   * snapshot and enforces, in order: on-menu subset (F5-AC1), allergen re-check
   * vs `excludedIds` with a `requestId` warn (F4-AC2/3), cap at 5, server-side
   * name/price/imageUrl join from the snapshot (F5-AC3), the
   * `abstain ⟹ recommendations:[]` invariant + degrade-to-abstain when every
   * pick is dropped (F6-AC1), the answer-text scan (no excluded names, no URLs,
   * ≤600 chars, §7.4), and `[n]` citation consistency (F1-AC4). The model can
   * never fabricate a meal, a price, or an allergen-unsafe recommendation.
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
    const snapshot = flattenSnapshot(categories);
    const snapshotById = new Map<string, SnapshotMeal>(
      snapshot.map((m) => [m.id, m]),
    );
    // 2. Hard allergen filter + newest marking (T6). The effective avoidance set
    //    is the structured chip UNION the free-text avoidance intent parsed from
    //    the query (F4-AC1, free-text leg): `knownAllergens` is the live menu
    //    vocabulary, so a typed "without shellfish" engages the SAME deterministic
    //    hard gate as the chip and the candidate list the model sees stays truly
    //    "already filtered safe" (the prompt's claim). When the extractor finds
    //    nothing the set equals the chip, so the chip-only path is byte-identical.
    const knownAllergens = [...new Set(snapshot.flatMap((m) => m.allergens))];
    const avoidAllergens = [
      ...new Set([
        ...(dto.avoidAllergens ?? []),
        ...extractAvoidedAllergens(dto.query, knownAllergens),
      ]),
    ];
    const { candidates, excludedIds } = assembleCandidates(
      categories,
      avoidAllergens,
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

    // 7. Fail-closed post-validation + assembly (T8). Pure; the enforced
    //    backstop — every safety invariant is applied here, not in the prompt.
    const response = postValidate(intermediate, snapshotById);

    this.logger.log(
      `sommelier ${requestId} ok: tokens=${inputTokens}+${outputTokens} ` +
        `candidates=${candidates.length} excluded=${excludedIds.length} ` +
        `confidence=${response.confidence} recommendations=${response.recommendations.length}`,
    );

    return response;
  }
}
