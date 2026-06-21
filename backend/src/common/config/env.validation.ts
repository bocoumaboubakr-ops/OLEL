import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsString,
  IsOptional,
  MinLength,
  validateSync,
  ValidationError,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET doit faire au moins 32 caractères' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET doit faire au moins 32 caractères' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'TOTP_ENCRYPTION_KEY doit faire au moins 32 caractères' })
  TOTP_ENCRYPTION_KEY: string;

  @IsString()
  BOT_API_KEY: string;

  @IsOptional()
  @IsEnum(Environment, {
    message: `NODE_ENV doit être l'une des valeurs suivantes : development, production, test`,
  })
  NODE_ENV: Environment = Environment.Development;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Validate DATABASE_URL prefix manually (class-validator doesn't have StartsWith)
  if (
    typeof config['DATABASE_URL'] === 'string' &&
    !config['DATABASE_URL'].startsWith('postgresql://')
  ) {
    const isProduction = config['NODE_ENV'] === 'production';
    const errorMsg = 'DATABASE_URL doit commencer par postgresql://';
    if (isProduction) {
      throw new Error(`[EnvValidation] ${errorMsg}`);
    }
    console.warn(`[EnvValidation] WARNING: ${errorMsg}`);
  }

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors: ValidationError[] = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((err) => {
      const constraints = Object.values(err.constraints || {}).join(', ');
      return `  - ${err.property}: ${constraints}`;
    });

    const errorDetails = messages.join('\n');

    if (config['NODE_ENV'] === 'production') {
      throw new Error(
        `[EnvValidation] Variables d'environnement invalides ou manquantes :\n${errorDetails}`,
      );
    }

    console.warn(
      `[EnvValidation] WARNING — variables d'environnement invalides ou manquantes :\n${errorDetails}`,
    );
  }

  return validated;
}
