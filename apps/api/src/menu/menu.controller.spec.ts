import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

const TEST_PREFIX = 'menu-spec';

describe('MenuController (public)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-secret-please-override-in-production';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  async function cleanDb() {
    await prisma.meal.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: TEST_PREFIX } },
    });
  }

  beforeEach(cleanDb);

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function seedCategory(slug: string, name: string, sortOrder = 0) {
    return prisma.category.create({
      data: {
        name: `${TEST_PREFIX}-${name}`,
        slug: `${TEST_PREFIX}-${slug}`,
        sortOrder,
      },
    });
  }

  async function seedMeal(
    categoryId: string,
    name: string,
    overrides: Partial<{
      active: boolean;
      deletedAt: Date | null;
      priceCents: number;
    }> = {},
  ) {
    return prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}-${name}`,
        description: 'Test meal',
        priceCents: overrides.priceCents ?? 500,
        imageUrl: '/assets/test.jpg',
        categoryId,
        allergens: [],
        active: overrides.active ?? true,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
  }

  it('GET /menu — 200 returns active meals grouped by category', async () => {
    const maki = await seedCategory('maki', 'Maki', 1);
    const nigiri = await seedCategory('nigiri', 'Nigiri', 2);
    await seedMeal(maki.id, 'salmon-maki', { priceCents: 890 });
    await seedMeal(maki.id, 'tuna-maki', { priceCents: 990 });
    await seedMeal(nigiri.id, 'ebi-nigiri', { priceCents: 590 });

    const res = await request(app.getHttpServer()).get('/menu').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const seeded = res.body.filter((c: { slug: string }) =>
      c.slug.startsWith(TEST_PREFIX),
    );
    expect(seeded).toHaveLength(2);

    const makiOut = seeded.find(
      (c: { slug: string }) => c.slug === `${TEST_PREFIX}-maki`,
    );
    const nigiriOut = seeded.find(
      (c: { slug: string }) => c.slug === `${TEST_PREFIX}-nigiri`,
    );
    expect(makiOut.meals).toHaveLength(2);
    expect(nigiriOut.meals).toHaveLength(1);
    expect(makiOut.meals[0]).toMatchObject({
      name: expect.stringContaining(TEST_PREFIX),
      priceCents: expect.any(Number),
      imageUrl: expect.any(String),
    });
  });

  it('GET /menu — excludes inactive meals', async () => {
    const cat = await seedCategory('cat-inactive', 'CatInactive', 1);
    await seedMeal(cat.id, 'visible', { active: true });
    await seedMeal(cat.id, 'hidden', { active: false });

    const res = await request(app.getHttpServer()).get('/menu').expect(200);
    const cat0 = res.body.find(
      (c: { slug: string }) => c.slug === `${TEST_PREFIX}-cat-inactive`,
    );
    expect(cat0.meals).toHaveLength(1);
    expect(cat0.meals[0].name).toContain('visible');
  });

  it('GET /menu — excludes soft-deleted meals', async () => {
    const cat = await seedCategory('cat-sd', 'CatSoftDeleted', 1);
    await seedMeal(cat.id, 'live');
    await seedMeal(cat.id, 'deleted', { deletedAt: new Date() });

    const res = await request(app.getHttpServer()).get('/menu').expect(200);
    const cat0 = res.body.find(
      (c: { slug: string }) => c.slug === `${TEST_PREFIX}-cat-sd`,
    );
    expect(cat0.meals).toHaveLength(1);
    expect(cat0.meals[0].name).toContain('live');
  });

  it('GET /menu — sorts categories by sortOrder asc', async () => {
    await seedCategory('z-last', 'Zzzz', 10);
    await seedCategory('a-first', 'Aaaa', 1);

    const res = await request(app.getHttpServer()).get('/menu').expect(200);
    const seeded = res.body.filter(
      (c: { slug: string }) =>
        c.slug === `${TEST_PREFIX}-a-first` ||
        c.slug === `${TEST_PREFIX}-z-last`,
    );
    expect(seeded[0].slug).toBe(`${TEST_PREFIX}-a-first`);
    expect(seeded[1].slug).toBe(`${TEST_PREFIX}-z-last`);
  });
});
