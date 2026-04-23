import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesGuard (admin-only endpoint)', () => {
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

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@guard-spec.test' } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@guard-spec.test' } },
    });
    await app.close();
  });

  async function loginAs(
    email: string,
    password: string,
    role: 'CUSTOMER' | 'ADMIN',
  ): Promise<string> {
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
    return (
      cookies.find((c: string) => c.startsWith('session='))?.split(';')[0] ?? ''
    );
  }

  // /auth/admin-ping is a minimal admin-only probe on the auth controller,
  // used only to exercise the RolesGuard. Menu/order admin routes land in later phases.
  it('403 — CUSTOMER cannot hit admin-only route', async () => {
    const cookie = await loginAs(
      'cust@guard-spec.test',
      'StrongPass123!',
      'CUSTOMER',
    );
    await request(app.getHttpServer())
      .get('/auth/admin-ping')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('200 — ADMIN can hit admin-only route', async () => {
    const cookie = await loginAs(
      'admin@guard-spec.test',
      'StrongPass123!',
      'ADMIN',
    );
    await request(app.getHttpServer())
      .get('/auth/admin-ping')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('401 — no cookie, even an admin-guarded route rejects unauthenticated', async () => {
    await request(app.getHttpServer()).get('/auth/admin-ping').expect(401);
  });
});
