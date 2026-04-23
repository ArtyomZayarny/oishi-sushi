import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminMenuController } from './admin-menu.controller';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [AuthModule],
  controllers: [MenuController, AdminMenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
