import { IsString, Length } from 'class-validator';

export class TotpVerifyDto {
  @IsString()
  @Length(6, 6)
  token: string;
}
