#!/usr/bin/env bash
# Remplacé par scripts/backup.sh (base + médias, chiffré, hors serveur) — audit F31.
exec "$(dirname "$0")/backup.sh" "$@"
