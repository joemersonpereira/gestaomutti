// Resumo da conciliação de cartões lendo o sistema EM PRODUÇÃO (não o banco local).
//
// O robô roda numa máquina e manda os arquivos para pulsyapp.com.br. Então quem quiser saber o
// que não fechou tem que perguntar para lá — olhar o SQLite local mostraria dados velhos e daria
// a falsa impressão de que está tudo certo.
//
// Uso:
//   node scripts/resumo-conciliacao.js                 → últimos 7 dias
//   node scripts/resumo-conciliacao.js 2026-08-01 2026-08-31
//
// Credenciais: as mesmas do coletor (usuário do SISTEMA, perfil Tesouraria), lidas de
// coletor/.env ou das variáveis de ambiente COLETOR_EMAIL / COLETOR_SENHA / COLETOR_API.
const path = require('path');
const fs = require('fs');

// lê o .env do coletor sem depender do dotenv estar instalado aqui
function envDoColetor() {
  const arq = path.join(__dirname, '..', '..', 'coletor', '.env');
  const out = {};
  if (!fs.existsSync(arq)) return out;
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const iso = d => d.toISOString().slice(0, 10);

(async () => {
  const env = { ...envDoColetor(), ...process.env };
  const API = env.COLETOR_API || 'https://pulsyapp.com.br/api';
  const email = env.COLETOR_EMAIL, senha = env.COLETOR_SENHA;

  if (!email || !senha) {
    console.log('Sem credencial configurada — preencha COLETOR_EMAIL e COLETOR_SENHA em coletor/.env');
    console.log('(usuário do SISTEMA Mutti, perfil Tesouraria — não é senha de operadora)');
    process.exit(0);
  }

  const args = process.argv.slice(2).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const hoje = new Date();
  const seteDias = new Date(hoje); seteDias.setDate(hoje.getDate() - 7);
  const ini = args[0] || iso(seteDias);
  const fim = args[1] || iso(hoje);

  const login = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!login.ok) { console.log('Não consegui entrar no sistema (' + login.status + ').'); process.exit(1); }
  const { token } = await login.json();

  const r = await fetch(`${API}/conciliacao-cartao/repasses?ini=${ini}&fim=${fim}&taxa=1`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { console.log('A API respondeu ' + r.status + ' no confronto de repasses.'); process.exit(1); }
  const c = await r.json();

  const dias = c.dias || [];
  const divergentes = dias.filter(d => Math.abs(d.dif || 0) > 0.02);
  const taxas = (c.resumo && c.resumo.taxas) || [];
  const acima = taxas.filter(t => t.diferencaPontos > 0.05).sort((a, b) => b.custoExtra - a.custoExtra);

  console.log(`=== Conciliação de cartões · ${ini} a ${fim} · ${API} ===\n`);

  console.log(`NÃO FECHOU: ${divergentes.length} de ${dias.length} dia-filial`);
  divergentes.slice(0, 20).forEach(d =>
    console.log(`  ${d.data}  ${(d.loja || '?').padEnd(24)} ${brl(d.depositado).padStart(14)}  diferença ${brl(d.dif)}`));

  console.log(`\nTAXA ACIMA DA CADASTRADA: ${acima.length} · custo extra ${brl(c.resumo && c.resumo.custoExtraTotal)}`);
  acima.slice(0, 12).forEach(t =>
    console.log(`  ${(t.operadora + ' ' + t.bandeira).padEnd(30)} ${String(t.grupo || '').padEnd(10)} ${t.parcelas}x  paga ${t.efetiva}% vs ${t.contratada}%  ${brl(t.custoExtra)}`));

  const semTaxa = taxas.filter(t => t.contratada == null).length;
  if (semTaxa) console.log(`\n  (${semTaxa} combinação(ões) ainda sem taxa cadastrada — o confronto não roda nelas)`);

  console.log(`\nTOTAL DEPOSITADO: ${brl(dias.reduce((s, d) => s + (d.depositado || 0), 0))}`);
})().catch(e => { console.log('Erro: ' + e.message); process.exit(1); });
