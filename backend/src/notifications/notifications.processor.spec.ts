import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsProcessor } from './notifications.processor';
import { PrismaService } from '../common/prisma/prisma.service';
import { WhatsappService } from './channels/whatsapp.service';
import { SmsService } from './channels/sms.service';
import { Job } from 'bull';

const mockAlert = {
  id: 'alert-1',
  title: 'Inondation imminente',
  description: 'Des pluies torrentielles sont prévues.',
  severity: 2,
  zoneId: 'zone-1',
  zone: { id: 'zone-1', name: 'Zone Sud' },
};

const mockUsers = [
  { id: 'user-1', phone: '+224600000001', name: 'Alpha' },
  { id: 'user-2', phone: '+224600000002', name: 'Beta' },
];

function makeJob(data: object): Job<any> {
  return { data } as Job<any>;
}

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;
  let prisma: jest.Mocked<PrismaService>;
  let whatsapp: jest.Mocked<WhatsappService>;
  let sms: jest.Mocked<SmsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        {
          provide: PrismaService,
          useValue: {
            alert: { findUnique: jest.fn() },
            user: { findMany: jest.fn() },
            notificationLog: { create: jest.fn() },
          },
        },
        {
          provide: WhatsappService,
          useValue: { sendMessage: jest.fn() },
        },
        {
          provide: SmsService,
          useValue: { sendSms: jest.fn() },
        },
      ],
    }).compile();

    processor = module.get<NotificationsProcessor>(NotificationsProcessor);
    prisma = module.get(PrismaService);
    whatsapp = module.get(WhatsappService);
    sms = module.get(SmsService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleFanout', () => {
    it('envoie WhatsApp à chaque utilisateur de la zone', async () => {
      (prisma.alert.findUnique as jest.Mock).mockResolvedValue(mockAlert);
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (whatsapp.sendMessage as jest.Mock).mockResolvedValue(undefined);
      (prisma.notificationLog.create as jest.Mock).mockResolvedValue({});

      await processor.handleFanout(makeJob({ alertId: 'alert-1' }));

      expect(whatsapp.sendMessage).toHaveBeenCalledTimes(mockUsers.length);
      expect(whatsapp.sendMessage).toHaveBeenCalledWith(
        mockUsers[0].phone,
        expect.stringContaining('Inondation imminente'),
      );
      expect(whatsapp.sendMessage).toHaveBeenCalledWith(
        mockUsers[1].phone,
        expect.stringContaining('Inondation imminente'),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'whatsapp', status: 'sent' }),
        }),
      );
    });

    it('utilise le fallback SMS si WhatsApp échoue', async () => {
      (prisma.alert.findUnique as jest.Mock).mockResolvedValue(mockAlert);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([mockUsers[0]]);
      (whatsapp.sendMessage as jest.Mock).mockRejectedValue(new Error('WhatsApp down'));
      (sms.sendSms as jest.Mock).mockResolvedValue(undefined);
      (prisma.notificationLog.create as jest.Mock).mockResolvedValue({});

      await processor.handleFanout(makeJob({ alertId: 'alert-1' }));

      expect(whatsapp.sendMessage).toHaveBeenCalledTimes(1);
      expect(sms.sendSms).toHaveBeenCalledWith(
        mockUsers[0].phone,
        expect.stringContaining('Inondation imminente'),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'sms', status: 'sent' }),
        }),
      );
    });

    it('retourne sans erreur si l\'alerte n\'existe pas', async () => {
      (prisma.alert.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        processor.handleFanout(makeJob({ alertId: 'nonexistent-id' })),
      ).resolves.toBeUndefined();

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(whatsapp.sendMessage).not.toHaveBeenCalled();
    });
  });
});
