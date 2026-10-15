#!/usr/bin/env sh
# Entrypoint da imagem. Roda como usuário `node`, em /app/backend.
#
#   1. recusa subir sem JWT_SECRET (sem ele todo login falha, em silêncio)
#   2. cria o banco se o arquivo não existe (setup.js — só na 1ª subida de um volume vazio)
#   3. aplica as migrações pendentes (migrar.js — idempotente, anota na schema_migracoes)
#   4. sobe o servidor
#
# `set -e`: se o setup ou uma migração falhar, o container NÃO sobe — o Swarm faz
# rollback para a imagem anterior (update_config.failure_action no stack.yml).
set -e

cd /app/backend
DB="${DB_PATH:-/data/mutti.db}"

if [ -z "${JWT_SECRET:-}" ]; then
  echo "❌ JWT_SECRET não definido. Preencha em /opt/apps/gestaomutti/.env.production e redeploye." >&2
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "==> Banco não existe em $DB — criando com os dados de demonstração (setup.js)."
  echo "    ⚠️  Os usuários de demonstração têm senha conhecida (README). Troque-as no"
  echo "    primeiro acesso, ou substitua o arquivo pelo banco real (docs/deploy-vps.md)."
  node src/db/setup.js
fi

echo "==> Migrações"
node src/db/migrar.js

echo "==> Servidor"
exec node src/server.js
