import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CANONICAL_MEAL_NAMES = [
  'Otoro Selection',
  'Chef’s Omakase',
  'Toro Truffle Roll',
  'Sashimi Moriawase',
  'Ikura Don',
  'Couple’s Set',
] as const;

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

  // Soft-delete any meal whose name isn't in the canonical set. Safe across
  // re-runs (no-op when everything already aligned).
  await prisma.meal.updateMany({
    where: {
      name: { notIn: CANONICAL_MEAL_NAMES as unknown as string[] },
      active: true,
    },
    data: { active: false, deletedAt: new Date() },
  });

  const maki = await prisma.category.upsert({
    where: { slug: 'maki' },
    update: { name: 'Maki', sortOrder: 1 },
    create: { name: 'Maki', slug: 'maki', sortOrder: 1 },
  });
  const nigiri = await prisma.category.upsert({
    where: { slug: 'nigiri' },
    update: { name: 'Nigiri', sortOrder: 2 },
    create: { name: 'Nigiri', slug: 'nigiri', sortOrder: 2 },
  });
  const omakase = await prisma.category.upsert({
    where: { slug: 'omakase' },
    update: { name: 'Omakase', sortOrder: 3 },
    create: { name: 'Omakase', slug: 'omakase', sortOrder: 3 },
  });
  const sashimi = await prisma.category.upsert({
    where: { slug: 'sashimi' },
    update: { name: 'Sashimi', sortOrder: 4 },
    create: { name: 'Sashimi', slug: 'sashimi', sortOrder: 4 },
  });
  const donburi = await prisma.category.upsert({
    where: { slug: 'donburi' },
    update: { name: 'Donburi', sortOrder: 5 },
    create: { name: 'Donburi', slug: 'donburi', sortOrder: 5 },
  });
  const sets = await prisma.category.upsert({
    where: { slug: 'sets' },
    update: { name: 'Sets', sortOrder: 6 },
    create: { name: 'Sets', slug: 'sets', sortOrder: 6 },
  });

  const meals = [
    {
      name: 'Otoro Selection',
      description:
        'Five-day aged bluefin belly, hand-cut nigiri, eight pieces.',
      priceCents: 4800,
      imageUrl: '/assets/meals/otoro-selection.jpg',
      categoryId: nigiri.id,
      allergens: ['fish'],
    },
    {
      name: 'Chef’s Omakase',
      description:
        'Twelve pieces chosen by our chef each morning, cold-chain delivery.',
      priceCents: 9500,
      imageUrl: '/assets/meals/chefs-omakase.jpg',
      categoryId: omakase.id,
      allergens: ['fish', 'shellfish'],
    },
    {
      name: 'Toro Truffle Roll',
      description: 'Fatty tuna, shaved black truffle, micro shiso, gold leaf.',
      priceCents: 3800,
      imageUrl: '/assets/meals/toro-truffle-roll.jpg',
      categoryId: maki.id,
      allergens: ['fish'],
    },
    {
      name: 'Sashimi Moriawase',
      description:
        "Seven cuts of the morning's best — hamachi, uni, kanpachi, and more.",
      priceCents: 7200,
      imageUrl: '/assets/meals/sashimi-moriawase.jpg',
      categoryId: sashimi.id,
      allergens: ['fish', 'shellfish'],
    },
    {
      name: 'Ikura Don',
      description: 'Salmon roe cured in soy and sake over warm vinegared rice.',
      priceCents: 3200,
      imageUrl: '/assets/meals/ikura-don.jpg',
      categoryId: donburi.id,
      allergens: ['fish', 'soy'],
    },
    {
      name: 'Couple’s Set',
      description:
        'Twenty pieces for two, balanced across nigiri, maki, and sashimi.',
      priceCents: 12800,
      imageUrl: '/assets/meals/couples-set.jpg',
      categoryId: sets.id,
      allergens: ['fish', 'shellfish'],
    },
  ];

  for (const m of meals) {
    const { categoryId, ...rest } = m;
    await prisma.meal.upsert({
      where: { name: m.name },
      update: {
        description: rest.description,
        priceCents: rest.priceCents,
        imageUrl: rest.imageUrl,
        category: { connect: { id: categoryId } },
        allergens: rest.allergens,
        active: true,
        deletedAt: null,
      },
      create: {
        name: rest.name,
        description: rest.description,
        priceCents: rest.priceCents,
        imageUrl: rest.imageUrl,
        allergens: rest.allergens,
        category: { connect: { id: categoryId } },
      },
    });
  }

  // Legacy categories whose only meals are soft-deleted cannot be hard-deleted
  // without breaking the FK on OrderItem history. The public menu API filters
  // to active meals, so an empty category sits inert and invisible to users.

  console.log(
    `Seed complete: 2 users, 6+ categories (inert legacy kept), ${meals.length} active meals.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
