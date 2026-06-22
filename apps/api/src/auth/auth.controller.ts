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
    // Cookie security is env-driven so the same build runs locally (HTTP) and
    // on HTTPS staging/prod. Defaults preserve local behavior: when the env is
    // unset, secure=false + SameSite=Lax. On HTTPS set COOKIE_SECURE=true, or
    // browsers silently drop the session cookie and login appears to fail.
    const base = {
      path: '/',
      sameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as
        | 'lax'
        | 'strict'
        | 'none',
      secure: process.env.COOKIE_SECURE === 'true',
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
