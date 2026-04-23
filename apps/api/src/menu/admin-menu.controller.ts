import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Meal } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';
import { MenuService } from './menu.service';

@Controller('admin/menu')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(['ADMIN'])
export class AdminMenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  listAll(): Promise<Meal[]> {
    return this.menu.listAll();
  }

  @Post()
  create(@Body() dto: CreateMealDto): Promise<Meal> {
    return this.menu.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMealDto): Promise<Meal> {
    return this.menu.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.menu.softDelete(id);
  }
}
