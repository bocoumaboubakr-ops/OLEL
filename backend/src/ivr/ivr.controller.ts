import { Controller, Post, Body, UseGuards, Header, HttpCode, Logger, ConflictException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { Role } from '@prisma/client';
import { IvrService } from '../notifications/channels/ivr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProviderCallbackGuard } from '../common/guards/provider-callback.guard';
import { FlagsService } from '../flags/flags.service';
import { SignalementsService } from '../signalements/signalements.service';

class TestCallDto {
  @IsString()
  @Matches(/^\+\d{8,15}$/)
  phoneNumber: string;
}

interface IvrWebhookDto {
  sessionId: string;
  callerNumber: string;
  dtmfDigits?: string;
  isActive?: string;
}

const say = (text: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="fr-FR">${text}</Say>
</Response>`;

/**
 * Serveur vocal (SVI) — audit F06, F26.
 *
 * Le SVI n'est PAS un canal de diffusion opérationnel (indicateur « ivr »
 * désactivé, aucune alerte associée aux appels). Il ne doit donc jamais lire
 * une alerte fictive ni promettre une intervention :
 *  - invite par défaut neutre ;
 *  - touche 2 : un signalement est réellement enregistré (idempotent par
 *    session) AVANT d'annoncer « reçu par OLEL, examiné par un opérateur » ;
 *  - échec d'écriture : l'appelant est informé que rien n'a été reçu.
 */
@ApiTags('IVR')
@Controller('ivr')
export class IvrController {
  private readonly logger = new Logger(IvrController.name);

  constructor(
    private ivrService: IvrService,
    private flags: FlagsService,
    private signalements: SignalementsService,
  ) {}

  @Post('call')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Appel SVI de TEST (administrateur) — refusé tant que le canal n\'est pas activé' })
  async triggerCall(@Body() dto: TestCallDto) {
    if (!(await this.flags.isEnabled('ivr'))) {
      throw new ConflictException('Canal SVI non opérationnel (indicateur « ivr » désactivé)');
    }
    const r = await this.ivrService.makeCall(dto.phoneNumber);
    // Statut exact : simulé ou accepté par le fournisseur — jamais « appel passé »
    return { status: r.simulated ? 'SIMULATED' : 'ACCEPTED_BY_PROVIDER', providerMessageId: r.providerMessageId ?? null };
  }

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  @UseGuards(ProviderCallbackGuard)
  @Header('Content-Type', 'application/xml')
  @ApiOperation({ summary: 'Rappel Africa\'s Talking — touches DTMF, retourne XML (?key= secret requis)' })
  async handleWebhook(@Body() dto: IvrWebhookDto): Promise<string> {
    const digits = String(dto.dtmfDigits ?? '');

    if (digits === '1') return say('Merci. Au revoir.');

    if (digits === '2') {
      try {
        await this.signalements.createFromChannel({
          channel: 'ivr', sourceRef: `ivr:${dto.sessionId}`, phone: dto.callerNumber, type: 'AUTRE',
          description: 'Signalement par appel vocal (touche 2) — aucun détail fourni. Rappeler le citoyen pour qualifier.',
        });
        return say('Votre signalement est reçu par OLEL. Un opérateur va l\'examiner et pourra vous rappeler. '
          + 'OLEL ne remplace pas les secours : en cas de danger immédiat, contactez-les directement. Au revoir.');
      } catch (e) {
        this.logger.error(`Échec d'enregistrement SVI (session ${dto.sessionId}) : ${(e as Error).message}`);
        return say('Votre signalement n\'a pas pu être enregistré. Veuillez réessayer plus tard '
          + 'ou contacter directement les secours. Au revoir.');
      }
    }

    return this.ivrService.buildWelcomeXml();
  }
}
