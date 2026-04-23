import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { OrderCreateItemReq, OrderCreateReq } from '@org/shared-types';

export class CreateOrderItemDto implements OrderCreateItemReq {
  @IsString()
  @MinLength(1)
  mealId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  itemNote?: string | null;
}

export class CreateOrderDto implements OrderCreateReq {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsInt()
  @Min(0)
  subtotalCents!: number;

  @IsInt()
  @Min(0)
  taxCents!: number;

  @IsInt()
  @Min(0)
  tipCents!: number;

  @IsInt()
  @Min(0)
  totalCents!: number;

  @IsString()
  @MinLength(1)
  deliveryAddress!: string;

  @IsString()
  @MinLength(1)
  deliveryPostal!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
