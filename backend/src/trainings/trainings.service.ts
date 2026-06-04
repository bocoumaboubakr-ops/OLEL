import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTrainingModuleDto, UpdateTrainingModuleDto, CreateLessonDto } from './dto/training.dto';

@Injectable()
export class TrainingsService {
  constructor(private prisma: PrismaService) {}

  /** Liste des modules actifs avec leçons, et progression de l'utilisateur. */
  async findAllForUser(userId: string) {
    const modules = await this.prisma.trainingModule.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
    const progress = await this.prisma.trainingProgress.findMany({ where: { userId } });
    const byModule = new Map(progress.map((p) => [p.moduleId, p]));

    return modules.map((m) => ({
      ...m,
      progress: byModule.get(m.id)
        ? { completed: byModule.get(m.id)!.completed, score: byModule.get(m.id)!.score, completedAt: byModule.get(m.id)!.completedAt }
        : { completed: false, score: null, completedAt: null },
    }));
  }

  /** Synthèse de formation de l'utilisateur : a-t-il complété tous les modules requis ? */
  async myStatus(userId: string) {
    const required = await this.prisma.trainingModule.findMany({ where: { isActive: true, isRequired: true }, select: { id: true } });
    const done = await this.prisma.trainingProgress.findMany({ where: { userId, completed: true }, select: { moduleId: true } });
    const doneIds = new Set(done.map((d) => d.moduleId));
    const requiredDone = required.filter((r) => doneIds.has(r.id)).length;
    const total = await this.prisma.trainingModule.count({ where: { isActive: true } });
    return {
      requiredTotal: required.length,
      requiredDone,
      allRequiredDone: required.length > 0 && requiredDone === required.length,
      completedCount: done.length,
      totalModules: total,
      certified: required.length === 0 ? false : requiredDone === required.length,
    };
  }

  async completeModule(userId: string, moduleId: string, score?: number) {
    const module = await this.prisma.trainingModule.findUnique({ where: { id: moduleId } });
    if (!module) throw new NotFoundException('Module introuvable');

    const progress = await this.prisma.trainingProgress.upsert({
      where: { userId_moduleId: { userId, moduleId } },
      update: { completed: true, score, completedAt: new Date() },
      create: { userId, moduleId, completed: true, score, completedAt: new Date() },
    });

    // Si tous les modules requis sont complétés, marquer la sentinelle active
    const status = await this.myStatus(userId);
    if (status.allRequiredDone) {
      await this.prisma.user.update({ where: { id: userId }, data: { isActive: true, lastActiveAt: new Date() } }).catch(() => {});
    }
    return { progress, status };
  }

  // ── Admin CRUD ──────────────────────────────────────────────────────────────
  create(dto: CreateTrainingModuleDto) {
    return this.prisma.trainingModule.create({ data: dto });
  }

  async update(id: string, dto: UpdateTrainingModuleDto) {
    await this.ensureExists(id);
    return this.prisma.trainingModule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.trainingModule.update({ where: { id }, data: { isActive: false } });
  }

  async addLesson(moduleId: string, dto: CreateLessonDto) {
    await this.ensureExists(moduleId);
    return this.prisma.trainingLesson.create({ data: { ...dto, moduleId } });
  }

  private async ensureExists(id: string) {
    const m = await this.prisma.trainingModule.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Module introuvable');
  }
}
