import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { ThrottleStrict, ThrottleNormal } from '../common/decorators/throttle.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par téléphone + mot de passe' })
  async login(@Body() dto: LoginDto) {
    const user = await this.auth.validateUser(dto.phone, dto.password);
    if (!user) throw new UnauthorizedException('Identifiants incorrects');
    return this.auth.login(user);
  }

  @Post('refresh')
  @ThrottleNormal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rafraîchir le token d'accès" })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  // ── OTP ───────────────────────────────────────────────────────────────────

  @Post('otp/request')
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander un code OTP par SMS (inscription/connexion citoyen)' })
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code OTP et obtenir un token JWT (crée le compte si nouveau)' })
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  // ── TOTP (2FA) ────────────────────────────────────────────────────────────

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurer le TOTP (2FA)' })
  setupTotp(@CurrentUser('id') userId: string) {
    return this.auth.setupTotp(userId);
  }

  @Post('totp/verify')
  @ThrottleStrict()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code TOTP' })
  verifyTotp(@CurrentUser('id') userId: string, @Body() dto: TotpVerifyDto) {
    return this.auth.verifyTotp(userId, dto.token);
  }
}
