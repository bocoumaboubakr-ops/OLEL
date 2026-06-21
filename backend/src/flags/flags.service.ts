import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const DEFAULT_FLAGS = [
  { name: 'whatsapp', enabled: true },
  { name: 'sms', enabled: true },
  { name: 'ussd', enabled: true },
  { name: 'ivr', enabled: false },
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
