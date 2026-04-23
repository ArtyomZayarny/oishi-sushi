import { IsEnum } from 'class-validator';
import { OrderStatus, type OrderStatusPatchReq } from '@org/shared-types';

export class UpdateOrderStatusDto implements OrderStatusPatchReq {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
