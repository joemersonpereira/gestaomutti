# Deploy na Render — guia (sem zerar o banco)

## O que foi corrigido
1. **`setup.js` protegido** — não apaga mais um banco que já existe. Na 1ª vez ele cria;
   nos deploys seguintes ele **pula** (só as migrações rodam, idempotentes). Para resetar
   de propósito: `SETUP_FORCE=1 node src/db/setup.js`.
2. **`render.yaml` corrigido**:
   - caminho das pastas (era `mutti-sistema-12-modulos/...`, que não existe; agora `frontend/` e `backend/`);
   - **disco persistente** (`/data`) e `DB_PATH=/data/mutti.db` → o banco sobrevive aos deploys.

## Por que o free da Render perde o banco
O SQLite é um **arquivo**. No plano **free** não há disco persistente: a cada deploy/restart o
disco é recriado vazio e o arquivo some. Para manter os dados é preciso **plano pago + disco**
(o `render.yaml` já tem o bloco `disk:`; por isso `plan: starter`). Alternativa de longo prazo:
migrar o app para Postgres (plano v2.0).

## Passo a passo
1. Faça commit/push do repositório (com este `render.yaml` na raiz).
2. Render → **New → Blueprint** → selecione o repositório. Ela lê o `render.yaml` e cria o serviço
   com o disco.
3. Em **Environment**, configure as variáveis que o app usa (não ficam no `render.yaml` por
   segurança):
   - `ANTHROPIC_API_KEY` (Rhia + OCR das NFs/Tesouraria);
   - conexão **READ-ONLY** ao ERP A7 (as mesmas do `.env` local: host/porta/usuário
     `leitura_inteligente`/senha/base) — sem isso, as telas que leem o ERP ficam vazias;
   - e-mail (IMAP/SMTP), tokens de integração, etc., conforme o `.env` local.
4. Primeiro deploy: cria o banco com os **dados-semente** (usuário admin padrão etc.).

## Subir os SEUS dados (em vez da semente)
Seu banco real está em `backend/db/mutti.db` (local). Para levar os dados já cadastrados
(colaboradores, configs da Tesouraria, fornecedores marcados, planos sem NF, feriados, etc.):
1. Garanta que no servidor NÃO há um `mutti.db` ainda (1º deploy) **ou** pare o serviço.
2. Copie o seu `backend/db/mutti.db` para `/data/mutti.db` no disco da Render
   (via Render Shell: `scp`/upload, ou um job único de cópia).
3. Reinicie o serviço. Como o `DB_PATH=/data/mutti.db`, ele passa a usar o seu banco.
   Os deploys seguintes **preservam** esse arquivo (setup protegido + disco persistente).

## Checagem rápida pós-deploy
- Abrir a URL → tela de login. Entrar com um usuário válido.
- Conferir que os dados aparecem (se vazio, provavelmente faltou subir o `mutti.db` ou configurar o ERP).
- Um 2º deploy **não** pode zerar nada (é o teste final de que a proteção está valendo).
