import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum BlacklistProviderName {
  Karma = 'karma',
  Mock = 'mock',
}

export class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN_SECONDS: number = 3600;

  @IsString()
  @MinLength(16)
  ADMIN_API_KEY: string;

  @IsEnum(BlacklistProviderName)
  BLACKLIST_PROVIDER: BlacklistProviderName = BlacklistProviderName.Mock;

  @IsUrl({ require_tld: false })
  ADJUTOR_BASE_URL: string = 'https://adjutor.lendsqr.com/v2';

  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.BLACKLIST_PROVIDER === BlacklistProviderName.Karma,
  )
  @IsString()
  @MinLength(1)
  ADJUTOR_API_KEY?: string;

  @IsOptional()
  @IsString()
  MOCK_BLACKLIST: string = '';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.toString()}`);
  }
  return env;
}
