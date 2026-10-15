#!/usr/bin/env node
/**
 * sped-watch.js — VIGIA DE PASTA do SPED.
 *
 * Roda na máquina onde o Alpha 7 salva os arquivos de SPED (Fiscal → Exportação Arquivo →
 * SPED Fiscal / SPED Contribuições). Quando um .txt novo aparece na pasta, ele lê, descobre
 * sozinho a competência/tipo/loja (pelo registro 0000) e SOBE pro repositório da Contabilidade
 * do Pulsy — ninguém precisa enviar nada à mão.
 *
 * É um agente LOCAL (como o coletor de cartões): NÃO entra no deploy do backend.
 *
 * Config por variáveis de ambiente (ou .env ao lado):
 *   SPED_WATCH_DIR   pasta que o Alpha usa para salvar o SPED (ex.: C:\Alterdata\SPED)
 *   SPED_API_URL     base da API do Pulsy (ex.: http://localhost:3001/api  ou a URL de produção)
 *   SPED_USER        e-mail de um usuário do sistema com perfil Financeiro/Controladoria/Direção
 *   SPED_PASS        senha desse usuário
 *   SPED_POLL_MS     intervalo de varredura em ms (padrão 15000)
 *
 * Uso:  node scripts/sped-watch.js
 */
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

const DIR = process.env.SPED_WATCH_DIR;
const API = (process.env.SPED_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const USER = process.env.SPED_USER;
const PASS = process.env.SPED_PASS;
const POLL = Number(process.env.SPED_POLL_MS) || 15000;

if (!DIR || !USER || !PASS) {
  console.error('Faltou configurar SPED_WATCH_DIR, SPED_USER e SPED_PASS (env ou scripts/.env).');
  process.exit(1);
}
const ENVIADOS = path.join(DIR, '_enviados'); // arquivos já subidos vão pra cá (não reprocessa)
fs.mkdirSync(ENVIADOS, { recursive: true });

let token = null;
async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER, senha: PASS }),
  });
  if (!r.ok) throw new Error(`login falhou (${r.status})`);
  const j = await r.json();
  token = j.token || j.accessToken;
  if (!token) throw new Error('login sem token na resposta');
  console.log(`[sped-watch] logado como ${USER}`);
}

async function enviar(arquivo) {
  const full = path.join(DIR, arquivo);
  const buf = fs.readFileSync(full);
  const resp = await fetch(`${API}/contabilidade/sped/ingerir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ conteudo: buf.toString('base64'), nome: arquivo, fonte: 'pasta' }),
  });
  if (resp.status === 401) { token = null; throw new Error('token expirou'); }
  const j = await resp.json().catch(() => ({}));
  if (resp.ok) {
    const tag = j.duplicado ? 'já existia' : `OK (${j.tipo || '?'} ${j.competencia || '?'}${j.loja ? ' · ' + j.loja : ''})`;
    console.log(`[sped-watch] ${arquivo} → ${tag}`);
    // move pra _enviados pra não reprocessar
    fs.renameSync(full, path.join(ENVIADOS, Date.now() + '_' + arquivo));
    return true;
  }
  console.error(`[sped-watch] ${arquivo} → erro: ${j.erro || resp.status}`);
  return false;
}

async function varrer() {
  let arquivos;
  try { arquivos = fs.readdirSync(DIR).filter(f => /\.txt$/i.test(f) && fs.statSync(path.join(DIR, f)).isFile()); }
  catch (e) { console.error('[sped-watch] não consegui ler a pasta:', e.message); return; }
  for (const a of arquivos) {
    try { if (!token) await login(); await enviar(a); }
    catch (e) { console.error(`[sped-watch] ${a}:`, e.message); }
  }
}

(async () => {
  console.log(`[sped-watch] vigiando ${DIR} a cada ${POLL / 1000}s → ${API}`);
  await varrer();
  setInterval(varrer, POLL);
})();
