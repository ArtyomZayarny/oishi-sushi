import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Meal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';

export type CategoryWithMeals = Category & { meals: Meal[] };

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(): Promise<CategoryWithMeals[]> {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        meals: {
          where: { active: true, deletedAt: null },
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  async listAll(): Promise<Meal[]> {
    return this.prisma.meal.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateMealDto): Promise<Meal> {
    return this.prisma.meal.create({
      data: {
        name: dto.name,
        description: dto.description,
        priceCents: dto.priceCents,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        allergens: dto.allergens,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateMealDto): Promise<Meal> {
    await this.ensureExists(id);
    return this.prisma.meal.update({ where: { id }, data: dto });
  }

  async softDelete(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.meal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const existing = await this.prisma.meal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Meal ${id} not found`);
  }
}
