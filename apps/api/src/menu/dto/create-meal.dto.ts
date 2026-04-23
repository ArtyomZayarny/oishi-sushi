import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import type { MealCreateReq } from '@org/shared-types';

export class CreateMealDto implements MealCreateReq {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsString()
  @MinLength(1)
  imageUrl!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  allergens!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
