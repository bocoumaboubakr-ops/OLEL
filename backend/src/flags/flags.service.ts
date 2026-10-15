import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const DEFAULT_FLAGS = [
  { name: 'whatsapp', enabled: true },
  { name: 'sms', enabled: true },
  { name: 'ussd', enabled: true },
  { name: 'ivr', enabled: false },
  // Automatismes de diffusion sans confirmation humaine : désactivés par
  // défaut, activables par un administrateur (décision D3, audit F03/F04).
  { name: 'prealert_red', enabled: false },
  { name: 'auto_escalation_red', enabled: false },
  // Modèles WhatsApp hors fenêtre de 24 h : à activer seulement après
  // approbation des modèles par Meta (audit F24).
  { name: 'whatsapp_templates', enabled: false },
];

@Injectable()
export class FlagsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const existing = await this.prisma.featureFlag.findMany();
    const existingNames = new Set(existing.map((f) => f.name));
    // Upsert defaults that don't exist yet
    const missing = DEFAULT_FLAGS.filter((f) => !existingNames.has(f.name));
    if (missing.length > 0) {
      await Promise.all(
        missing.map((f) =>
          this.prisma.featureFlag.upsert({
            where: { name: f.name },
            update: {},
            create: { name: f.name, enabled: f.enabled },
          }),
        ),
      );
      return this.prisma.featureFlag.findMany({ orderBy: { name: 'asc' } });
    }
    return existing.sort((a, b) => a.name.localeCompare(b.name));
  }

  async toggle(name: string, enabled: boolean) {
    return this.prisma.featureFlag.upsert({
      where: { name },
      update: { enabled },
      create: { name, enabled },
    });
  }

  async isEnabled(name: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { name } });
    if (!flag) {
      const def = DEFAULT_FLAGS.find((f) => f.name === name);
      return def?.enabled ?? false;
    }
    return flag.enabled;
  }
}
