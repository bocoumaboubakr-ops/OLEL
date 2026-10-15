import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { ProviderCallbackGuard } from '../common/guards/provider-callback.guard';
import { BotRelayService } from './bot-relay.service';
import { ConsentDto, InboundDto, InboundStatusDto, ProviderStatusesDto, SessionDto } from './bot-relay.dto';

/** Relais du bot WhatsApp (service-à-service, clé API) — audit F22/F24/F25. */
@ApiExcludeController()
@SkipThrottle()
@UseGuards(BotApiKeyGuard)
@Controller('bot-relay')
export class BotRelayController {
  constructor(private relay: BotRelayService) {}

  @Post('inbound')
  @HttpCode(200)
  recordInbound(@Body() dto: InboundDto) {
    return this.relay.recordInbound(dto);
  }

  @Patch('inbound/:id')
  async markInbound(@Param('id') id: string, @Body() dto: InboundStatusDto) {
    await this.relay.markInbound(id, dto.status, dto.error);
    return { ok: true };
  }

  @Get('inbound/pending')
  pending() {
    return this.relay.pendingInbound();
  }

  @Get('sessions/:phone')
  async getSession(@Param('phone') phone: string) {
    return { state: await this.relay.getSession(phone) };
  }

  @Put('sessions/:phone')
  async saveSession(@Param('phone') phone: string, @Body() dto: SessionDto) {
    await this.relay.saveSession(phone, dto.state);
    return { ok: true };
  }

  @Get('consent')
  getConsent(@Query('phone') phone: string) {
    return this.relay.getConsent(phone);
  }

  @Post('consent')
  @HttpCode(200)
  setConsent(@Body() dto: ConsentDto) {
    return this.relay.setConsent(dto.phone, dto.choice, 'whatsapp', dto.language);
  }

  /** Statuts WhatsApp (sent/delivered/read/failed) relayés depuis le webhook Meta. */
  @Post('whatsapp-statuses')
  @HttpCode(200)
  whatsappStatuses(@Body() dto: ProviderStatusesDto) {
    return this.relay.applyStatuses(dto.statuses);
  }
}

/**
 * Rapports de remise SMS d'Africa's Talking (formulaire : id, status,
 * failureReason). Authentifiés par le secret de rappel fournisseur.
 */
@ApiExcludeController()
@SkipThrottle()
@UseGuards(ProviderCallbackGuard)
@Controller('providers/sms')
export class SmsDeliveryReportController {
  constructor(private relay: BotRelayService) {}

  @Post('delivery-report')
  @HttpCode(200)
  report(@Body() body: { id?: string; status?: string; failureReason?: string }) {
    if (!body?.id || !body?.status) return { updated: 0 };
    return this.relay.applyStatuses([{ providerMessageId: String(body.id), status: String(body.status), error: body.failureReason ? String(body.failureReason) : undefined }]);
  }
}
