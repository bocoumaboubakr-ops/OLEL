-- Préférence de langue de l'utilisateur (notifications + bot dans sa langue)
-- fr=Français, ff=Pulaar/Fulfulde, wo=Wolof, snk=Soninké
ALTER TABLE "users" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr';
