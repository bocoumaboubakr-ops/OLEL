import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Source d'autorité territoriale (audit F08, F09).
 *
 * Le territoire d'un compte est sa zone et TOUS ses descendants (récursif).
 * Contrairement à l'ancien `expandZoneTree`, on n'ajoute jamais les ancêtres
 * ni les zones sœurs : une sentinelle de la commune A ne voit pas la commune B,
 * et une alerte locale n'est pas élargie à toute la région.
 */
@Injectable()
export class TerritoryService {
  constructor(private prisma: PrismaService) {}

  /** Zone + descendants (récursif, toutes profondeurs). */
  async subtree(zoneId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE t AS (
        SELECT id FROM zones WHERE id = ${zoneId}
        UNION
        SELECT z.id FROM zones z JOIN t ON z."parentId" = t.id
      )
      SELECT id FROM t`;
    return rows.map((r) => r.id);
  }

  /** Zone + ses ancêtres jusqu'à la racine (autorités dont le territoire la contient). */
  async ancestorsInclusive(zoneId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE up AS (
        SELECT id, "parentId" FROM zones WHERE id = ${zoneId}
        UNION
        SELECT z.id, z."parentId" FROM zones z JOIN up ON z.id = up."parentId"
      )
      SELECT id FROM up`;
    return rows.map((r) => r.id);
  }

  /** Union des sous-arbres de plusieurs zones. */
  async subtreeOfMany(zoneIds: string[]): Promise<string[]> {
    const all = new Set<string>();
    for (const z of zoneIds) (await this.subtree(z)).forEach((id) => all.add(id));
    return Array.from(all);
  }

  /** `zoneId` est-elle dans le territoire enraciné en `rootZoneId` ? */
  async isWithin(zoneId: string | null | undefined, rootZoneId: string | null | undefined): Promise<boolean> {
    if (!zoneId || !rootZoneId) return false;
    if (zoneId === rootZoneId) return true;
    const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      WITH RECURSIVE up AS (
        SELECT id, "parentId" FROM zones WHERE id = ${zoneId}
        UNION
        SELECT z.id, z."parentId" FROM zones z JOIN up ON z.id = up."parentId"
      )
      SELECT EXISTS (SELECT 1 FROM up WHERE id = ${rootZoneId}) AS ok`;
    return !!rows[0]?.ok;
  }
}

@Global()
@Module({ providers: [TerritoryService], exports: [TerritoryService] })
export class TerritoryModule {}
