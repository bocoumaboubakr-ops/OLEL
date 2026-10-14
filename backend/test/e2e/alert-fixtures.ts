import { AlertLevel, AlertStatus, AlertStep, BroadcastStatus, Role } from '@prisma/client';
import { Ctx, TestUser } from './harness';

export interface AlertOpts {
  level?: AlertLevel;
  status?: AlertStatus;
  step?: AlertStep;
  zoneId: string;
  createdById: string;
  type?: string;
  requiresMedicalReview?: boolean;
  verifiedAt?: Date;
  /** Personnes ayant déjà validé une étape (historique de validations) */
  validators?: string[];
}

/** Crée une alerte directement dans un état donné (données fictives). */
export async function makeAlert(ctx: Ctx, o: AlertOpts) {
  const alert = await ctx.prisma.alert.create({
    data: {
      title: 'Crue rapide (exercice)', description: 'Montée des eaux — données fictives de test',
      type: (o.type ?? 'INONDATION') as any, alertLevel: o.level ?? AlertLevel.ROUGE,
      status: o.status ?? AlertStatus.VALIDATED, currentStep: o.step ?? AlertStep.MAIRIE,
      zoneId: o.zoneId, createdById: o.createdById,
      requiresMedicalReview: o.requiresMedicalReview ?? false,
      verifiedAt: o.verifiedAt ?? new Date(), mediaUrls: [],
    },
  });
  for (const v of o.validators ?? []) {
    await ctx.prisma.validation.create({ data: { alertId: alert.id, validatorId: v, approved: true, action: 'VALIDATED', step: AlertStep.SIGNALEMENT } });
  }
  return alert;
}

export async function setFlag(ctx: Ctx, name: string, enabled: boolean) {
  await ctx.prisma.featureFlag.upsert({ where: { name }, update: { enabled }, create: { name, enabled } });
}

/** Attend qu'une intention de diffusion atteigne un état final (traitée par le vrai worker Bull). */
export async function waitFinal(ctx: Ctx, broadcastId: string, timeoutMs = 20000) {
  const FINAL: BroadcastStatus[] = ['DONE', 'PARTIAL', 'FAILED', 'CANCELLED'];
  const t0 = Date.now();
  for (;;) {
    const b = await ctx.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (b && FINAL.includes(b.status)) return b;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Diffusion ${broadcastId} non terminée (statut ${b?.status})`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

export const citizenIn = (ctx: Ctx, zoneId: string, language = 'fr') =>
  ctx.prisma.user.create({
    data: {
      phone: `+22176${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      name: 'Citoyen fictif', role: Role.CITOYEN, zoneId, language,
    },
  });

export type { TestUser };
