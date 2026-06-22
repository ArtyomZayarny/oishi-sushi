import Anthropic from '@anthropic-ai/sdk';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import { SOMMELIER_UNAVAILABLE_ENVELOPE } from './daily-token-budget.guard';
import type { SommelierModelOutput } from './prompt-builder';
import { sommelierConfig } from './sommelier.config';

/**
 * T7 — the injectable Anthropic client wrapper (spec §4 step 7, §8 error
 * mapping, §10 T7 row). Two-layer DI seam:
 *
 *   ANTHROPIC_MESSAGES → {@link MessagesCreator}: a thin `create(params, opts)`
 *   over the SDK's `messages`. This is the ONLY place the SDK is touched, and
 *   the spy point that proves the literal params handed to `messages.create`
 *   (model id, NO sampling params, NO thinking, NO assistant prefill — all of
 *   which 400 on Opus 4.8).
 *
 *   ANTHROPIC_CLIENT → {@link AnthropicClientProvider}: what SommelierService
 *   depends on. Owns: missing-key handling (503 at call time), the model-call
 *   constraints, the per-request timeout, error→503 mapping, and parsing the
 *   structured JSON output. It does NOT record token usage — the service does
 *   that on the success path so no tokens are charged on a 503.
 */

/** DI token for the inner SDK-wrapping {@link MessagesCreator}. */
export const ANTHROPIC_MESSAGES = Symbol('ANTHROPIC_MESSAGES');

/** DI token for the outer {@link AnthropicClientProvider}. */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

/**
 * The minimal surface of `client.messages` the provider needs. A `null` creator
 * means no API key was configured — the provider maps that to a 503 at call
 * time (never constructs a real SDK client without a key).
 */
export interface MessagesCreator {
  create(
    params: MessageCreateParamsNonStreaming,
    options?: { timeout?: number },
  ): Promise<Message>;
}

/** What the service receives back from one model call. */
export interface SommelierModelCallResult {
  rawOutput: SommelierModelOutput;
  inputTokens: number;
  outputTokens: number;
}

/** What the provider needs to make one grounded model call. */
export interface SommelierModelCallParams {
  system: string;
  userText: string;
  schema: Record<string, unknown>;
}

/**
 * Default {@link MessagesCreator} factory (the real provider). Constructs the
 * SDK client from `cfg.anthropicApiKey` ONLY when a key is present, applying the
 * server-side timeout at construction. Returns `null` when there is no key, so
 * the app boots fine without `ANTHROPIC_API_KEY` and only 503s when the route
 * actually invokes the model.
 */
export function createDefaultMessagesCreator(
  cfg: ConfigType<typeof sommelierConfig>,
): MessagesCreator | null {
  if (!cfg.hasAnthropicKey || cfg.anthropicApiKey === undefined) {
    return null;
  }
  const client = new Anthropic({
    apiKey: cfg.anthropicApiKey,
    timeout: cfg.timeoutMs,
  });
  return {
    create: (params, options) => client.messages.create(params, options),
  };
}

@Injectable()
export class AnthropicClientProvider {
  private readonly logger = new Logger(AnthropicClientProvider.name);

  constructor(
    @Inject(sommelierConfig.KEY)
    private readonly cfg: ConfigType<typeof sommelierConfig>,
    @Inject(ANTHROPIC_MESSAGES)
    private readonly messages: MessagesCreator | null,
  ) {}

  /**
   * Make one grounded, non-streaming Opus 4.8 call and return the parsed
   * structured output + token usage.
   *
   * Failure modes all map to the pinned 503 `SOMMELIER_UNAVAILABLE` envelope
   * (retryable): missing key (no creator), any Anthropic SDK error
   * (`APIError` and subclasses — auth/rate/overload/server/billing) AND the
   * timeout (`APIConnectionTimeoutError`, an `APIError` subclass), and a
   * malformed/unparseable structured response (a broken envelope is an upstream
   * failure, NOT a model abstain).
   *
   * NEVER logs the raw query text (§7.7) — only the requestId-free outcome and
   * error class.
   */
  async createMessage(
    params: SommelierModelCallParams,
  ): Promise<SommelierModelCallResult> {
    // Missing-key handling (§9 / ticket): boot OK without a key; throw 503 at
    // CALL TIME. The authoritative signal is `cfg.hasAnthropicKey` (the ticket
    // wording: "if !cfg.hasAnthropicKey → throw"); the creator is also null in
    // that case (the factory never builds a keyless SDK client), so we guard
    // both. The inner creator is NEVER invoked without a key.
    if (!this.cfg.hasAnthropicKey || this.messages === null) {
      this.logger.warn(
        'Sommelier model call attempted with no ANTHROPIC_API_KEY configured — returning 503.',
      );
      throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
    }

    // Model-call constraints (Opus 4.8 — CRITICAL): model from config;
    // non-streaming; max_tokens from config; structured JSON via
    // output_config.format; NO top_p/top_k/budget_tokens; NO thinking; NO
    // assistant prefill (every message is role:user).
    //
    // temperature is accepted on Sonnet/Haiku but REJECTED (400) on Opus
    // 4.7/4.8/Fable — it is included ONLY when cfg.temperature is set
    // (SOMMELIER_TEMPERATURE), so the default Opus path omits it entirely. Only
    // set SOMMELIER_TEMPERATURE on a model that accepts it.
    const body: MessageCreateParamsNonStreaming = {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.userText }],
      output_config: {
        format: { type: 'json_schema', schema: params.schema },
      },
      ...(this.cfg.temperature !== undefined
        ? { temperature: this.cfg.temperature }
        : {}),
    };

    let response: Message;
    try {
      // Per-request timeout = cfg.timeoutMs; on timeout the SDK throws
      // APIConnectionTimeoutError, caught below as part of the APIError family.
      response = await this.messages.create(body, {
        timeout: this.cfg.timeoutMs,
      });
    } catch (error: unknown) {
      if (error instanceof Anthropic.APIError) {
        this.logger.error(
          `Sommelier model call failed: ${error.constructor.name}` +
            (typeof error.status === 'number'
              ? ` (status ${error.status})`
              : ''),
        );
        throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
      }
      // Unknown non-SDK failure: still fail closed to a retryable 503. Log the
      // error class only — never the prompt/query text.
      this.logger.error(
        `Sommelier model call failed with a non-SDK error: ` +
          `${error instanceof Error ? error.constructor.name : typeof error}`,
      );
      throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
    }

    const rawOutput = this.parseStructuredOutput(response);
    return {
      rawOutput,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Read the structured JSON out of the response's text block. With
   * output_config.format the shape is contractually guaranteed, so any of
   * {no text block, non-text content, unparseable JSON} is an upstream failure
   * ⇒ 503 (NOT a degrade-to-abstain; abstain is a real model decision). Field-
   * level validation (confidence enum, picks shape, caps) is T8's job.
   */
  private parseStructuredOutput(response: Message): SommelierModelOutput {
    const textBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'text' }> =>
        block.type === 'text',
    );
    if (textBlock === undefined) {
      this.logger.error(
        'Sommelier model returned no text content block — treating as upstream failure (503).',
      );
      throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
    }
    try {
      return JSON.parse(textBlock.text) as SommelierModelOutput;
    } catch {
      this.logger.error(
        'Sommelier model returned unparseable structured output — treating as upstream failure (503).',
      );
      throw new ServiceUnavailableException(SOMMELIER_UNAVAILABLE_ENVELOPE);
    }
  }
}
