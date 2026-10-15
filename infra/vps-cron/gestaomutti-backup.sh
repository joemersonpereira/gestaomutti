#!/usr/bin/env bash
#
# Backup diário do banco SQLite do Sistema Mutti, na própria VPS (cron do root).
#
#   gestaomutti-backup.sh
#
# Faz duas coisas, nesta ordem:
#   1. roda `backup.js` DENTRO do container (backup nativo do SQLite, seguro com o
#      sistema em uso) → grava em /app/backend/backups, que é o volume `backups`;
#      o próprio backup.js mantém só os 30 mais recentes lá dentro.
#   2. copia o arquivo recém-gerado para FORA do Docker, em $DESTINO, e mantém
#      $GUARDAR cópias — é a cópia que sobrevive a um `docker volume rm` por engano.
#
# Saída: uma linha por execução em $LOG_FILE. Código de saída ≠ 0 = falhou.
# Mesmo modelo do /opt/apps/catalogo-interativo/cron: julgamento aqui, log em /var/log.

set -uo pipefail

SERVICE_NAME="${SERVICE_NAME:-gestaomutti_web}"
DESTINO="${DESTINO:-/opt/apps/gestaomutti/backups}"
GUARDAR="${GUARDAR:-14}"
LOG_FILE="${LOG_FILE:-/var/log/gestaomutti-backup.log}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }

CID=$(docker ps -q -f "name=${SERVICE_NAME}." | head -1)
if [ -z "$CID" ]; then log "ERRO container do $SERVICE_NAME não está rodando"; exit 1; fi

# 1. backup nativo, dentro do container
SAIDA=$(docker exec "$CID" node src/db/backup.js 2>&1)
RC=$?
if [ $RC -ne 0 ]; then log "ERRO backup.js saiu com $RC: ${SAIDA:0:300}"; exit 1; fi
ARQ=$(echo "$SAIDA" | sed -n 's/^Backup criado: //p' | head -1)
if [ -z "$ARQ" ]; then log "ERRO não achei o nome do arquivo na saída: ${SAIDA:0:300}"; exit 1; fi

# 2. cópia para fora do Docker
mkdir -p "$DESTINO"
if ! docker cp "$CID:$ARQ" "$DESTINO/"; then log "ERRO docker cp de $ARQ"; exit 1; fi
NOME=$(basename "$ARQ")
TAM=$(du -h "$DESTINO/$NOME" | cut -f1)

# mantém só as $GUARDAR mais recentes em $DESTINO
ls -1t "$DESTINO"/mutti-*.db 2>/dev/null | tail -n +$((GUARDAR + 1)) | xargs -r rm -f

log "OK $NOME ($TAM) → $DESTINO"
exit 0
