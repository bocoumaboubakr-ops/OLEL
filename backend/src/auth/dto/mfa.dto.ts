import { IsString, Length, IsJWT } from 'class-validator';

export class MfaSetupDto {
  @IsJWT()
  mfaToken: string;
}

export class MfaLoginDto {
  @IsJWT()
  mfaToken: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
