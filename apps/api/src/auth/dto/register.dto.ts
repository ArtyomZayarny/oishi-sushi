import { IsEmail, IsString, MinLength } from 'class-validator';
import type { RegisterReq } from '@org/shared-types';

export class RegisterDto implements RegisterReq {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;
}
