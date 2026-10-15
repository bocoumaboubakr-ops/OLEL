-- Gravité estimée par le signaleur (1=vigilance, 2=alerte, 3=urgence)
ALTER TABLE "signalements" ADD COLUMN "severity" INTEGER;
