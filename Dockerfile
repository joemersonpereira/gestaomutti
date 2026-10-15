# Sistema de Gestão — Grupo Mutti. Imagem única: o backend Express serve a API e o
# build do React na mesma porta (3001). Contexto de build = raiz do repositório.
#
# O banco (SQLite) NÃO fica na imagem: vive no volume montado em /data pelo stack.yml.
# O container é descartável; o que importa está no volume.

# ─── 1. Build do frontend (Create React App) ─────────────────────────────────
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend

# CI=true faz o react-scripts tratar warning de lint como erro de build.
ENV CI=false

# package.json antes do código: enquanto nenhuma dependência muda, o Docker
# reaproveita a camada do npm ci e o build inteiro leva segundos.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ─── 2. Dependências do backend ──────────────────────────────────────────────
# better-sqlite3 é módulo nativo. Para Node 22 em linux/x64 existe binário pronto
# (baixado no npm ci); a toolchain abaixo é a rede de segurança caso o download
# falhe e ele precise compilar. Fica só neste estágio — não entra na imagem final.
FROM node:22-bookworm-slim AS backend-deps
WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ─── 3. Runner ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3001
# O Node resolve o fuso pela ICU embutida, sem precisar do pacote tzdata.
ENV TZ=America/Sao_Paulo
# Caminho DENTRO do container. /data é o volume `db` do stack.yml.
ENV DB_PATH=/data/mutti.db

WORKDIR /app/backend

# `--chown` em cada COPY, e não um `chown -R` no fim: o -R reescreveria os
# node_modules inteiros numa camada nova (dobra o tamanho da imagem).
COPY --chown=node:node --from=backend-deps /build/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./package.json
COPY --chown=node:node backend/src ./src

# server.js procura o build em ../../frontend/build a partir de src/.
COPY --chown=node:node --from=frontend /build/frontend/build /app/frontend/build

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# /data (banco) e backups (destino do backup.js) precisam existir e pertencer ao
# `node` ANTES de o volume ser montado — senão o Docker cria o volume como root
# e a aplicação não consegue escrever.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data /app/backend/backups \
 && chown node:node /data /app/backend/backups

USER node
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
