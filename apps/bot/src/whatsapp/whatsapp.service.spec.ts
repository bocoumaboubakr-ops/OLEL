import { WhatsappService } from './whatsapp.service';
import { t } from './i18n';

/** Conversation du bot : consentement, STOP, conservation du 1er média, messages honnêtes (F06, F16, F24, F25). */
describe('WhatsappService', () => {
  let backend: any;
  let svc: WhatsappService;
  let sent: string[];
  let session: any;
  const from = '221770000001';
  const cfg = { get: (k: string, d?: any) => ({ NODE_ENV: 'test' } as any)[k] ?? d } as any;
  const say = (body: string, id = `wamid.${Math.random()}`) => svc.handleIncoming({ id, from, type: 'text', text: { body } });

  beforeEach(() => {
    session = null;
    sent = [];
    backend = {
      getSession: jest.fn(async () => session),
      saveSession: jest.fn(async (_p: string, s: any) => { session = JSON.parse(JSON.stringify(s)); }),
      getConsent: jest.fn().mockResolvedValue({ known: true, optedOut: false, whatsappOptIn: false }),
      setConsent: jest.fn().mockResolvedValue(undefined),
      getActiveAlerts: jest.fn().mockResolvedValue([]),
      createSignalement: jest.fn().mockResolvedValue({ id: 'abcdef12-0000-4000-8000-000000000000' }),
      uploadMedia: jest.fn().mockResolvedValue('/uploads/x.jpg'),
    };
    svc = new WhatsappService(cfg, backend);
    jest.spyOn(svc as any, 'sendText').mockImplementation(async (_to: unknown, text: unknown) => { sent.push(String(text)); });
  });

  it('après le choix de la langue, le consentement explicite est demandé puis enregistré', async () => {
    await say('bonjour');
    await say('1');
    expect(sent.at(-1)).toBe(t('fr').consentPrompt);
    await say('1');
    expect(backend.setConsent).toHaveBeenCalledWith(from, 'WHATSAPP_OPT_IN', 'fr');
    expect(sent).toContain(t('fr').menu);
  });

  it('STOP désabonne réellement, à toute étape ; ALERTES réabonne', async () => {
    await say('STOP');
    expect(backend.setConsent).toHaveBeenCalledWith(from, 'OPT_OUT', undefined);
    expect(sent.at(-1)).toBe(t('fr').optedOut);
    await say('alertes');
    expect(backend.setConsent).toHaveBeenLastCalledWith(from, 'OPT_IN_AGAIN', undefined);
  });

  it('une photo envoyée avant le choix de la langue n\'est pas perdue', async () => {
    jest.spyOn(svc as any, 'downloadWhatsappMedia').mockResolvedValue({ url: '/uploads/photo.jpg' });
    await svc.handleIncoming({ id: 'wamid.photo', from, type: 'image', image: { id: 'm1' } });
    expect(session.data.mediaUrls).toEqual(['/uploads/photo.jpg']);
    await say('3');
    expect(backend.createSignalement).toHaveBeenCalledWith(expect.objectContaining({ mediaUrls: ['/uploads/photo.jpg'], messageId: 'wamid.photo', language: 'wo' }));
  });

  it('consultation : « indisponible » si le backend ne répond pas, distinct de « aucune alerte »', async () => {
    session = { step: 'awaiting_choice', lang: 'fr', data: {} };
    backend.getActiveAlerts.mockResolvedValueOnce(null);
    await say('2');
    expect(sent.at(-1)).toBe(t('fr').alertsUnavailable);
    session = { step: 'awaiting_choice', lang: 'fr', data: {} };
    await say('2');
    expect(sent.at(-1)).toBe(t('fr').alertsNone);
    expect(backend.getActiveAlerts).toHaveBeenCalledWith(from);
  });

  it('signalement complet : identifiant du message transmis (dédoublonnage), confirmation sans promesse', async () => {
    session = { step: 'report_theme', lang: 'fr', data: {} };
    await say('1');           // thématique
    await say('1');           // type
    await say('Eau dans les cases');
    await say('passer');
    await say('3', 'wamid.final');
    expect(backend.createSignalement).toHaveBeenCalledWith(expect.objectContaining({ severity: 3, messageId: 'wamid.final', subtype: expect.any(String) }));
    const confirmation = sent.find((m) => m.includes('Signalement reçu par OLEL'))!;
    expect(confirmation).toContain('Réf : ABCDEF12');
    expect(confirmation).not.toMatch(/autorités ont été notifiées/);
  });

  it('les confirmations de signalement n\'annoncent dans aucune langue que les autorités sont notifiées', () => {
    for (const l of ['fr', 'ff', 'wo', 'snk'] as const) {
      const m = t(l).reportSaved('X', 'Y', 'REF');
      expect(m).not.toMatch(/notifiées|humpitaama|xamees|toxo/);
      expect(m).toContain('REF');
    }
  });
});
