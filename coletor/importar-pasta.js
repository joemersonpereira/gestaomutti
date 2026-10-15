// importar-pasta.js — você baixa o relatório do portal do jeito de sempre, joga o arquivo numa
// pasta, e o sistema importa e confronta sozinho. Sem robô, sem sessão, sem login automatizado.
//
// Vários portais detectam automação (o Le Card tem Cloudflare, por exemplo) e não vale a pena
// insistir: o download continua manual, mas TODO o resto — leitura, rateio por filial, confronto
// com o ERP, conferência da taxa e o BI — continua automático. É onde estava o trabalho pesado.
//
// Como usar:
//   1. baixe o relatório no portal
//   2. arraste para  coletor\entrada\vendas\   ou   coletor\entrada\repasse\
//   3. pronto — na próxima rodada (10:00) ele entra no sistema
//
//   Para rodar na hora:  npm run importar
//
// Arquivo que não traz a loja dentro dele (Le Card, Nutricash, Mulvi): ou você põe o id da loja
// no nome (ex.: "lecard-agosto@loja-esplanada.pdf"), ou vale o COLETOR_LOJA_<OPERADORA> do .env.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DIR = path.join(__dirname, 'entrada');
const PASTAS = { vendas: path.join(DIR, 'vendas'), repasse: path.join(DIR, 'repasse') };
const FEITOS = path.join(DIR, 'importados');
const ERROS = path.join(DIR, 'com-erro');
const DIR_LOGS = path.join(__dirname, 'logs');

const CFG = {
  api: process.env.COLETOR_API || 'http://localhost:3001/api',
  email: process.env.COLETOR_EMAIL,
  senha: process.env.COLETOR_SENHA,
};

const linhas = [];
const log = (...a) => { const l = `[${new Date().toISOString().slice(0, 19)}] ` + a.join(' '); console.log(l); linhas.push(l); };
const EXT_OK = ['.xlsx', '.xls', '.csv', '.pdf'];

async function token() {
  if (!CFG.email || !CFG.senha) throw new Error('Preencha COLETOR_EMAIL e COLETOR_SENHA no .env');
  const r = await axios.post(CFG.api + '/auth/login', { email: CFG.email, senha: CFG.senha });
  return r.data.token;
}

// "relatorio-agosto@loja-esplanada.pdf" → loja-esplanada
const lojaDoNome = nome => (/@(loja-[a-z0-9]+)/i.exec(nome) || [])[1] || null;

async function enviar(tk, arquivo, destino, lojaId) {
  const rota = destino === 'repasse' ? '/conciliacao-cartao/repasses/importar' : '/conciliacao-cartao/importar';
  const r = await axios.post(CFG.api + rota,
    { conteudo: fs.readFileSync(arquivo).toString('base64'), nome: path.basename(arquivo), loja: lojaId || null },
    { headers: { Authorization: 'Bearer ' + tk }, maxBodyLength: Infinity, maxContentLength: Infinity });
  return r.data;
}

function mover(arquivo, destinoDir) {
  fs.mkdirSync(destinoDir, { recursive: true });
  const base = path.basename(arquivo);
  let alvo = path.join(destinoDir, base);
  if (fs.existsSync(alvo)) {                       // já veio um com esse nome: carimba a hora
    const ext = path.extname(base);
    alvo = path.join(destinoDir, path.basename(base, ext) + '-' + Date.now() + ext);
  }
  fs.renameSync(arquivo, alvo);
  return alvo;
}

(async () => {
  for (const p of [PASTAS.vendas, PASTAS.repasse, FEITOS, ERROS]) fs.mkdirSync(p, { recursive: true });

  const fila = [];
  for (const [destino, pasta] of Object.entries(PASTAS)) {
    for (const f of fs.readdirSync(pasta)) {
      if (EXT_OK.includes(path.extname(f).toLowerCase())) fila.push({ destino, arquivo: path.join(pasta, f) });
    }
  }

  if (!fila.length) {
    log('Nenhum arquivo novo em entrada\\vendas ou entrada\\repasse.');
    process.exit(0);
  }

  log(`=== Importando ${fila.length} arquivo(s) da pasta de entrada ===`);
  let tk;
  try { tk = await token(); }
  catch (e) { log('✗ Não consegui entrar no sistema: ' + e.message); process.exit(1); }

  let ok = 0, falhou = 0;
  for (const { destino, arquivo } of fila) {
    const nome = path.basename(arquivo);
    try {
      let r = await enviar(tk, arquivo, destino, lojaDoNome(nome));

      // arquivo sem CNPJ dentro e sem loja no nome: tenta a loja padrão daquela operadora
      if (r && r.ok === false && /identificar a loja/i.test(r.erro || '')) {
        const op = (r.operadora || '').toUpperCase().replace(/[^A-Z]/g, '');
        const padrao = process.env['COLETOR_LOJA_' + op] || process.env.COLETOR_LOJA_PADRAO;
        if (padrao) { log(`  ${nome}: sem loja no arquivo — usando ${padrao}`); r = await enviar(tk, arquivo, destino, padrao); }
      }

      if (r && r.ok === false) {
        log(`  ✗ ${nome}: ${r.erro}`);
        mover(arquivo, ERROS); falhou++; continue;
      }

      const resumo = destino === 'repasse'
        ? `${r.qtdParcelas || 0} parcelas · ${r.qtdDepositos || 0} crédito(s) · R$ ${r.valorTotal || 0}`
        : `${r.linhas || 0} transações · ${(r.resumo && r.resumo.divergencias) || 0} divergência(s)`;
      log(`  ✓ ${nome}  [${r.operadora || destino}]  ${resumo}`);
      (r.avisos || []).forEach(a => log(`      ⚠ ${a}`));
      mover(arquivo, FEITOS); ok++;
    } catch (e) {
      const msg = (e.response && e.response.data && e.response.data.erro) || e.message;
      log(`  ✗ ${nome}: ${msg}`);
      mover(arquivo, ERROS); falhou++;
    }
  }

  log(`--- ${ok} importado(s), ${falhou} com erro ---`);
  if (falhou) log(`Os que falharam ficaram em entrada\\com-erro para você conferir.`);
  fs.mkdirSync(DIR_LOGS, { recursive: true });
  fs.appendFileSync(path.join(DIR_LOGS, 'importar-pasta.log'), linhas.join('\n') + '\n');
  process.exit(0);
})();
