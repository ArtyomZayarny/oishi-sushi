import { extractAvoidedAllergens } from './allergen-extractor';

/**
 * F4-AC1 — free-text allergen-avoidance extractor (routes query intent into the
 * hard allergen gate). The chip path (`avoidAllergens`) was the ONLY input to the
 * hard filter; a customer typing "without shellfish" in the free-text `query`
 * never reached it, so unsafe dishes stayed candidates. These specs pin the pure
 * extractor that closes that gap: an explicit avoidance cue near a known allergen
 * term yields that allergen's canonical slug, while plain/positive mentions never
 * do. The seed vocabulary is `fish` / `shellfish` / `soy`.
 */
describe('F4-AC1 — extractAvoidedAllergens (free-text avoidance → canonical slugs)', () => {
  const KNOWN = ['fish', 'shellfish', 'soy'];

  describe('explicit avoidance cues trigger exclusion', () => {
    it('"something light without shellfish" → ["shellfish"]', () => {
      expect(
        extractAvoidedAllergens('something light without shellfish', KNOWN),
      ).toEqual(['shellfish']);
    });

    it('"no shellfish please" → ["shellfish"]', () => {
      expect(extractAvoidedAllergens('no shellfish please', KNOWN)).toEqual([
        'shellfish',
      ]);
    });

    it('"I\'m allergic to shellfish" → ["shellfish"]', () => {
      expect(
        extractAvoidedAllergens("I'm allergic to shellfish", KNOWN),
      ).toEqual(['shellfish']);
    });

    it('"shellfish allergy" → ["shellfish"]', () => {
      expect(extractAvoidedAllergens('shellfish allergy', KNOWN)).toEqual([
        'shellfish',
      ]);
    });

    it('"no soy" → ["soy"]', () => {
      expect(extractAvoidedAllergens('no soy', KNOWN)).toEqual(['soy']);
    });

    it('"without fish or shellfish" → ["fish","shellfish"] (one cue, list)', () => {
      expect(
        extractAvoidedAllergens('without fish or shellfish', KNOWN),
      ).toEqual(['fish', 'shellfish']);
    });

    it('"spicy tuna but hold the shellfish" → ["shellfish"]', () => {
      expect(
        extractAvoidedAllergens('spicy tuna but hold the shellfish', KNOWN),
      ).toEqual(['shellfish']);
    });

    it("handles other explicit cues: avoid / exclude / skip / free of / can't eat / don't want", () => {
      expect(extractAvoidedAllergens('please avoid soy', KNOWN)).toEqual([
        'soy',
      ]);
      expect(extractAvoidedAllergens('exclude shellfish', KNOWN)).toEqual([
        'shellfish',
      ]);
      expect(extractAvoidedAllergens('skip the soy', KNOWN)).toEqual(['soy']);
      expect(
        extractAvoidedAllergens('I want something free of shellfish', KNOWN),
      ).toEqual(['shellfish']);
      expect(extractAvoidedAllergens("I can't eat shellfish", KNOWN)).toEqual([
        'shellfish',
      ]);
      expect(extractAvoidedAllergens("I don't want soy", KNOWN)).toEqual([
        'soy',
      ]);
    });

    it('handles the suffix "X-free" form', () => {
      expect(
        extractAvoidedAllergens('something shellfish-free', KNOWN),
      ).toEqual(['shellfish']);
    });
  });

  describe('synonyms map to the canonical slug', () => {
    it('"no shrimp" → ["shellfish"]', () => {
      expect(extractAvoidedAllergens('no shrimp', KNOWN)).toEqual([
        'shellfish',
      ]);
    });

    it('crab / prawn / lobster / oyster / mussel all map to shellfish', () => {
      expect(extractAvoidedAllergens('no crab', KNOWN)).toEqual(['shellfish']);
      expect(extractAvoidedAllergens('without prawns', KNOWN)).toEqual([
        'shellfish',
      ]);
      expect(extractAvoidedAllergens('allergic to lobster', KNOWN)).toEqual([
        'shellfish',
      ]);
      expect(extractAvoidedAllergens('no oysters or mussels', KNOWN)).toEqual([
        'shellfish',
      ]);
    });

    it('"no soya" → ["soy"]', () => {
      expect(extractAvoidedAllergens('no soya', KNOWN)).toEqual(['soy']);
    });
  });

  describe('plain or positive mentions never trigger', () => {
    it('"I love shellfish" → []', () => {
      expect(extractAvoidedAllergens('I love shellfish', KNOWN)).toEqual([]);
    });

    it('"something with extra soy" → []', () => {
      expect(
        extractAvoidedAllergens('something with extra soy', KNOWN),
      ).toEqual([]);
    });

    it('"what dishes have shellfish?" → []', () => {
      expect(
        extractAvoidedAllergens('what dishes have shellfish?', KNOWN),
      ).toEqual([]);
    });

    it('"" → []', () => {
      expect(extractAvoidedAllergens('', KNOWN)).toEqual([]);
    });

    it('"something light" → []', () => {
      expect(extractAvoidedAllergens('something light', KNOWN)).toEqual([]);
    });

    it('a positive clause after an avoid clause is not swept in ("without shellfish but with soy")', () => {
      expect(
        extractAvoidedAllergens('without shellfish but with soy', KNOWN),
      ).toEqual(['shellfish']);
    });
  });

  describe('hygiene', () => {
    it('is case-insensitive', () => {
      expect(extractAvoidedAllergens('NO SHELLFISH', KNOWN)).toEqual([
        'shellfish',
      ]);
    });

    it('emits canonical slugs verbatim from knownAllergens (preserves menu casing)', () => {
      expect(
        extractAvoidedAllergens('no shellfish', ['Fish', 'Shellfish', 'Soy']),
      ).toEqual(['Shellfish']);
    });

    it('only excludes allergens present in the known vocabulary', () => {
      // peanut is a real allergen but NOT in this menu's vocabulary → ignored.
      expect(
        extractAvoidedAllergens('no peanuts and no soy', [
          'fish',
          'shellfish',
          'soy',
        ]),
      ).toEqual(['soy']);
    });

    it('dedupes repeated mentions, preserving first-appearance order', () => {
      expect(
        extractAvoidedAllergens(
          'no shellfish, and really no shrimp either',
          KNOWN,
        ),
      ).toEqual(['shellfish']);
    });

    it('returns [] when knownAllergens is empty', () => {
      expect(extractAvoidedAllergens('no shellfish', [])).toEqual([]);
    });
  });
});
