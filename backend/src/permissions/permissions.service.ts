import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';

/** Catalogue complet des permissions OLEL. */
const PERMISSION_CATALOG = [
  // Alertes
  { name: 'alert.create',             category: 'alerts',      description: 'Créer un signalement / alerte' },
  { name: 'alert.view',               category: 'alerts',      description: 'Voir les alertes de sa zone' },
  { name: 'alert.view.all',           category: 'alerts',      description: 'Voir toutes les alertes (toutes zones)' },
  { name: 'alert.validate.sentinelle',category: 'alerts',      description: 'Valider à l\'étape Signalement' },
  { name: 'alert.validate.coordinateur', category: 'alerts',   description: 'Valider à l\'étape Sentinelle' },
  { name: 'alert.validate.mairie',    category: 'alerts',      description: 'Valider à l\'étape Coordinateur' },
  { name: 'alert.validate.prefecture',category: 'alerts',      description: 'Valider à l\'étape Mairie' },
  { name: 'alert.validate.gouvernance',category: 'alerts',     description: 'Valider à l\'étape Préfecture (ROUGE_FONCE)' },
  { name: 'alert.critical.validate',  category: 'alerts',      description: 'Enregistrer une validation critique (ORANGE+)' },
  { name: 'alert.broadcast',          category: 'alerts',      description: 'Diffuser une alerte (multi-canal)' },
  { name: 'alert.broadcast.regional', category: 'alerts',      description: 'Diffuser sur plusieurs zones / région entière' },
  { name: 'alert.close',              category: 'alerts',      description: 'Clôturer une alerte' },
  { name: 'alert.medical.clearance',  category: 'alerts',      description: 'Lever blocage médical EPIDEMIE' },
  // Données techniques
  { name: 'data.hydro.publish',       category: 'data',        description: 'Publier données hydrologie / météo' },
  { name: 'data.hydro.view',          category: 'data',        description: 'Consulter données hydrologie / météo' },
  // Radio
  { name: 'radio.receive',            category: 'radio',       description: 'Recevoir les alertes validées (radio)' },
  // Missions
  { name: 'mission.create',           category: 'missions',    description: 'Créer une mission sentinelle' },
  { name: 'mission.assign',           category: 'missions',    description: 'Assigner une sentinelle à une mission' },
  { name: 'mission.view',             category: 'missions',    description: 'Voir les missions de sa zone' },
  { name: 'mission.complete',         category: 'missions',    description: 'Marquer une mission terminée' },
  // Utilisateurs
  { name: 'user.manage',              category: 'users',       description: 'Gérer les utilisateurs (CRUD)' },
  { name: 'user.change_role',         category: 'users',       description: 'Modifier le rôle d\'un utilisateur' },
  { name: 'user.deactivate',          category: 'users',       description: 'Désactiver un compte utilisateur' },
  // Territoires
  { name: 'territory.manage',         category: 'territories', description: 'Gérer régions / départements / communes' },
  // Plateforme
  { name: 'platform.flags',           category: 'platform',    description: 'Gérer les feature flags' },
  { name: 'platform.audit',           category: 'platform',    description: 'Consulter les logs d\'audit' },
  { name: 'platform.config',          category: 'platform',    description: 'Configuration globale de la plateforme' },
];

/** Permissions attribuées par rôle. */
const ROLE_GRANTS: Record<Role, string[]> = {
  CITOYEN:              ['alert.create', 'alert.view', 'data.hydro.view'],
  SENTINELLE:           ['alert.create', 'alert.view', 'alert.validate.sentinelle', 'alert.critical.validate', 'mission.view', 'mission.complete', 'data.hydro.view'],
  RADIO_COMMUNAUTAIRE:  ['alert.view', 'radio.receive', 'data.hydro.view'],
  COORDINATEUR:         ['alert.create', 'alert.view', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.critical.validate', 'mission.create', 'mission.assign', 'mission.view', 'mission.complete', 'data.hydro.view'],
  MAIRIE:               ['alert.create', 'alert.view', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.critical.validate', 'alert.broadcast', 'alert.close', 'mission.create', 'mission.assign', 'mission.view', 'data.hydro.view'],
  HYDRO_METEO:          ['alert.create', 'alert.view', 'data.hydro.publish', 'data.hydro.view'],
  PREFECTURE:           ['alert.create', 'alert.view', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.critical.validate', 'alert.broadcast', 'alert.close', 'mission.create', 'mission.assign', 'mission.view', 'data.hydro.view'],
  GOUVERNORAT:          ['alert.create', 'alert.view', 'alert.view.all', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.validate.gouvernance', 'alert.critical.validate', 'alert.broadcast', 'alert.broadcast.regional', 'alert.close', 'mission.create', 'mission.assign', 'mission.view', 'data.hydro.view'],
  PROTECTION_CIVILE:    ['alert.create', 'alert.view', 'alert.view.all', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.validate.gouvernance', 'alert.critical.validate', 'alert.broadcast', 'alert.broadcast.regional', 'alert.close', 'alert.medical.clearance', 'mission.create', 'mission.assign', 'mission.view', 'data.hydro.view'],
  SUPERVISEUR_REGIONAL: ['alert.create', 'alert.view', 'alert.view.all', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.validate.gouvernance', 'alert.critical.validate', 'alert.broadcast', 'alert.broadcast.regional', 'alert.close', 'mission.create', 'mission.assign', 'mission.view', 'user.manage', 'user.deactivate', 'territory.manage', 'data.hydro.view', 'platform.audit'],
  ADMIN:                ['alert.create', 'alert.view', 'alert.view.all', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.validate.gouvernance', 'alert.critical.validate', 'alert.broadcast', 'alert.broadcast.regional', 'alert.close', 'alert.medical.clearance', 'mission.create', 'mission.assign', 'mission.view', 'user.manage', 'user.change_role', 'user.deactivate', 'territory.manage', 'data.hydro.publish', 'data.hydro.view', 'platform.flags', 'platform.audit'],
  SUPER_ADMIN:          ['alert.create', 'alert.view', 'alert.view.all', 'alert.validate.sentinelle', 'alert.validate.coordinateur', 'alert.validate.mairie', 'alert.validate.prefecture', 'alert.validate.gouvernance', 'alert.critical.validate', 'alert.broadcast', 'alert.broadcast.regional', 'alert.close', 'alert.medical.clearance', 'mission.create', 'mission.assign', 'mission.view', 'user.manage', 'user.change_role', 'user.deactivate', 'territory.manage', 'data.hydro.publish', 'data.hydro.view', 'platform.flags', 'platform.audit', 'platform.config', 'radio.receive'],
};

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  /** Seed automatique des permissions et grants au démarrage. */
  async onModuleInit() {
    for (const p of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { name: p.name },
        update: { description: p.description, category: p.category },
        create: p,
      });
    }
    for (const [role, perms] of Object.entries(ROLE_GRANTS)) {
      for (const permName of perms) {
        const perm = await this.prisma.permission.findUnique({ where: { name: permName } });
        if (!perm) continue;
        await this.prisma.rolePermission.upsert({
          where: { role_permissionId: { role: role as Role, permissionId: perm.id } },
          update: {},
          create: { role: role as Role, permissionId: perm.id },
        });
      }
    }
  }

  getMatrix() {
    return this.prisma.rolePermission.findMany({
      include: { permission: true },
      orderBy: [{ role: 'asc' }, { permission: { category: 'asc' } }],
    });
  }

  getByRole(role: Role) {
    return this.prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
      orderBy: { permission: { category: 'asc' } },
    });
  }

  getCatalog() {
    return this.prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  getRoleMenus(role: Role): string[] {
    const menus: Record<Role, string[]> = {
      CITOYEN:              ['map', 'my-reports'],
      SENTINELLE:           ['queue', 'missions', 'training'],
      RADIO_COMMUNAUTAIRE:  ['alerts-received'],
      COORDINATEUR:         ['queue', 'sentinelles', 'missions', 'reports'],
      MAIRIE:               ['alerts', 'validate', 'broadcast', 'missions', 'stats'],
      HYDRO_METEO:          ['data-publish', 'data-history'],
      PREFECTURE:           ['alerts', 'validate', 'broadcast', 'coordinate', 'stats'],
      GOUVERNORAT:          ['alerts', 'validate', 'broadcast-regional', 'dashboard-territorial', 'stats'],
      PROTECTION_CIVILE:    ['alerts', 'validate', 'broadcast-regional', 'medical-clearance', 'close'],
      SUPERVISEUR_REGIONAL: ['users', 'zones', 'sentinelles', 'reports', 'audit'],
      ADMIN:                ['users', 'zones', 'alerts', 'flags', 'audit', 'config'],
      SUPER_ADMIN:          ['users', 'zones', 'alerts', 'flags', 'audit', 'config', 'security', 'backups'],
    };
    return menus[role] || [];
  }
}
