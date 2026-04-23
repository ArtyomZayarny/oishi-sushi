import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController (integration)', () => {
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
      where: { email: { contains: '@auth-spec.test' } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@auth-spec.test' } },
    });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('201 — returns user without password hash', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'alice@auth-spec.test',
          password: 'StrongPass123!',
          firstName: 'Alice',
          lastName: 'Anderson',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'alice@auth-spec.test',
        firstName: 'Alice',
        lastName: 'Anderson',
        role: 'CUSTOMER',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.password).toBeUndefined();
    });

    it('400 — weak password rejected by validator', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'weak@auth-spec.test',
          password: '123',
          firstName: 'Weak',
          lastName: 'Pass',
        })
        .expect(400);
    });

    it('409 — duplicate email', async () => {
      const body = {
        email: 'dup@auth-spec.test',
        password: 'StrongPass123!',
        firstName: 'Dup',
        lastName: 'Licate',
      };
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(body)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    const creds = {
      email: 'login@auth-spec.test',
      password: 'StrongPass123!',
    };

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...creds, firstName: 'Log', lastName: 'In' })
        .expect(201);
    });

    it('200 — sets httpOnly cookie named session', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(creds)
        .expect(200);

      const raw = res.headers['set-cookie'];
      const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const session = cookies.find((c: string) => c.startsWith('session='));
      expect(session).toBeDefined();
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(res.body.user?.email).toBe(creds.email);
    });

    it('401 — wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: creds.email, password: 'wrong-password-123' })
        .expect(401);
    });

    it('401 — unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@auth-spec.test', password: 'whatever-123' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    const creds = {
      email: 'me@auth-spec.test',
      password: 'StrongPass123!',
    };

    let sessionCookie: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...creds, firstName: 'Me', lastName: 'User' })
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send(creds)
        .expect(200);
      const raw = login.headers['set-cookie'];
      const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
      sessionCookie =
        cookies.find((c: string) => c.startsWith('session='))?.split(';')[0] ??
        '';
    });

    it('200 with cookie — returns current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(res.body).toMatchObject({
        email: creds.email,
        firstName: 'Me',
        lastName: 'User',
        role: 'CUSTOMER',
      });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('401 without cookie', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });
});
