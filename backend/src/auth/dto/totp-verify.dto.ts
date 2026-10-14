import { IsOptional, IsString, Length } from 'class-validator';

export class TotpVerifyDto {
  @IsString()
  @Length(6, 6)
  token: string;
}

export class TotpSetupDto {
  /** Code du facteur actuel — obligatoire si un TOTP est déjà actif. */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  currentCode?: string;
}
