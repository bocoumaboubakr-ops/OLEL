import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WhatsappController } from './whatsapp.controller';

/** Webhook Meta : rien n'est acquitté sans enregistrement durable (audit F25, F22). */
describe('WhatsappController', () => {
  const SECRET = 'app-secret-test';
  let backend: any;
  let whatsapp: any;
  let ctrl: WhatsappController;
  const cfg = { get: (k: string, d?: any) => ({ WHATSAPP_APP_SECRET: SECRET, NODE_ENV: 'test', WHATSAPP_VERIFY_TOKEN: 'verif' } as any)[k] ?? d } as any;

  const signed = (body: any) => {
    const raw = Buffer.from(JSON.stringify(body));
    return { headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex') }, rawBody: raw } as any;
  };
  const payload = (messages: any[] = [], statuses: any[] = []) => ({
    object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages, statuses } }] }],
  });
  const msg = { id: 'wamid.1', from: '221770000001', type: 'text', text: { body: 'menu' } };

  beforeEach(() => {
    backend = {
      recordInbound: jest.fn().mockResolvedValue({ duplicate: false }),
      markInbound: jest.fn().mockResolvedValue(undefined),
      forwardStatuses: jest.fn().mockResolvedValue(undefined),
      pendingInbound: jest.fn().mockResolvedValue([]),
    };
    whatsapp = { handleIncoming: jest.fn().mockResolvedValue(undefined) };
    ctrl = new WhatsappController(whatsapp, backend, cfg);
  });

  it('signature absente ou fausse : refusé, rien n\'est enregistré', async () => {
    const body = payload([msg]);
    await expect(ctrl.receive({ headers: {}, rawBody: Buffer.from('{}') } as any, body)).rejects.toThrow(ForbiddenException);
    await expect(ctrl.receive({ headers: { 'x-hub-signature-256': 'sha256=00' }, rawBody: Buffer.from('{}') } as any, body)).rejects.toThrow(ForbiddenException);
    expect(backend.recordInbound).not.toHaveBeenCalled();
  });

  it('enregistre AVANT de traiter, puis marque traité', async () => {
    const body = payload([msg]);
    await ctrl.receive(signed(body), body);
    expect(backend.recordInbound.mock.invocationCallOrder[0]).toBeLessThan(whatsapp.handleIncoming.mock.invocationCallOrder[0]);
    expect(backend.markInbound).toHaveBeenCalledWith('wamid.1', 'PROCESSED');
  });

  it('enregistrement impossible : 503 (Meta re-livrera), aucun traitement', async () => {
    backend.recordInbound.mockRejectedValue(new Error('backend indisponible'));
    const body = payload([msg]);
    await expect(ctrl.receive(signed(body), body)).rejects.toThrow(ServiceUnavailableException);
    expect(whatsapp.handleIncoming).not.toHaveBeenCalled();
  });

  it('message déjà traité (re-livraison Meta) : ignoré', async () => {
    backend.recordInbound.mockResolvedValue({ duplicate: true });
    const body = payload([msg]);
    await ctrl.receive(signed(body), body);
    expect(whatsapp.handleIncoming).not.toHaveBeenCalled();
  });

  it('échec de traitement après enregistrement : marqué FAILED (repris), réponse 200', async () => {
    whatsapp.handleIncoming.mockRejectedValue(new Error('boom'));
    const body = payload([msg]);
    await expect(ctrl.receive(signed(body), body)).resolves.toEqual({ status: 'ok' });
    expect(backend.markInbound).toHaveBeenCalledWith('wamid.1', 'FAILED', 'boom');
  });

  it('statuts de livraison relayés avec la cause d\'échec', async () => {
    const body = payload([], [
      { id: 'wamid.out1', status: 'delivered', timestamp: '1792000000' },
      { id: 'wamid.out2', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] },
    ]);
    await ctrl.receive(signed(body), body);
    expect(backend.forwardStatuses).toHaveBeenCalledWith([
      { providerMessageId: 'wamid.out1', status: 'delivered', timestamp: '1792000000', error: undefined },
      { providerMessageId: 'wamid.out2', status: 'failed', timestamp: undefined, error: '[131047] Re-engagement message' },
    ]);
  });

  it('reprise : les messages en attente sont retraités', async () => {
    backend.pendingInbound.mockResolvedValue([{ id: 'wamid.9', payload: { ...msg, id: 'wamid.9' } }]);
    await ctrl.recover();
    expect(whatsapp.handleIncoming).toHaveBeenCalledWith(expect.objectContaining({ id: 'wamid.9' }));
    expect(backend.markInbound).toHaveBeenCalledWith('wamid.9', 'PROCESSED');
  });

  it('vérification du webhook : jeton exigé (plus de valeur par défaut)', () => {
    expect(ctrl.verify('subscribe', 'verif', 'challenge')).toBe('challenge');
    expect(() => ctrl.verify('subscribe', 'olel_webhook_secret', 'c')).toThrow(ForbiddenException);
  });
});
