# Deploy na VPS (NexiiAgency) — runbook

Endereço oficial: **https://gestao.farmaciasmutti.com.br** (o `www` redireciona para ele).

| O quê | Onde |
|---|---|
| VPS | `NexiiAgency` (Ubuntu 20.04, Docker Swarm de um nó, Traefik v3.4, rede `NexiiNet`) |
| Pasta da aplicação | `/opt/apps/gestaomutti/` (dono `deploy`, 700) |
| Segredos | `/opt/apps/gestaomutti/.env.production` (600, dono `deploy`) — **só lá** |
| Stack | `/opt/apps/gestaomutti/stack.yml` (cópia do `stack.yml` do repo; o CI envia a cada deploy) |
| Imagem | `ghcr.io/joemersonpereira/gestaomutti:sha-<commit>` (e `:latest`) |
| Banco | volume Docker `gestaomutti_db`, montado em `/data` (arquivo `/data/mutti.db`) |
| Backups | volume `gestaomutti_backups` + cópia fora do Docker em `/opt/apps/gestaomutti/backups/` |
| Service | `gestaomutti_web`, porta interna 3001, 1 réplica, no manager |
| Deploy | push em `main` → `.github/workflows/deploy.yml` (build → GHCR → SSH como `deploy` → `docker stack deploy`) |

O container é **descartável**: código + build do React. Tudo que importa está no volume
`gestaomutti_db`. Deploy, rollback e `stack rm` não tocam nele.

---

## 1. Primeira publicação (o que já está feito e o que falta)

Feito em 2026-10-15:

- `/opt/apps/gestaomutti/` criada, dona `deploy`, com `stack.yml` e `.env.production`
  (gerado do `.env.production.example`, com `JWT_SECRET` já preenchido; o resto vazio).
- Chave SSH de CI `github-actions-gestaomutti` cadastrada no `authorized_keys` do `deploy`.
- Workflow, Dockerfile, entrypoint e stack no repositório.

Falta, nesta ordem:

1. **Secrets no GitHub** (`Settings → Secrets and variables → Actions`), valores no
   `.env.local` da máquina de desenvolvimento (arquivo não versionado):
   `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (obrigatórios); `GHCR_USER`, `GHCR_TOKEN`
   (opcionais — sem eles o deploy usa o login GHCR que o `deploy` já tem na VPS).
2. **Credenciais no `.env.production`** da VPS: ERP, Trivio, e-mail, Anthropic etc.
   Editar como `deploy` (`nano /opt/apps/gestaomutti/.env.production`). Tudo que
   ficar vazio fica desligado; o sistema sobe mesmo assim.
3. **Firewall do ERP**: liberar o IP da VPS (`170.205.37.202`) no Postgres do A7.
4. **DNS** em `farmaciasmutti.com.br`: `gestao` e `www.gestao` → `A 170.205.37.202`.
5. **Push em `main`** (ou *Run workflow* no Actions) → primeiro deploy.
6. Se o deploy aconteceu **antes** do DNS: ver §4 (forçar o certificado).
7. **Banco real**: ver §3. Até lá o sistema sobe com os dados de demonstração e as
   senhas do README — **troque-as ou importe o banco antes de divulgar o endereço.**

---

## 2. Deploy no dia a dia

- `git push origin main` → o Actions builda, publica a imagem e aplica a stack.
  O job só fica verde se a task **da imagem nova** estiver `Running` e
  `/api/health` responder 200 de dentro do container.
- Há ~20–30 s fora do ar por deploy (`stop-first`, obrigatório com SQLite).
- Mudança só em `stack.yml` (label do Traefik) também exige deploy: o CI envia o
  arquivo e roda `docker stack deploy`, então um push basta.

Deploy manual (como `deploy`, na VPS):

```bash
cd /opt/apps/gestaomutti
export IMAGE=ghcr.io/joemersonpereira/gestaomutti:sha-<commit completo>
docker stack deploy -c stack.yml --with-registry-auth --prune gestaomutti
docker service ps gestaomutti_web --no-trunc | head
```

Rollback = deploy manual com o `sha-` anterior (`docker service ps` mostra o histórico).

Logs: `docker service logs --tail=100 -f gestaomutti_web`.

---

## 3. Levar o banco real para a VPS

O banco de produção hoje é o `backend/db/mutti.db` da máquina do escritório. Para
levá-lo:

1. Na máquina de origem, com o sistema **parado**, rode `backend/BACKUP-AGORA.bat`
   (gera `backend/backups/mutti-<data>.db` — cópia consistente, sem WAL pendente).
2. Envie o arquivo para a VPS: `scp mutti-<data>.db deploy@170.205.37.202:/tmp/`.
3. Na VPS, pare o serviço, troque o arquivo no volume e suba de novo:

```bash
docker service scale gestaomutti_web=0
docker run --rm -v gestaomutti_db:/data -v /tmp:/tmp alpine sh -c \
  'rm -f /data/mutti.db /data/mutti.db-wal /data/mutti.db-shm && cp /tmp/mutti-<data>.db /data/mutti.db && chown 1000:1000 /data/mutti.db'
docker service scale gestaomutti_web=1
rm /tmp/mutti-<data>.db
```

No boot, o `migrar.js` vê um banco **com dados e sem a tabela `schema_migracoes`** e
faz o *baseline*: marca as 247 migrações como aplicadas sem rodar nenhuma (o banco
de origem já tem tudo). Migração nova que chegar depois roda normalmente.

Se a origem **não** estava com todas as migrações aplicadas, suba uma vez com
`MIGRAR_SEM_BASELINE=1` no `.env.production` (e tire depois). Atenção: 11 migrações
inserem sementes sem `OR IGNORE` e duplicariam linhas num banco já completo — por
isso o baseline é o padrão.

---

## 4. Certificado: se o deploy aconteceu antes do DNS

O Traefik pede o certificado ao Let's Encrypt **uma vez**, quando o router aparece.
Sem DNS apontando para a VPS a emissão falha e **ele não tenta de novo sozinho**
(lição do catalogo-interativo). Sintoma: `TRAEFIK DEFAULT CERT` no navegador.

Depois de o DNS propagar (`getent hosts gestao.farmaciasmutti.com.br` na VPS tem
que devolver `170.205.37.202`), force uma nova tentativa recriando o router:

```bash
cd /opt/apps/gestaomutti
export IMAGE=$(docker service inspect gestaomutti_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' | cut -d@ -f1)
docker stack rm gestaomutti && sleep 15
docker stack deploy -c stack.yml --with-registry-auth --prune gestaomutti
```

Os volumes não são removidos pelo `stack rm`. Em ~1 min:
`curl -I https://gestao.farmaciasmutti.com.br/api/health` deve vir com certificado
válido. Diagnóstico: `TRAEFIK DEFAULT CERT` + **404** no `curl -k` = router não
existe (host fora da regra); + **200** = router ok e ACME falhando → log em
`/var/log/traefik/traefik.log` **dentro** do container do Traefik.

---

## 5. Backup (cron da VPS)

Instalar uma vez, como **root**:

```bash
install -d -o deploy -g deploy /opt/apps/gestaomutti/cron /opt/apps/gestaomutti/backups
install -m 755 infra/vps-cron/gestaomutti-backup.sh /opt/apps/gestaomutti/cron/
crontab -l | cat - infra/vps-cron/crontab.txt | crontab -
/opt/apps/gestaomutti/cron/gestaomutti-backup.sh; echo "saida=$?"   # testa à mão
```

Todo dia às 03:20: `backup.js` dentro do container (backup nativo do SQLite, 30
cópias no volume) + cópia para `/opt/apps/gestaomutti/backups/` (14 cópias, fora
do Docker). Log em `/var/log/gestaomutti-backup.log`. O disco da VPS tinha 11 GB
livres em 2026-10-15 e o banco de demonstração tem 1 MB; vale olhar o tamanho do
banco real antes de aumentar a retenção.

Restaurar = §3 com o arquivo do backup.

---

## 6. O que a VPS NÃO tem (e o que isso muda)

- **`poppler-utils`** não está na imagem → ingestão de PDF na Rhia e leitura de NF
  por `pdftotext` ficam indisponíveis. Para ligar: `apt-get install poppler-utils`
  no estágio *runner* do Dockerfile e `PDFTOTEXT_PATH=/usr/bin/pdftotext`.
- **Tesouraria → "salvar organizado"** grava arquivos numa pasta de rede configurada
  na tela (`despesa_salvar_base`). No container não existe pasta de rede: a função
  devolve `null` e segue, sem salvar. Decisão pendente com o Joe (MinIO ou volume).
- **Coletor de cartões** (`coletor/`) continua na máquina Windows; ele envia para a
  API pela URL pública — ajuste o endereço no `.env` dele quando o DNS estiver no ar.

---

## 7. v2.0 (Postgres) — tabela de controle das migrações

```sql
CREATE TABLE IF NOT EXISTS schema_migracoes (
  nome        text PRIMARY KEY,
  aplicada_em timestamptz NOT NULL DEFAULT now(),
  modo        text NOT NULL DEFAULT 'aplicada'   -- aplicada | baseline
);
```

Mesma semântica do `migrar.js`: um registro por arquivo aplicado; `baseline` marca o
que foi considerado aplicado sem execução no primeiro contato com um banco existente.
