import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role } from '@prisma/client';

const USSD_TYPES = [
  { menu: '1. Inondation',           value: 'INONDATION' },
  { menu: '2. Secheresse',           value: 'SECHERESSE' },
  { menu: '3. Incendie',             value: 'INCENDIE' },
  { menu: '4. Tempete / Vent fort',  value: 'TEMPETE' },
  { menu: '5. Epidemie / Maladie',   value: 'EPIDEMIE' },
  { menu: '6. Criquets / Nuisibles', value: 'LOCUSTES' },
  { menu: '7. Autre danger',         value: 'AUTRE' },
];

const SEVERITY_MAP: Record<string, number> = { '1': 1, '2': 2, '3': 3 };

interface UssdSession {
  phone: string;
  data: Record<string, string>;
}

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);
  // Sessions en mémoire (valable mono-instance Docker). En cluster, migrer vers Redis.
  private sessions = new Map<string, UssdSession>();

  constructor(private prisma: PrismaService) {}

  handleSession(sessionId: string, phone: string, text: string, _serviceCode: string): string {
    const parts = text.split('*').filter(Boolean);
    const step = parts.length;

    if (step === 0) {
      this.sessions.set(sessionId, { phone, data: {} });
      return 'CON Bienvenue sur OLEL\nAlerte Precoce - Matam\n\n1. Signaler une situation\n2. Alertes actives\n3. Mon profil\n\n0. Quitter';
    }

    if (parts[0] === '0') return 'END Merci d\'utiliser OLEL. Restez vigilant.';

    if (parts[0] === '1') {
      const typeMenu = USSD_TYPES.map((t) => t.menu).join('\n');
      if (step === 1) return `CON Type de risque :\n${typeMenu}`;

      if (step === 2) {
        const idx = parseInt(parts[1]) - 1;
        const chosen = USSD_TYPES[idx];
        if (!chosen) return `CON Type invalide.\n${typeMenu}`;
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        session.data.type = chosen.value;
        this.sessions.set(sessionId, session);
        return 'CON Decrivez brievement la situation\n(lieu, ampleur) :';
      }

      if (step === 3) {
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        session.data.description = parts[2];
        this.sessions.set(sessionId, session);
        return 'CON Niveau de gravite :\n1. Vigilance\n2. Alerte\n3. Urgence';
      }

      if (step === 4) {
        const session = this.sessions.get(sessionId) || { phone, data: {} };
        const severity = SEVERITY_MAP[parts[3]] ?? 2;
        session.data.severity = String(severity);
        this.sessions.delete(sessionId);

        // Sauvegarde asynchrone — ne bloque pas la réponse USSD (timeout < 30s)
        this.saveSignalement(phone, session.data.type, session.data.description, severity).catch(
          (e) => this.logger.error(`Erreur sauvegarde signalement USSD [${phone}]: ${(e as Error).message}`),
        );

        const sevLabel = { 1: 'Vigilance', 2: 'Alerte', 3: 'Urgence' }[severity] ?? 'Alerte';
        return `END Signalement enregistre.\nType: ${session.data.type}\nGravite: ${sevLabel}\n\nLes autorites de Matam ont ete notifiees. Merci.`;
      }
    }

    if (parts[0] === '2') {
      return 'END Consultez les alertes sur WhatsApp OLEL ou contactez la prefecture de Matam.';
    }

    if (parts[0] === '3') {
      return `END Votre numero: ${phone}\nZone: Matam\nPour toute modification, contactez votre mairie.`;
    }

    return 'END Option non reconnue. Composez a nouveau pour recommencer.';
  }

  private async saveSignalement(phone: string, type: string, description: string, severity: number) {
    // Trouver ou créer le compte CITOYEN par numéro de téléphone
    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      const defaultZone = await this.prisma.zone.findFirst({
        where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
      });
      user = await this.prisma.user.create({
        data: {
          phone,
          name: `Citoyen USSD ${phone.slice(-4)}`,
          role: Role.CITOYEN,
          isActive: true,
          zoneId: defaultZone?.id,
        },
      });
      this.logger.log(`Nouveau compte créé via USSD: ${phone}`);
    }

    // Résoudre la zone
    const zoneId = user.zoneId ?? (await this.prisma.zone.findFirst({
      where: { parentId: null }, orderBy: { createdAt: 'asc' }, select: { id: true },
    }))?.id;

    // Créer l'alerte
    const alert = await this.prisma.alert.create({
      data: {
        title: `Signalement USSD : ${type}`,
        description: description || `Signalement de type ${type} via USSD`,
        type: type as any,
        severity,
        zoneId,
        createdById: user.id,
        requiresMedicalReview: type === 'EPIDEMIE',
      },
    });

    // Tracer le signalement source
    await this.prisma.signalement.create({
      data: {
        userId: user.id,
        alertId: alert.id,
        type: type as any,
        text: description || `Signalement USSD: ${type}`,
        channel: 'ussd',
      },
    });

    this.logger.log(`Signalement USSD sauvegardé: alertId=${alert.id} type=${type} phone=${phone}`);
  }
}
