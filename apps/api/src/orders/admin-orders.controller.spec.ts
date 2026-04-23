import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEvents } from './order-events.service';

const TEST_PREFIX = 'admin-orders-spec';

describe('AdminOrdersController', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: OrderEvents;

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
    events = moduleRef.get(OrderEvents);
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

  async function seedMeal(name: string, priceCents = 600) {
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

  async function seedOrderFor(userId: string) {
    const meal = await seedMeal(`meal-${userId.slice(-6)}-${Date.now()}`, 700);
    return prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        subtotalCents: 700,
        taxCents: 105,
        tipCents: 0,
        totalCents: 805,
        deliveryAddress: '1 Any St',
        deliveryPostal: '00000',
        phone: '+15550000000',
        items: {
          create: [
            {
              mealId: meal.id,
              quantity: 1,
              unitPriceCents: 700,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  describe('GET /admin/orders', () => {
    it('200 — admin lists all orders across users', async () => {
      const { cookie: adminCookie } = await loginAs('admin', 'ADMIN');
      const { userId: u1 } = await loginAs('c1');
      const { userId: u2 } = await loginAs('c2');
      await seedOrderFor(u1);
      await seedOrderFor(u2);

      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const mine = res.body.filter(
        (o: { userId: string }) => o.userId === u1 || o.userId === u2,
      );
      expect(mine).toHaveLength(2);
    });

    it('403 — customer forbidden', async () => {
      const { cookie } = await loginAs('regular');
      await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Cookie', cookie)
        .expect(403);
    });

    it('401 — no cookie rejected', async () => {
      await request(app.getHttpServer()).get('/admin/orders').expect(401);
    });
  });

  describe('PATCH /admin/orders/:id', () => {
    it('200 — admin updates status and emits order-status-changed event', async () => {
      const { cookie: adminCookie } = await loginAs('patcher', 'ADMIN');
      const { userId } = await loginAs('target');
      const order = await seedOrderFor(userId);

      const spy = jest.spyOn(events, 'emitStatusChanged');

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${order.id}`)
        .set('Cookie', adminCookie)
        .send({ status: 'CONFIRMED' })
        .expect(200);

      expect(res.body.id).toBe(order.id);
      expect(res.body.status).toBe('CONFIRMED');

      expect(spy).toHaveBeenCalledTimes(1);
      const payload = spy.mock.calls[0][0];
      expect(payload.orderId).toBe(order.id);
      expect(payload.userId).toBe(userId);
      expect(payload.status).toBe('CONFIRMED');
      expect(typeof payload.timestamp).toBe('string');

      spy.mockRestore();
    });

    it('400 — invalid status rejected', async () => {
      const { cookie: adminCookie } = await loginAs('patch-bad', 'ADMIN');
      const { userId } = await loginAs('bad-target');
      const order = await seedOrderFor(userId);

      await request(app.getHttpServer())
        .patch(`/admin/orders/${order.id}`)
        .set('Cookie', adminCookie)
        .send({ status: 'BOGUS' })
        .expect(400);
    });

    it('404 — unknown id', async () => {
      const { cookie: adminCookie } = await loginAs('patch-404', 'ADMIN');
      await request(app.getHttpServer())
        .patch('/admin/orders/does-not-exist')
        .set('Cookie', adminCookie)
        .send({ status: 'CONFIRMED' })
        .expect(404);
    });

    it('403 — customer forbidden', async () => {
      const { userId } = await loginAs('victim');
      const order = await seedOrderFor(userId);
      const { cookie } = await loginAs('not-admin');

      await request(app.getHttpServer())
        .patch(`/admin/orders/${order.id}`)
        .set('Cookie', cookie)
        .send({ status: 'CONFIRMED' })
        .expect(403);
    });
  });
});
