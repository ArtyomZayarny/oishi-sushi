import { IsEmail, IsString, MinLength } from 'class-validator';
import type { LoginReq } from '@org/shared-types';

export class LoginDto implements LoginReq {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
