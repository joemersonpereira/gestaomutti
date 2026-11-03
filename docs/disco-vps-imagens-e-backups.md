# Disco da VPS — imagens antigas e backups em dobro

Plano de ação depois do alerta do Uptime Kuma de **disco em 85%** na VPS `NexiiAgency`,
em 2026-11-03. Os números abaixo foram medidos nesse dia. O runbook geral do deploy é o
[`deploy-vps.md`](deploy-vps.md); este documento trata só do disco.

> **Situação em 2026-11-03 (fim do dia):** itens 1, 2, 3a, 3b e 3d **aplicados e
> conferidos** (commit `5c68b09`). Disco **85% → 77%** (7,5G livres). **Em aberto:**
> backup fora da VPS (depende do Joe) e o item 3c (opcional, não aplicado). Detalhes no
> [Checklist](#checklist).

## O diagnóstico em uma tabela

| | Antes do gestaomutti (até 15/10) | Hoje (03/11) |
|---|---|---|
| Disco `/` (32G) | 22G — 67 a 70% | **27G — 85%** (5,1G livres) |
| Imagens `gestaomutti:sha-*` na VPS | — | **86 tags** (1 em uso) |
| Backups no volume `gestaomutti_backups` | — | 21 arquivos, **1,55G** (e subindo até 30) |
| Backups em `/opt/apps/gestaomutti/backups` | — | 14 arquivos, **1,4G** |

Duas causas, as duas deste projeto:

1. **Cada push em `main` deixa uma imagem de ~435MB na VPS e nada a remove.** O deploy usa a
   tag imutável `sha-<commit>` e nunca apaga as anteriores. As camadas de base são
   compartilhadas, então o custo real é ~10–15MB por tag, mas 86 tags já somam 1,2–1,6G.
   A limpeza automática da VPS (`/opt/apps/docker-cleanup-safe-new.sh`, cron de quarta e
   domingo) tem um passo para isso que **nunca funcionou**: ele filtra por
   `label=org.opencontainers.image.source`, e estas imagens não têm label nenhum. O log
   dela registra `Total reclaimed space: 0B` em todas as execuções.
2. **O backup é gravado duas vezes, com retenções longas, e o banco cresceu.** O SQLite foi
   de 3MB para **98MB** em 21/10. O `backup.js` guarda **30** cópias no volume, e o
   `gestaomutti-backup.sh` guarda mais **14** fora do Docker. Quando o volume chegar a 30,
   são 44 × 98MB ≈ **4,3G** só de backup. São mais ~900MB nos próximos 9 dias, e o disco
   passa de 88%.

Ganho esperado com os itens abaixo: **~1,2–1,6G** já com o item 2 e **~2,3G** quando os
backups se estabilizarem (21 cópias no lugar de 44), além de o disco parar de crescer a
cada deploy.

---

## Item 1 — o deploy poda as imagens antigas desta app

**Arquivo:** `.github/workflows/deploy.yml`, no `script:` do passo **Deploy via SSH**.

Cole o bloco **logo depois** de `echo " ✅ Deploy concluído"`. Como o script sai com
`exit 1` em qualquer falha anterior, a poda só roda depois de um deploy que convergiu e
respondeu o health. Isso garante que nunca se apaga a imagem que permitiria voltar de
um deploy quebrado.

```bash
            # ── Poda das imagens antigas DESTA app (só depois de um deploy OK) ──
            # Mantém as $MANTER tags sha-* mais recentes + a imagem deste deploy +
            # a do PreviousSpec (é ela que `docker service rollback` usa).
            # Nunca derruba o deploy: qualquer erro aqui é ignorado.
            echo ""
            echo "==> Podando imagens antigas de ${IMAGE%%:*}..."
            (
              set +e
              REPO="${IMAGE%%:*}"
              MANTER=5
              PRESERVAR=$( {
                  echo "$IMAGE"
                  docker service inspect "$SERVICE_NAME" \
                    --format '{{.PreviousSpec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null
                  docker ps --format '{{.Image}}'
                } | sed 's/@.*//' | sort -u )
              docker images "$REPO" --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
                | grep ':sha-' | sort -r | tail -n +$((MANTER + 1)) | cut -d'|' -f2 \
                | while read -r IMG; do
                    echo "$PRESERVAR" | grep -qxF "$IMG" && continue
                    docker rmi "$IMG" >/dev/null 2>&1 && echo "  removida $IMG"
                  done
            ) || true
```

Por que é seguro:

- O escopo é só `ghcr.io/joemersonpereira/gestaomutti`. As imagens das outras apps da VPS
  ficam fora dele.
- O `sed 's/@.*//'` existe porque o Swarm pode registrar a imagem como
  `tag@sha256:…` (é assim no `PreviousSpec`). Sem ele, a comparação nunca casaria.
- `docker rmi` **sem `-f`** se recusa a apagar uma imagem que um container usa. Isso é
  uma segunda trava, além da lista `PRESERVAR`.
- Uma tag apagada continua no GHCR. Para voltar a qualquer commit antigo, basta
  `docker pull` dela.
- O usuário `deploy` já está no grupo `docker` (conferido em 2026-11-03), então o passo
  não precisa de `sudo`.

**Feito quando:** o próximo push em `main` mostrar `==> Podando imagens antigas…` no log
do Actions e, na VPS, `docker images ghcr.io/joemersonpereira/gestaomutti | wc -l`
devolver no máximo 7 (cabeçalho + 5 + em uso/anterior).

---

## Item 2 — limpeza única agora (opcional: o cron faz isso em 04/11 às 03:00)

Na VPS, como `root` ou `deploy`. O critério é o mesmo do item 1. Rode primeiro em
**simulação** (`SIMULAR=1`, que só lista) e depois de verdade (`SIMULAR=0`):

```bash
SIMULAR=1          # 1 = só lista; troque para 0 para apagar
REPO=ghcr.io/joemersonpereira/gestaomutti
MANTER=5
PRESERVAR=$( {
    docker service inspect gestaomutti_web --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
    docker service inspect gestaomutti_web --format '{{.PreviousSpec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null
    docker ps --format '{{.Image}}'
  } | sed 's/@.*//' | sort -u )
df -h / | tail -1
docker images "$REPO" --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
  | grep ':sha-' | sort -r | tail -n +$((MANTER + 1)) | cut -d'|' -f2 \
  | while read -r IMG; do
      echo "$PRESERVAR" | grep -qxF "$IMG" && { echo "  preservada $IMG"; continue; }
      if [ "$SIMULAR" = 1 ]; then echo "  apagaria $IMG"
      else docker rmi "$IMG" >/dev/null 2>&1 && echo "  removida $IMG"; fi
    done
df -h / | tail -1
```

**Feito quando:** a VPS ficar abaixo de ~81% (`df -h /`).

---

## Item 3 — retenção dos backups

Hoje há duas cópias de cada dia, as duas no **mesmo disco**. O volume protege contra um
`rm -rf /opt/apps` acidental, e a pasta de fora protege contra um `docker volume rm`.
Manter as duas faz sentido, mas não com 30 + 14 cópias de 98MB.

**Sugestão:** **7 no volume + 14 fora** = 21 × 98MB ≈ 2G (no lugar de 4,3G). A decisão é do
Joe. Os dois números ficam configuráveis.

### 3a. `backend/src/db/backup.js` — retenção por variável de ambiente

O `30` está fixo no código. Torne-o configurável e **mantenha 30 como padrão**, porque o
mesmo `backup.js` roda nas instalações Windows (`.bat`), onde a retenção não deve mudar:

```js
// no topo, junto das outras constantes
const MANTER = Math.max(1, parseInt(process.env.BACKUP_MANTER, 10) || 30);
```

```js
// na limpeza, no lugar de files.slice(30)
files.slice(MANTER).forEach(x => { try { fs.unlinkSync(path.join(backupDir, x.f)); } catch (e) { /* */ } });
```

Atualize também o comentário da linha 2 (`mantém os 30 mais recentes`) para
`mantém os BACKUP_MANTER mais recentes (padrão 30)`.

### 3b. `.env.production` na VPS

Acrescente `BACKUP_MANTER=7` em `/opt/apps/gestaomutti/.env.production`. O `stack.yml`
carrega esse arquivo via `env_file` **na hora do `stack deploy`**, então o valor só vale a
partir do deploy que levar o 3a. Lembre-se de fazer o `.bak` do arquivo, como nas outras
vezes.

Não é preciso apagar nada à mão. No backup seguinte (03:20), o próprio `backup.js` corta
o volume para 7. Para cortar na hora, rode o script do cron manualmente:
`/opt/apps/gestaomutti/cron/gestaomutti-backup.sh; echo "saida=$?"`.

### 3c. Cópia de fora do Docker (opcional)

`infra/vps-cron/gestaomutti-backup.sh` já aceita `GUARDAR` por variável (padrão 14). Para
mudar, altere o padrão no script e reinstale com o `install` do §5 do `deploy-vps.md`.
Medido em 03/11: `gzip -1` reduz o arquivo de 98MB para **57MB** (−42%). Compactar a
cópia de fora economizaria mais ~0,6G com 14 cópias, mas a restauração ganharia um
passo (`gunzip`). Só vale se o espaço continuar apertado depois dos itens 1–3b.

### 3d. Atualizar o runbook

No §5 do [`deploy-vps.md`](deploy-vps.md), troque "30 cópias no volume" por
"`BACKUP_MANTER` cópias no volume (7 na VPS, padrão 30)". Aproveite para corrigir a nota
sobre o tamanho do banco: ele tem 98MB desde 21/10, não 1MB.

---

## ⚠️ Achado à parte: não existe backup fora da VPS

Os dois destinos ficam no mesmo disco `/dev/vda1`. Se a VPS ou o disco se perderem, todo
o histórico vai junto. O envio por e-mail do `backup.js` não cobre esse risco:
`BACKUP_EMAIL_TO`/`SMTP_HOST` não estão configurados no `.env.production`, e o código pula
anexos acima de 24MB de qualquer forma (o banco tem 98MB). Esse risco não tem relação com
o disco cheio, mas apareceu na mesma análise. Vale combinar com o Joe um destino externo,
por exemplo o MinIO da própria Nexii (que fica na mesma máquina, então só ajuda contra
volume apagado) ou, de verdade, um bucket S3/R2 ou um Google Drive.

---

## Fora deste repositório — limpeza geral da VPS ✅ corrigida em 2026-11-03

O passo de imagens do `/opt/apps/docker-cleanup-safe-new.sh` (cron de quarta e domingo,
03:00) foi reescrito com o mesmo critério do item 1, para **todas** as apps: por
repositório `ghcr.io/*`, mantém as 5 tags `sha-*` mais recentes, além da imagem de cada
serviço (Spec), da imagem do rollback (PreviousSpec) e da de qualquer container. A
versão anterior ficou em `/opt/apps/docker-cleanup-safe-new.sh.bak-2026-11-03`.

Simulação feita antes da troca: o gestaomutti é o único repositório com tags `sha-*`
na VPS. A nova regra apagaria 84 das 89 tags e manteria as 5 mais recentes, que já
incluem a imagem em uso e a do rollback. **Por isso o item 2 acontece sozinho na
próxima execução do cron** (quarta, 04/11, 03:00), se ninguém o rodar antes. O item 1
continua valendo: sem ele, as imagens voltam a se acumular entre uma execução do cron
e a seguinte (já houve 27 deploys num único dia).

---

## Checklist

- [x] Item 1 — bloco de poda no `deploy.yml` (commit `5c68b09`). Conferido no log do
      Actions (run 41691514315): `==> Podando imagens antigas…` removeu `sha-444c0b6`
- [x] Item 2 — limpeza única na VPS em 03/11: 84 tags removidas, ficaram 5 (em uso
      `ed2d91a` e rollback `c97a457` entre elas). Disco **85% → 79%** (5,1G → 6,7G livres)
- [x] Item 3a — `BACKUP_MANTER` no `backup.js` (padrão 30), testado numa cópia isolada
      (3 → mantém 3; ausente ou inválido → 30)
- [x] Item 3b — `BACKUP_MANTER=7` no `.env.production` (03/11, `.bak-2026-11-03` ao lado);
      valendo desde o deploy do `5c68b09` (`printenv BACKUP_MANTER` no container = 7).
      Backup manual rodou com `saida=0` e cortou o volume de 20 para 7 cópias
- [ ] Item 3c — (opcional) `GUARDAR`/gzip na cópia de fora — **não aplicado**: com o
      disco em 79% e o volume caindo para 7, não é preciso por ora
- [x] Item 3d — runbook `deploy-vps.md` §5 atualizado (e o comentário do
      `infra/vps-cron/gestaomutti-backup.sh`, que também dizia "30")
- [ ] **Em aberto** — combinar com o Joe o backup fora da VPS (ver o achado acima).
      Até lá, as 7 + 14 cópias continuam no mesmo disco
- [x] Conferência final (03/11, 15:14): `df -h /` = **77%** (24G usados, 7,5G livres);
      `docker images ghcr.io/joemersonpereira/gestaomutti | wc -l` = **6** (cabeçalho + 5);
      volume `gestaomutti_backups` = **7** cópias `mutti-*.db`; fora do Docker = **14**
