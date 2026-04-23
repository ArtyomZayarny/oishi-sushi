import { Reflector } from '@nestjs/core';
import type { UserRole } from '@org/shared-types';

export const Roles = Reflector.createDecorator<UserRole[]>();
