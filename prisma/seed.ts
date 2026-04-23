import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminHash = await bcrypt.hash('demo-admin-pass', 12);
  const customerHash = await bcrypt.hash('demo-customer-pass', 12);

  await prisma.user.upsert({
    where: { email: 'admin@oishi.dev' },
    update: {},
    create: {
      email: 'admin@oishi.dev',
      passwordHash: adminHash,
      firstName: 'Oishi',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    },
  });
  await prisma.user.upsert({
    where: { email: 'customer@oishi.dev' },
    update: {},
    create: {
      email: 'customer@oishi.dev',
      passwordHash: customerHash,
      firstName: 'Demo',
      lastName: 'Customer',
      role: UserRole.CUSTOMER,
    },
  });

  const maki = await prisma.category.upsert({
    where: { slug: 'maki' },
    update: {},
    create: { name: 'Maki', slug: 'maki', sortOrder: 1 },
  });
  const nigiri = await prisma.category.upsert({
    where: { slug: 'nigiri' },
    update: {},
    create: { name: 'Nigiri', slug: 'nigiri', sortOrder: 2 },
  });
  const special = await prisma.category.upsert({
    where: { slug: 'special-rolls' },
    update: {},
    create: { name: 'Special Rolls', slug: 'special-rolls', sortOrder: 3 },
  });

  const meals = [
    {
      name: 'Salmon Maki',
      description: 'Fresh salmon, rice, nori. 6 pcs.',
      priceCents: 890,
      imageUrl: '/assets/meals/salmon-maki.jpg',
      categoryId: maki.id,
      allergens: ['fish'],
    },
    {
      name: 'Tuna Maki',
      description: 'Bluefin tuna, rice, nori. 6 pcs.',
      priceCents: 990,
      imageUrl: '/assets/meals/tuna-maki.jpg',
      categoryId: maki.id,
      allergens: ['fish'],
    },
    {
      name: 'Salmon Nigiri',
      description: 'Hand-pressed rice with salmon slice. 2 pcs.',
      priceCents: 650,
      imageUrl: '/assets/meals/salmon-nigiri.jpg',
      categoryId: nigiri.id,
      allergens: ['fish'],
    },
    {
      name: 'Ebi Nigiri',
      description: 'Cooked shrimp on rice. 2 pcs.',
      priceCents: 590,
      imageUrl: '/assets/meals/ebi-nigiri.jpg',
      categoryId: nigiri.id,
      allergens: ['shellfish'],
    },
    {
      name: 'Dragon Roll',
      description: 'Eel, avocado, tempura crunch. 8 pcs.',
      priceCents: 1490,
      imageUrl: '/assets/meals/dragon-roll.jpg',
      categoryId: special.id,
      allergens: ['fish', 'gluten'],
    },
    {
      name: 'Rainbow Roll',
      description: 'California roll topped with assorted sashimi. 8 pcs.',
      priceCents: 1590,
      imageUrl: '/assets/meals/rainbow-roll.jpg',
      categoryId: special.id,
      allergens: ['fish', 'shellfish'],
    },
  ];

  for (const m of meals) {
    await prisma.meal.upsert({
      where: { name: m.name },
      update: {},
      create: m,
    });
  }

  console.log(`Seed complete: 2 users, 3 categories, ${meals.length} meals.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
