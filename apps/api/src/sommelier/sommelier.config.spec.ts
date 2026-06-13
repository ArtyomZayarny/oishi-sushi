import {
  SOMMELIER_CONFIG_DEFAULTS,
  loadSommelierConfig,
  sommelierConfig,
} from './sommelier.config';

/**
 * T3 — typed config surface for the seven §9 sommelier vars.
 *
 * `loadSommelierConfig(env)` is the pure reader (env in → typed config out) so
 * the parsing/coercion/default rules are unit-testable without booting Nest.
 * `sommelierConfig` is the `registerAs('sommelier', …)` namespace the module
 * consumes; it simply delegates to `loadSommelierConfig(process.env)`.
 */
describe('T3 — sommelier typed config (loadSommelierConfig)', () => {
  describe('defaults applied when env is unset', () => {
    it('returns every spec default for a fully empty env', () => {
      const cfg = loadSommelierConfig({});
      expect(cfg.model).toBe('claude-opus-4-8');
      expect(cfg.timeoutMs).toBe(25000);
      expect(cfg.maxTokens).toBe(1000);
      expect(cfg.throttleLimit).toBe(5);
      expect(cfg.globalThrottleLimit).toBe(40);
      expect(cfg.dailyTokenBudget).toBe(500000);
    });

    it('exposes the defaults table verbatim as SOMMELIER_CONFIG_DEFAULTS', () => {
      expect(SOMMELIER_CONFIG_DEFAULTS).toEqual({
        model: 'claude-opus-4-8',
        timeoutMs: 25000,
        maxTokens: 1000,
        throttleLimit: 5,
        globalThrottleLimit: 40,
        dailyTokenBudget: 500000,
      });
    });
  });

  describe('env values parsed (numbers coerced from strings)', () => {
    it('reads SOMMELIER_MODEL as-is', () => {
      const cfg = loadSommelierConfig({ SOMMELIER_MODEL: 'claude-sonnet-4-6' });
      expect(cfg.model).toBe('claude-sonnet-4-6');
    });

    it('coerces every numeric var from its string env value', () => {
      const cfg = loadSommelierConfig({
        SOMMELIER_TIMEOUT_MS: '15000',
        SOMMELIER_MAX_TOKENS: '750',
        SOMMELIER_THROTTLE_LIMIT: '9',
        SOMMELIER_GLOBAL_THROTTLE_LIMIT: '120',
        SOMMELIER_DAILY_TOKEN_BUDGET: '1000000',
      });
      expect(cfg.timeoutMs).toBe(15000);
      expect(cfg.maxTokens).toBe(750);
      expect(cfg.throttleLimit).toBe(9);
      expect(cfg.globalThrottleLimit).toBe(120);
      expect(cfg.dailyTokenBudget).toBe(1000000);
      // coerced to real numbers, not strings
      expect(typeof cfg.timeoutMs).toBe('number');
      expect(typeof cfg.dailyTokenBudget).toBe('number');
    });

    it('falls back to the default when a numeric var is empty or non-numeric', () => {
      const cfg = loadSommelierConfig({
        SOMMELIER_TIMEOUT_MS: '',
        SOMMELIER_MAX_TOKENS: 'not-a-number',
        SOMMELIER_THROTTLE_LIMIT: '   ',
      });
      expect(cfg.timeoutMs).toBe(25000);
      expect(cfg.maxTokens).toBe(1000);
      expect(cfg.throttleLimit).toBe(5);
    });
  });

  describe('Anthropic key handling (boot-safe)', () => {
    it('anthropicApiKey is undefined and hasAnthropicKey is false when unset', () => {
      const cfg = loadSommelierConfig({});
      expect(cfg.anthropicApiKey).toBeUndefined();
      expect(cfg.hasAnthropicKey).toBe(false);
    });

    it('treats an empty/whitespace key as absent (undefined + hasAnthropicKey false)', () => {
      expect(
        loadSommelierConfig({ ANTHROPIC_API_KEY: '' }).hasAnthropicKey,
      ).toBe(false);
      const ws = loadSommelierConfig({ ANTHROPIC_API_KEY: '   ' });
      expect(ws.anthropicApiKey).toBeUndefined();
      expect(ws.hasAnthropicKey).toBe(false);
    });

    it('exposes the key verbatim and hasAnthropicKey true when set', () => {
      const cfg = loadSommelierConfig({ ANTHROPIC_API_KEY: 'sk-ant-xyz' });
      expect(cfg.anthropicApiKey).toBe('sk-ant-xyz');
      expect(cfg.hasAnthropicKey).toBe(true);
    });
  });

  describe('registerAs namespace wiring', () => {
    it('is registered under the "sommelier" token', () => {
      // registerAs attaches the namespace key via KEY/propertyKey
      expect((sommelierConfig as { KEY: string }).KEY).toBe(
        'CONFIGURATION(sommelier)',
      );
    });

    it('delegates to loadSommelierConfig over process.env', () => {
      const prev = process.env.SOMMELIER_MODEL;
      process.env.SOMMELIER_MODEL = 'claude-sonnet-4-6';
      try {
        expect(sommelierConfig().model).toBe('claude-sonnet-4-6');
      } finally {
        if (prev === undefined) delete process.env.SOMMELIER_MODEL;
        else process.env.SOMMELIER_MODEL = prev;
      }
    });
  });
});
