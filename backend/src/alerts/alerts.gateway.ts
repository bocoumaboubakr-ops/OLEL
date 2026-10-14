import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { TerritoryService } from '../common/territory/territory.service';
import { TERRITORY_EXEMPT } from '../users/user-policy';
import { DIFFUSED_STATUSES } from './alert-policy';

/** Revalidation périodique des connexions (suspension, rôle, expiration). */
const REVALIDATE_MS = 60_000;

/**
 * Flux temps réel authentifié et cloisonné (audit F02).
 *
 * - Connexion refusée sans jeton d'accès valide (même règle que l'API :
 *   session non révoquée, statut, tokenVersion, MFA selon le rôle).
 * - Aucun abonnement libre : le serveur place chaque socket dans UNE salle
 *   déterminée par son compte (`ops:<zone>` pour un opérateur, `pub:<zone>`
 *   pour un citoyen). Le message client « join:zone » est refusé.
 * - Événement interne `alert:changed` (résumé minimal, sans description,
 *   média, coordonnées ni identité du signaleur) envoyé uniquement aux
 *   opérateurs dont le territoire contient la zone de l'alerte.
 * - Événement public `alert:public` émis seulement pour une alerte DIFFUSÉE,
 *   aux comptes rattachés aux zones ciblées ou à leurs descendants.
 * - Les sockets sont revalidés chaque minute et coupés dès que la session
 *   n'est plus valable.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : false,
  },
  namespace: '/alerts',
})
export class AlertsGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsGateway.name);
  private timer?: NodeJS.Timeout;

  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private cfg: ConfigService,
    private sessions: SessionService,
    private prisma: PrismaService,
    private territory: TerritoryService,
  ) {}

  afterInit() {
    this.timer = setInterval(() => this.revalidateAll().catch(() => undefined), REVALIDATE_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = (client.handshake.auth as any)?.token;
    const header = client.handshake.headers?.authorization;
    return fromAuth || (typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined);
  }

  private async authenticate(token: string | undefined) {
    if (!token) return null;
    try {
      const payload = this.jwt.verify(token, { secret: this.cfg.get('JWT_SECRET') });
      const user = await this.sessions.resolveAccess(payload);
      return { user, payload };
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const auth = await this.authenticate(this.extractToken(client));
    if (!auth) {
      client.emit('error', { message: 'Authentification requise' });
      client.disconnect(true);
      return;
    }
    const { user, payload } = auth;
    client.data.user = user;
    client.data.payload = payload;
    if (user.status !== AccountStatus.ACTIVE) {
      // Compte en formation : aucune salle, aucun événement
      return;
    }
    if (TERRITORY_EXEMPT.includes(user.role)) client.join('ops:all');
    else if (user.role === Role.CITOYEN) { if (user.zoneId) client.join(`pub:${user.zoneId}`); }
    else if (user.zoneId) {
      client.join(`ops:${user.zoneId}`);
      client.join(`pub:${user.zoneId}`);
    }
  }

  /** Les abonnements arbitraires à une zone ne sont plus acceptés. */
  @SubscribeMessage('join:zone')
  handleJoin(client: Socket) {
    client.emit('error', { message: 'Abonnement manuel refusé : les salles sont attribuées par le serveur' });
  }

  private async revalidateAll() {
    if (!this.server) return;
    const sockets = await this.server.fetchSockets();
    for (const s of sockets) {
      const payload = (s.data as any)?.payload;
      const expired = !payload?.exp || payload.exp * 1000 < Date.now();
      let valid = !expired;
      if (valid) {
        try { await this.sessions.resolveAccess(payload); } catch { valid = false; }
      }
      if (!valid) {
        s.emit('error', { message: 'Session expirée ou révoquée' });
        s.disconnect(true);
      }
    }
  }

  /** Appelé après chaque décision validée en base. */
  async alertChanged(alertId: string) {
    if (!this.server) return;
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        zone: { select: { name: true } },
        broadcasts: { where: { kind: 'PRIMARY' }, select: { certainty: true, targetZoneIds: true }, take: 1 },
      },
    });
    if (!alert) return;
    const summary = {
      id: alert.id, title: alert.title, type: alert.type, alertLevel: alert.alertLevel,
      status: alert.status, currentStep: alert.currentStep, zoneId: alert.zoneId,
      zone: { name: alert.zone?.name }, updatedAt: alert.updatedAt,
    };
    const opsRooms = (await this.territory.ancestorsInclusive(alert.zoneId)).map((z) => `ops:${z}`);
    this.server.to([...opsRooms, 'ops:all']).emit('alert:changed', summary);

    if (DIFFUSED_STATUSES.includes(alert.status)) {
      const primary = alert.broadcasts[0];
      const targets = primary?.targetZoneIds?.length ? primary.targetZoneIds : [alert.zoneId];
      const pubRooms = (await this.territory.subtreeOfMany(targets)).map((z) => `pub:${z}`);
      this.server.to(pubRooms).emit('alert:public', {
        id: alert.id, title: alert.title, type: alert.type, alertLevel: alert.alertLevel,
        zone: { name: alert.zone?.name }, broadcastAt: alert.broadcastAt, certainty: primary?.certainty ?? 'CONFIRMED',
      });
    }
  }
}
