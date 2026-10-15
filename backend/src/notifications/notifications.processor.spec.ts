import { Job } from 'bull';
import { AlertStatus, BroadcastStatus } from '@prisma/client';
import { NotificationsProcessor } from './notifications.processor';

/**
 * Tests unitaires des garde-fous du processeur (sans base).
 * Le comportement complet (destinataires, reprises, comptages) est couvert
 * par test/e2e/diffusion-chain.e2e-spec.ts sur une vraie base et un vrai Redis.
 */
describe('NotificationsProcessor — garde-fous', () => {
  let prisma: any;
  let whatsapp: { sendMessage: jest.Mock };
  let sms: { sendSms: jest.Mock };
  let processor: NotificationsProcessor;

  const job = (data: object, name = 'dispatch', attemptsMade = 0) =>
    ({ data, name, attemptsMade, opts: { attempts: 4 } }) as unknown as Job<any>;

  beforeEach(() => {
    prisma = {
      broadcast: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      broadcastDelivery: { groupBy: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    whatsapp = { sendMessage: jest.fn() };
    sms = { sendSms: jest.fn() };
    processor = new NotificationsProcessor(prisma, {} as any, whatsapp as any, sms as any, { isEnabled: jest.fn().mockResolvedValue(true) } as any);
  });

  it('une tâche « fanout » héritée n\'envoie rien', async () => {
    await processor.legacyFanout(job({ alertId: 'a1', message: 'texte non figé' }, 'fanout'));
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(prisma.broadcast.findUnique).not.toHaveBeenCalled();
  });

  it('une intention déjà terminée n\'est jamais rejouée', async () => {
    prisma.broadcast.findUnique.mockResolvedValue({ id: 'b1', status: BroadcastStatus.DONE, kind: 'PRIMARY', payload: { fr: 'x' }, alert: { status: AlertStatus.BROADCAST } });
    await processor.handleDispatch(job({ broadcastId: 'b1' }));
    expect(prisma.broadcast.update).not.toHaveBeenCalled();
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it('une intention sans texte figé (antérieure à la migration) est annulée, pas envoyée', async () => {
    prisma.broadcast.findUnique.mockResolvedValue({ id: 'b1', status: BroadcastStatus.PENDING, kind: null, payload: null, alert: { status: AlertStatus.BROADCAST } });
    await processor.handleDispatch(job({ broadcastId: 'b1' }));
    expect(prisma.broadcast.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BroadcastStatus.CANCELLED }),
    }));
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it.each([AlertStatus.REJECTED, AlertStatus.CANCELLED, AlertStatus.CLOSED, AlertStatus.RESOLVED])(
    'une diffusion principale dont l\'alerte est passée %s est annulée avant envoi',
    async (status) => {
      prisma.broadcast.findUnique.mockResolvedValue({ id: 'b1', status: BroadcastStatus.DISPATCHING, kind: 'PRIMARY', payload: { fr: 'x' }, channels: ['whatsapp'], alert: { status, zoneId: 'z' } });
      await processor.handleDispatch(job({ broadcastId: 'b1' }));
      expect(prisma.broadcast.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: BroadcastStatus.CANCELLED }),
      }));
      expect(whatsapp.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('après épuisement des tentatives, une erreur inattendue rend l\'intention FAILED (visible)', async () => {
    await processor.onFailed(job({ broadcastId: 'b1' }, 'dispatch', 4), new Error('base indisponible'));
    expect(prisma.broadcast.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BroadcastStatus.FAILED, lastError: 'base indisponible' }),
    }));
  });

  it('avant épuisement, l\'échec laisse Bull réessayer', async () => {
    await processor.onFailed(job({ broadcastId: 'b1' }, 'dispatch', 2), new Error('temporaire'));
    expect(prisma.broadcast.updateMany).not.toHaveBeenCalled();
  });
});
