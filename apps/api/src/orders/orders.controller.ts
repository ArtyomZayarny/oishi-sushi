import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { PublicUser } from '../auth/auth.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService, OrderWithItems } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @Req() req: Request,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderWithItems> {
    const user = req.user as PublicUser;
    return this.orders.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<OrderWithItems> {
    const user = req.user as PublicUser;
    return this.orders.findByIdForUser(id, user.id);
  }
}
