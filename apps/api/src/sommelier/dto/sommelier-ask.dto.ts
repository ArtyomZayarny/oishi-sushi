import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import type { SommelierAskRequest } from '@org/shared-types';

/**
 * Wire DTO for `POST /api/sommelier` (§6). The global
 * `ValidationPipe({ whitelist: true, transform: true })` (main.ts) enforces
 * these decorators and silently strips unknown fields. `forbidNonWhitelisted`
 * is intentionally NOT set — the contract requires unknown fields be stripped,
 * not 400'd (§6 warning).
 */
export class SommelierAskDto implements SommelierAskRequest {
  /** 1..500 chars — rejects empty and 501+. */
  @IsString()
  @Length(1, 500)
  query!: string;

  /** Optional, ≤20 items, each a string 1..50 chars. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  avoidAllergens?: string[];
}
