import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

export const Roles = Reflector.createDecorator<UserRole[]>();
