import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../prisma/prisma.service';

const TEST_PREFIX = 'admin-menu-spec';

describe('AdminMenuController', () => {
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
    await prisma.user.deleteMany({
      where: { email: { contains: `@${TEST_PREFIX}.test` } },
    });
  }

  beforeEach(cleanDb);

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function loginAs(role: 'CUSTOMER' | 'ADMIN'): Promise<string> {
    const email = `${role.toLowerCase()}@${TEST_PREFIX}.test`;
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
    return (
      cookies.find((c: string) => c.startsWith('session='))?.split(';')[0] ?? ''
    );
  }

  async function seedCategory() {
    return prisma.category.create({
      data: {
        name: `${TEST_PREFIX}-cat`,
        slug: `${TEST_PREFIX}-cat`,
        sortOrder: 1,
      },
    });
  }

  describe('POST /admin/menu', () => {
    it('201 — admin creates a meal', async () => {
      const admin = await loginAs('ADMIN');
      const cat = await seedCategory();

      const res = await request(app.getHttpServer())
        .post('/admin/menu')
        .set('Cookie', admin)
        .send({
          name: `${TEST_PREFIX}-dragon-roll`,
          description: 'Delicious dragon roll',
          priceCents: 1490,
          imageUrl: '/assets/dragon-roll.jpg',
          categoryId: cat.id,
          allergens: ['fish', 'gluten'],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: `${TEST_PREFIX}-dragon-roll`,
        priceCents: 1490,
        imageUrl: '/assets/dragon-roll.jpg',
        categoryId: cat.id,
        allergens: ['fish', 'gluten'],
        active: true,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.deletedAt).toBeNull();
    });

    it('403 — customer forbidden', async () => {
      const customer = await loginAs('CUSTOMER');
      const cat = await seedCategory();
      await request(app.getHttpServer())
        .post('/admin/menu')
        .set('Cookie', customer)
        .send({
          name: `${TEST_PREFIX}-forbidden`,
          description: 'x',
          priceCents: 100,
          imageUrl: '/x.jpg',
          categoryId: cat.id,
          allergens: [],
        })
        .expect(403);
    });

    it('401 — no cookie rejected', async () => {
      const cat = await seedCategory();
      await request(app.getHttpServer())
        .post('/admin/menu')
        .send({
          name: `${TEST_PREFIX}-anon`,
          description: 'x',
          priceCents: 100,
          imageUrl: '/x.jpg',
          categoryId: cat.id,
          allergens: [],
        })
        .expect(401);
    });

    it('400 — invalid body (missing fields)', async () => {
      const admin = await loginAs('ADMIN');
      await request(app.getHttpServer())
        .post('/admin/menu')
        .set('Cookie', admin)
        .send({ name: `${TEST_PREFIX}-bad` })
        .expect(400);
    });

    it('400 — priceCents must be non-negative integer', async () => {
      const admin = await loginAs('ADMIN');
      const cat = await seedCategory();
      await request(app.getHttpServer())
        .post('/admin/menu')
        .set('Cookie', admin)
        .send({
          name: `${TEST_PREFIX}-neg-price`,
          description: 'x',
          priceCents: -1,
          imageUrl: '/x.jpg',
          categoryId: cat.id,
          allergens: [],
        })
        .expect(400);
    });
  });

  describe('PUT /admin/menu/:id', () => {
    it('200 — admin updates a meal', async () => {
      const admin = await loginAs('ADMIN');
      const cat = await seedCategory();
      const meal = await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}-to-update`,
          description: 'Old',
          priceCents: 100,
          imageUrl: '/old.jpg',
          categoryId: cat.id,
          allergens: [],
        },
      });

      const res = await request(app.getHttpServer())
        .put(`/admin/menu/${meal.id}`)
        .set('Cookie', admin)
        .send({ description: 'New description', priceCents: 200 })
        .expect(200);

      expect(res.body).toMatchObject({
        id: meal.id,
        description: 'New description',
        priceCents: 200,
      });
    });

    it('404 — unknown id', async () => {
      const admin = await loginAs('ADMIN');
      await request(app.getHttpServer())
        .put('/admin/menu/does-not-exist')
        .set('Cookie', admin)
        .send({ description: 'x' })
        .expect(404);
    });

    it('403 — customer forbidden', async () => {
      const customer = await loginAs('CUSTOMER');
      const cat = await seedCategory();
      const meal = await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}-nope`,
          description: 'x',
          priceCents: 100,
          imageUrl: '/x.jpg',
          categoryId: cat.id,
          allergens: [],
        },
      });
      await request(app.getHttpServer())
        .put(`/admin/menu/${meal.id}`)
        .set('Cookie', customer)
        .send({ description: 'hack' })
        .expect(403);
    });
  });

  describe('DELETE /admin/menu/:id', () => {
    it('204 — admin soft-deletes a meal (sets deletedAt, excludes from public /menu)', async () => {
      const admin = await loginAs('ADMIN');
      const cat = await seedCategory();
      const meal = await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}-to-delete`,
          description: 'Bye',
          priceCents: 100,
          imageUrl: '/bye.jpg',
          categoryId: cat.id,
          allergens: [],
        },
      });

      await request(app.getHttpServer())
        .delete(`/admin/menu/${meal.id}`)
        .set('Cookie', admin)
        .expect(204);

      const after = await prisma.meal.findUnique({ where: { id: meal.id } });
      expect(after).not.toBeNull();
      expect(after?.deletedAt).toBeInstanceOf(Date);

      const publicRes = await request(app.getHttpServer())
        .get('/menu')
        .expect(200);
      const cat0 = publicRes.body.find(
        (c: { slug: string }) => c.slug === `${TEST_PREFIX}-cat`,
      );
      if (cat0) {
        expect(cat0.meals.some((m: { id: string }) => m.id === meal.id)).toBe(
          false,
        );
      }
    });

    it('403 — customer forbidden', async () => {
      const customer = await loginAs('CUSTOMER');
      const cat = await seedCategory();
      const meal = await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}-keep`,
          description: 'x',
          priceCents: 100,
          imageUrl: '/x.jpg',
          categoryId: cat.id,
          allergens: [],
        },
      });
      await request(app.getHttpServer())
        .delete(`/admin/menu/${meal.id}`)
        .set('Cookie', customer)
        .expect(403);
    });

    it('404 — unknown id', async () => {
      const admin = await loginAs('ADMIN');
      await request(app.getHttpServer())
        .delete('/admin/menu/does-not-exist')
        .set('Cookie', admin)
        .expect(404);
    });
  });
});
