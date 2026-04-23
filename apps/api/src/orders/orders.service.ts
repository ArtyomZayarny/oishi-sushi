import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Order, OrderItem, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderEvents } from './order-events.service';

export type OrderWithItems = Order & { items: OrderItem[] };

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrderEvents,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<OrderWithItems> {
    const mealIds = dto.items.map((i) => i.mealId);
    return this.prisma.$transaction(async (tx) => {
      const meals = await tx.meal.findMany({
        where: { id: { in: mealIds }, deletedAt: null },
        select: { id: true, priceCents: true },
      });
      const byId = new Map(meals.map((m) => [m.id, m]));
      for (const item of dto.items) {
        if (!byId.has(item.mealId)) {
          throw new BadRequestException(`Meal ${item.mealId} not found`);
        }
      }

      return tx.order.create({
        data: {
          userId,
          subtotalCents: dto.subtotalCents,
          taxCents: dto.taxCents,
          tipCents: dto.tipCents,
          totalCents: dto.totalCents,
          deliveryAddress: dto.deliveryAddress,
          deliveryPostal: dto.deliveryPostal,
          phone: dto.phone,
          notes: dto.notes ?? null,
          items: {
            create: dto.items.map((item) => {
              const meal = byId.get(item.mealId);
              if (!meal) {
                throw new BadRequestException(`Meal ${item.mealId} not found`);
              }
              return {
                mealId: item.mealId,
                quantity: item.quantity,
                unitPriceCents: meal.priceCents,
                itemNote: item.itemNote ?? null,
              };
            }),
          },
        },
        include: { items: true },
      });
    });
  }

  async findByIdForUser(
    orderId: string,
    userId: string,
  ): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.userId !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return order;
  }

  listAll(): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderWithItems> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!existing) throw new NotFoundException(`Order ${orderId} not found`);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: true },
    });

    this.events.emitStatusChanged({
      orderId: updated.id,
      userId: updated.userId,
      status: updated.status,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }
}
