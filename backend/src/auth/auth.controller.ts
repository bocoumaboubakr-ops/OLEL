import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par téléphone + mot de passe' })
  async login(@Body() dto: LoginDto) {
    const user = await this.auth.validateUser(dto.phone, dto.password);
    if (!user) throw new Error('Identifiants incorrects');
    return this.auth.login(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir le token d\'accès' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurer le TOTP (2FA)' })
  setupTotp(@Request() req) {
    return this.auth.setupTotp(req.user.id);
  }

  @Post('totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code TOTP' })
  verifyTotp(@Request() req, @Body() dto: TotpVerifyDto) {
    return this.auth.verifyTotp(req.user.id, dto.token);
  }
}
