import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { SOMMELIER_UNAVAILABLE_ENVELOPE } from './daily-token-budget.guard';
import { SOMMELIER_CONFIG_DEFAULTS, sommelierConfig } from './sommelier.config';
import {
  AnthropicClientProvider,
  type MessagesCreator,
} from './anthropic-client';

/**
 * T7 — the injectable Anthropic client wrapper (spec §4 step 7, §10 T7 row).
 *
 * The wrapper has a TWO-layer seam on purpose:
 *   - outer: {@link AnthropicClientProvider} (DI token ANTHROPIC_CLIENT) — the
 *     service depends on this; it owns key handling, error→503 mapping, and
 *     structured-output parsing.
 *   - inner: {@link MessagesCreator} (DI token ANTHROPIC_MESSAGES) — a thin
 *     `create(params)` wrapper over the SDK's `messages`. Spying on THIS is the
 *     only way to assert the literal params object handed to `messages.create`:
 *     model id, NO sampling params, NO thinking, NO assistant prefill (these
 *     400 on Opus 4.8 — the assertions are the regression guard).
 */

function makeConfig(
  over: Partial<ConfigType<typeof sommelierConfig>> = {},
): ConfigType<typeof sommelierConfig> {
  return {
    anthropicApiKey: 'sk-ant-test-key',
    hasAnthropicKey: true,
    model: SOMMELIER_CONFIG_DEFAULTS.model,
    temperature: undefined,
    timeoutMs: SOMMELIER_CONFIG_DEFAULTS.timeoutMs,
    maxTokens: SOMMELIER_CONFIG_DEFAULTS.maxTokens,
    throttleLimit: SOMMELIER_CONFIG_DEFAULTS.throttleLimit,
    globalThrottleLimit: SOMMELIER_CONFIG_DEFAULTS.globalThrottleLimit,
    dailyTokenBudget: SOMMELIER_CONFIG_DEFAULTS.dailyTokenBudget,
    ...over,
  };
}

/** A well-formed model Message whose single text block is valid structured JSON. */
function messageWith(
  jsonText: string,
  usage: { input_tokens: number; output_tokens: number },
): Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: SOMMELIER_CONFIG_DEFAULTS.model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text: jsonText, citations: null }],
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Message;
}

const VALID_OUTPUT = JSON.stringify({
  answer: 'The Spicy Tuna Roll [1] brings the heat.',
  picks: [{ mealId: 'cm_a', why: 'Sriracha-marinated tuna.' }],
  confidence: 'high',
});

type CreateParams = Parameters<MessagesCreator['create']>[0];
type CreateOptions = Parameters<MessagesCreator['create']>[1];

interface SpyCreator extends MessagesCreator {
  lastOptions: CreateOptions | undefined;
  /** The params from the most recent create() call. Throws if not yet called. */
  params(): CreateParams;
}

/** A spy MessagesCreator that records the params it was called with. */
function spyCreator(
  impl: (params: CreateParams) => Promise<Message>,
): SpyCreator {
  let captured: CreateParams | undefined;
  const creator: SpyCreator = {
    lastOptions: undefined,
    params(): CreateParams {
      if (captured === undefined) {
        throw new Error('create() was not called');
      }
      return captured;
    },
    create(params: CreateParams, options?: CreateOptions): Promise<Message> {
      captured = params;
      creator.lastOptions = options;
      return impl(params);
    },
  };
  return creator;
}

/** Read output_config.format off captured params without optional-chain noise. */
function formatOf(params: CreateParams): {
  type: string;
  schema: Record<string, unknown>;
} {
  const format = params.output_config?.format;
  if (format == null) {
    throw new Error('output_config.format was not set');
  }
  return format as { type: string; schema: Record<string, unknown> };
}

function buildProvider(
  creator: MessagesCreator,
  config = makeConfig(),
): AnthropicClientProvider {
  return new AnthropicClientProvider(config, creator);
}

const CALL = {
  system: 'SYSTEM RULES',
  userText: 'USER PROMPT',
  schema: { type: 'object', additionalProperties: false } as Record<
    string,
    unknown
  >,
};

describe('T7 — AnthropicClientProvider', () => {
  describe('model-call constraints (Opus 4.8 — these 400 if wrong)', () => {
    it('sends model = cfg.model (claude-opus-4-8)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      expect(creator.params().model).toBe('claude-opus-4-8');
    });

    it('sends max_tokens = cfg.maxTokens and is NON-streaming (no stream:true)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      const params = creator.params();
      expect(params.max_tokens).toBe(SOMMELIER_CONFIG_DEFAULTS.maxTokens);
      expect(params.stream).toBeUndefined();
    });

    it('passes NO sampling params when temperature is unset (Opus default — these 400 on Opus)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      // Default config has temperature: undefined ⇒ the body omits it.
      await buildProvider(creator).createMessage(CALL);
      const params = creator.params();
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
      expect(params).not.toHaveProperty('budget_tokens');
    });

    it('includes temperature ONLY when cfg.temperature is set (e.g. Sonnet/Haiku, temperature=0)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(
        creator,
        makeConfig({ temperature: 0 }),
      ).createMessage(CALL);
      const params = creator.params();
      expect(params).toHaveProperty('temperature', 0);
      // The other sampling params are still never sent.
      expect(params).not.toHaveProperty('top_p');
      expect(params).not.toHaveProperty('top_k');
    });

    it('OMITS thinking entirely (off by default on 4.8)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      expect(creator.params()).not.toHaveProperty('thinking');
    });

    it('uses NO assistant prefill (every message is role:user)', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      const messages = creator.params().messages;
      expect(messages.length).toBeGreaterThan(0);
      for (const m of messages) {
        expect(m.role).toBe('user');
      }
      // The last message is NOT an assistant prefill.
      expect(messages[messages.length - 1].role).not.toBe('assistant');
    });

    it('passes structured output via output_config.format json_schema with our schema', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      const format = formatOf(creator.params());
      expect(format.type).toBe('json_schema');
      expect(format.schema).toBe(CALL.schema);
    });

    it('passes the system rules as the system param', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      expect(creator.params().system).toBe('SYSTEM RULES');
    });

    it('applies the per-request timeout = cfg.timeoutMs', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 10,
          output_tokens: 5,
        }),
      );
      await buildProvider(creator).createMessage(CALL);
      expect(creator.lastOptions?.timeout).toBe(
        SOMMELIER_CONFIG_DEFAULTS.timeoutMs,
      );
    });
  });

  describe('success — returns parsed output + token usage', () => {
    it('parses the structured JSON text block into {answer,picks,confidence}', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 100,
          output_tokens: 40,
        }),
      );
      const result = await buildProvider(creator).createMessage(CALL);
      expect(result.rawOutput).toEqual({
        answer: 'The Spicy Tuna Roll [1] brings the heat.',
        picks: [{ mealId: 'cm_a', why: 'Sriracha-marinated tuna.' }],
        confidence: 'high',
      });
    });

    it('returns input_tokens and output_tokens from usage', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 100,
          output_tokens: 40,
        }),
      );
      const result = await buildProvider(creator).createMessage(CALL);
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(40);
    });

    it('an abstain model output is parsed with confidence:abstain', async () => {
      const abstain = JSON.stringify({
        answer: "We don't serve that — try the menu.",
        picks: [],
        confidence: 'abstain',
      });
      const creator = spyCreator(async () =>
        messageWith(abstain, {
          input_tokens: 20,
          output_tokens: 10,
        }),
      );
      const result = await buildProvider(creator).createMessage(CALL);
      expect(result.rawOutput.confidence).toBe('abstain');
      expect(result.rawOutput.picks).toEqual([]);
    });
  });

  describe('missing key ⇒ 503 (boot OK, 503 only at call time)', () => {
    it('throws ServiceUnavailableException with the pinned envelope when hasAnthropicKey is false', async () => {
      // No-key provider: the inner creator must NEVER be called.
      const creator = spyCreator(async () => {
        throw new Error('creator must not be called without a key');
      });
      const provider = buildProvider(
        creator,
        makeConfig({ anthropicApiKey: undefined, hasAnthropicKey: false }),
      );
      await expect(provider.createMessage(CALL)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // The inner creator was never invoked (no key ⇒ short-circuit 503).
      expect(() => creator.params()).toThrow('create() was not called');
    });

    it('the 503 carries the SOMMELIER_UNAVAILABLE envelope', async () => {
      const creator = spyCreator(async () =>
        messageWith(VALID_OUTPUT, {
          input_tokens: 1,
          output_tokens: 1,
        }),
      );
      const provider = buildProvider(
        creator,
        makeConfig({ anthropicApiKey: undefined, hasAnthropicKey: false }),
      );
      await expect(provider.createMessage(CALL)).rejects.toMatchObject({
        response: SOMMELIER_UNAVAILABLE_ENVELOPE,
      });
    });
  });

  describe('error mapping ⇒ 503 (retryable)', () => {
    it('an Anthropic APIError (rate limit) maps to 503', async () => {
      const creator = spyCreator(async () => {
        throw new Anthropic.RateLimitError(
          429,
          {
            type: 'error',
            error: { type: 'rate_limit_error', message: 'slow down' },
          },
          'rate limited',
          undefined,
        );
      });
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('an Anthropic AuthenticationError maps to 503', async () => {
      const creator = spyCreator(async () => {
        throw new Anthropic.AuthenticationError(
          401,
          {
            type: 'error',
            error: { type: 'authentication_error', message: 'bad key' },
          },
          'unauthorized',
          undefined,
        );
      });
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('an Anthropic InternalServerError maps to 503', async () => {
      const creator = spyCreator(async () => {
        throw new Anthropic.InternalServerError(
          500,
          { type: 'error', error: { type: 'api_error', message: 'boom' } },
          'server error',
          undefined,
        );
      });
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('a timeout (APIConnectionTimeoutError) maps to 503', async () => {
      const creator = spyCreator(async () => {
        throw new Anthropic.APIConnectionTimeoutError({ message: 'timed out' });
      });
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('malformed structured output ⇒ 503 (NOT abstain)', () => {
    it('non-JSON text content maps to 503', async () => {
      const creator = spyCreator(async () =>
        messageWith('this is not json', {
          input_tokens: 5,
          output_tokens: 5,
        }),
      );
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('an empty content array maps to 503', async () => {
      const empty = messageWith(VALID_OUTPUT, {
        input_tokens: 5,
        output_tokens: 5,
      });
      (empty as unknown as { content: unknown[] }).content = [];
      const creator = spyCreator(async () => empty);
      await expect(
        buildProvider(creator).createMessage(CALL),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
