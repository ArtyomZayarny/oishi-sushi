import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

const TEST_PREFIX = 'orders-spec';

describe('OrdersController (customer)', () => {
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
    await prisma.orderItem.deleteMany({
      where: {
        order: { user: { email: { contains: `@${TEST_PREFIX}.test` } } },
      },
    });
    await prisma.order.deleteMany({
      where: { user: { email: { contains: `@${TEST_PREFIX}.test` } } },
    });
    await prisma.meal.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: TEST_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `@${TEST_PREFIX}.test` } },
    });
  }

  beforeEach(cleanDb);

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function loginAs(
    label: string,
    role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
  ): Promise<{ cookie: string; userId: string }> {
    const email = `${label}@${TEST_PREFIX}.test`;
    const password = 'StrongPass123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'Role', lastName: 'User' })
      .expect(201);
    if (role === 'ADMIN') {
      await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
    }
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const raw = login.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cookie =
      cookies.find((c: string) => c.startsWith('session='))?.split(';')[0] ??
      '';
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { cookie, userId: user.id };
  }

  async function seedMeal(name: string, priceCents = 500) {
    const cat = await prisma.category.upsert({
      where: { slug: `${TEST_PREFIX}-cat` },
      update: {},
      create: {
        name: `${TEST_PREFIX}-cat`,
        slug: `${TEST_PREFIX}-cat`,
        sortOrder: 1,
      },
    });
    return prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}-${name}`,
        description: 'x',
        priceCents,
        imageUrl: '/x.jpg',
        categoryId: cat.id,
        allergens: [],
      },
    });
  }

  function orderBody(
    items: { mealId: string; quantity: number; unitPriceCents: number }[],
  ) {
    const subtotal = items.reduce(
      (s, i) => s + i.quantity * i.unitPriceCents,
      0,
    );
    const tax = Math.round(subtotal * 0.15);
    const tip = 0;
    return {
      items: items.map((i) => ({
        mealId: i.mealId,
        quantity: i.quantity,
        itemNote: null,
      })),
      subtotalCents: subtotal,
      taxCents: tax,
      tipCents: tip,
      totalCents: subtotal + tax + tip,
      deliveryAddress: '1 Test Street',
      deliveryPostal: '12345',
      phone: '+15551234567',
      notes: null,
    };
  }

  describe('POST /orders', () => {
    it('201 — customer creates order; items persisted in a transaction', async () => {
      const { cookie, userId } = await loginAs('customer-a');
      const mealA = await seedMeal('roll-a', 800);
      const mealB = await seedMeal('roll-b', 500);

      const body = orderBody([
        { mealId: mealA.id, quantity: 2, unitPriceCents: 800 },
        { mealId: mealB.id, quantity: 1, unitPriceCents: 500 },
      ]);

      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', cookie)
        .send(body)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.userId).toBe(userId);
      expect(res.body.items).toHaveLength(2);

      const persisted = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { items: true },
      });
      expect(persisted.items).toHaveLength(2);
      expect(persisted.totalCents).toBe(body.totalCents);
    });

    it('401 — no cookie rejected', async () => {
      const meal = await seedMeal('anon');
      await request(app.getHttpServer())
        .post('/orders')
        .send(
          orderBody([{ mealId: meal.id, quantity: 1, unitPriceCents: 500 }]),
        )
        .expect(401);
    });

    it('400 — empty items array rejected', async () => {
      const { cookie } = await loginAs('empty-items');
      await request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', cookie)
        .send({ ...orderBody([]) })
        .expect(400);
    });

    it('transaction — no partial order persists on invalid meal id', async () => {
      const { cookie } = await loginAs('bad-meal');
      const good = await seedMeal('good-roll', 700);
      const body = orderBody([
        { mealId: good.id, quantity: 1, unitPriceCents: 700 },
        { mealId: 'does-not-exist', quantity: 1, unitPriceCents: 700 },
      ]);

      await request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', cookie)
        .send(body)
        .expect(400);

      const count = await prisma.order.count({
        where: { deliveryAddress: body.deliveryAddress, phone: body.phone },
      });
      expect(count).toBe(0);
    });
  });

  describe('GET /orders/:id', () => {
    it('200 — owner fetches their own order', async () => {
      const { cookie, userId } = await loginAs('owner');
      const meal = await seedMeal('owner-roll', 600);
      const body = orderBody([
        { mealId: meal.id, quantity: 1, unitPriceCents: 600 },
      ]);

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', cookie)
        .send(body)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/orders/${created.body.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.userId).toBe(userId);
      expect(res.body.items).toHaveLength(1);
    });

    it('403 — non-owner customer cannot read another user order', async () => {
      const { cookie: ownerCookie } = await loginAs('ownerA');
      const meal = await seedMeal('ownerA-roll', 600);
      const created = await request(app.getHttpServer())
        .post('/orders')
        .set('Cookie', ownerCookie)
        .send(
          orderBody([{ mealId: meal.id, quantity: 1, unitPriceCents: 600 }]),
        )
        .expect(201);

      const { cookie: intruderCookie } = await loginAs('intruderB');
      await request(app.getHttpServer())
        .get(`/orders/${created.body.id}`)
        .set('Cookie', intruderCookie)
        .expect(403);
    });

    it('404 — unknown order id for authenticated user', async () => {
      const { cookie } = await loginAs('missing');
      await request(app.getHttpServer())
        .get('/orders/does-not-exist')
        .set('Cookie', cookie)
        .expect(404);
    });

    it('401 — no cookie rejected', async () => {
      await request(app.getHttpServer()).get('/orders/anything').expect(401);
    });
  });
});
