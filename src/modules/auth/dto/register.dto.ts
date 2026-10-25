import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum.js';

export class RegisterDto {
  /** Player's full name */
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Must be PLAYER or HOST — ADMIN cannot be self-assigned */
  @IsEnum(Role, { message: 'role must be PLAYER or HOST' })
  role: Role;
}
