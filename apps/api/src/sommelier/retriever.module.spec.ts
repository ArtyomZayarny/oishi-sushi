import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NaiveKbRetriever } from './naive-kb.retriever';
import { SOMMELIER_RETRIEVER, type Retriever, KB_DOC_TYPES } from './retriever';
import { SommelierModule } from './sommelier.module';

/**
 * T4 — DI wiring: SommelierModule must bind the `SOMMELIER_RETRIEVER` token to a
 * `NaiveKbRetriever` built over the committed kb/ directory, and that resolution
 * must succeed at boot with NO `ANTHROPIC_API_KEY` present (the retriever has no
 * key dependency — it is pure KB load). This is the seam T7 injects to build the
 * grounded prompt; proving the token resolves here keeps T7 unblocked.
 */
describe('T4 — SOMMELIER_RETRIEVER is provided by SommelierModule', () => {
  let savedKey: string | undefined;

  beforeAll(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('resolves the token to a NaiveKbRetriever returning the committed docs', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), SommelierModule],
    }).compile();

    const retriever = moduleRef.get<Retriever>(SOMMELIER_RETRIEVER);
    expect(retriever).toBeInstanceOf(NaiveKbRetriever);

    const docs = await retriever.retrieve('something spicy with tuna');
    expect(docs.length).toBeGreaterThanOrEqual(1);
    for (const d of docs) {
      expect(d.source).toMatch(/\S/);
      expect(d.section).toMatch(/\S/);
      expect(KB_DOC_TYPES).toContain(d.docType);
      expect(d.body).toMatch(/\S/);
    }

    await moduleRef.close();
  });
});
