import { Controller, Get } from '@nestjs/common';
import { CategoryWithMeals, MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  list(): Promise<CategoryWithMeals[]> {
    return this.menu.listPublic();
  }
}
