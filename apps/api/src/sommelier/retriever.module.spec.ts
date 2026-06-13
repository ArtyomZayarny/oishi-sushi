import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SOMMELIER_MENU } from './menu.port';
import { NaiveKbRetriever } from './naive-kb.retriever';
import { SOMMELIER_RETRIEVER, type Retriever, KB_DOC_TYPES } from './retriever';
import { SommelierModule } from './sommelier.module';

/**
 * T4 — DI wiring: SommelierModule must bind the `SOMMELIER_RETRIEVER` token to a
 * `NaiveKbRetriever` built over the committed kb/ directory, and that resolution
 * must succeed at boot with NO `ANTHROPIC_API_KEY` present (the retriever has no
 * key dependency — it is pure KB load). This is the seam T7 injects to build the
 * grounded prompt; proving the token resolves here keeps T7 unblocked.
 *
 * T7 note: SommelierModule now binds `SOMMELIER_MENU` to `MenuService` (which
 * needs PrismaService). This DB-free boot has no PrismaModule, so the menu token
 * is overridden with a stub purely to let the module graph COMPILE — this spec
 * only resolves the retriever, never the menu.
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
    })
      // Stub the menu port so the Prisma-less graph compiles (this spec only
      // exercises the retriever token).
      .overrideProvider(SOMMELIER_MENU)
      .useValue({ listPublic: async () => [] })
      .compile();

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
