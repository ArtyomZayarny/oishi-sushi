import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

const TEST_PREFIX = 'gateway-spec';

describe('OrdersGateway', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-secret-please-override-in-production';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useWebSocketAdapter(new IoAdapter(app));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0);

    prisma = moduleRef.get(PrismaService);
    const server = app.getHttpServer();
    const addr = server.address();
    const port =
      addr && typeof addr === 'object' && 'port' in addr ? addr.port : 0;
    url = `http://127.0.0.1:${port}`;
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
  ): Promise<{ cookie: string; rawCookie: string; userId: string }> {
    const email = `${label}@${TEST_PREFIX}.test`;
    const password = 'StrongPass123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'Gate', lastName: 'Way' })
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
    const rawCookie =
      cookies.find((c: string) => c.startsWith('session='))?.split(';')[0] ??
      '';
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { cookie: rawCookie, rawCookie, userId: user.id };
  }

  async function seedOrderFor(userId: string) {
    const cat = await prisma.category.upsert({
      where: { slug: `${TEST_PREFIX}-cat` },
      update: {},
      create: {
        name: `${TEST_PREFIX}-cat`,
        slug: `${TEST_PREFIX}-cat`,
        sortOrder: 1,
      },
    });
    const meal = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}-meal-${userId.slice(-6)}-${Date.now()}`,
        description: 'x',
        priceCents: 700,
        imageUrl: '/x.jpg',
        categoryId: cat.id,
        allergens: [],
      },
    });
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
          create: [{ mealId: meal.id, quantity: 1, unitPriceCents: 700 }],
        },
      },
      include: { items: true },
    });
  }

  function connect(cookie?: string): Socket {
    return io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { cookie } : undefined,
    });
  }

  function waitForEvent<T = unknown>(
    socket: Socket,
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${event}`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  function waitForDisconnect(socket: Socket, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timeout waiting for disconnect')),
        timeoutMs,
      );
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.on('disconnect', done);
      socket.on('connect_error', done);
    });
  }

  it('unauthenticated client is disconnected', async () => {
    const socket = connect();
    await waitForDisconnect(socket);
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it('authenticated customer joins own room and receives order:status:changed when admin patches status', async () => {
    const { cookie: adminCookie } = await loginAs('admin-flow', 'ADMIN');
    const { cookie: customerCookie, userId } = await loginAs('customer-flow');
    const order = await seedOrderFor(userId);

    const socket = connect(customerCookie);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('connect timeout')),
        5000,
      );
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    const eventPromise = waitForEvent<{
      orderId: string;
      status: string;
      timestamp: string;
    }>(socket, 'order:status:changed');

    await request(app.getHttpServer())
      .patch(`/admin/orders/${order.id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const payload = await eventPromise;
    expect(payload.orderId).toBe(order.id);
    expect(payload.status).toBe('CONFIRMED');
    expect(typeof payload.timestamp).toBe('string');

    socket.close();
  });

  it('customer does not receive events for another user order', async () => {
    const { cookie: adminCookie } = await loginAs('admin-iso', 'ADMIN');
    const { cookie: aliceCookie } = await loginAs('alice-iso');
    const { userId: bobId } = await loginAs('bob-iso');
    const bobOrder = await seedOrderFor(bobId);

    const aliceSocket = connect(aliceCookie);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('connect timeout')),
        5000,
      );
      aliceSocket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      aliceSocket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    let aliceGotEvent = false;
    aliceSocket.on('order:status:changed', () => {
      aliceGotEvent = true;
    });

    await request(app.getHttpServer())
      .patch(`/admin/orders/${bobOrder.id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    await new Promise((r) => setTimeout(r, 500));
    expect(aliceGotEvent).toBe(false);

    aliceSocket.close();
  });
});
