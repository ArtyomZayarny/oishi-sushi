import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type PublicUser } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

const ONE_HOUR_MS = 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token, csrf } = await this.auth.login(dto);
    const base = {
      path: '/',
      sameSite: 'lax' as const,
      secure: false,
      maxAge: ONE_HOUR_MS,
    };
    res.cookie('session', token, { ...base, httpOnly: true });
    res.cookie('csrf', csrf, { ...base, httpOnly: false });
    return { user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request): PublicUser {
    return req.user as PublicUser;
  }

  @Get('admin-ping')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(['ADMIN'])
  adminPing() {
    return { ok: true };
  }
}
