import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService, OrderWithItems } from './orders.service';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(['ADMIN'])
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(): Promise<OrderWithItems[]> {
    return this.orders.listAll();
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderWithItems> {
    return this.orders.updateStatus(id, dto.status);
  }
}
