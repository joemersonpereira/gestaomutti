// 188_previsao_dre_2025.js — importa a "Analise Despesas.xlsx" (DRE/DFC gerencial do GRUPO, 2025, mês a mês:
// receitas por forma + despesas por grupo) p/ virar a PREVISÃO do fluxo de caixa 2026 (deslocada 1 ano).
// Consolidado do grupo — NÃO inclui a Farma Rocha (ela fica 0 na previsão).
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS previsao_dre (
  empresa_id TEXT NOT NULL, tipo TEXT NOT NULL, chave TEXT NOT NULL, mes INTEGER NOT NULL, valor REAL,
  PRIMARY KEY (empresa_id, tipo, chave, mes)
)`);

const norm = s => String(s || '')
  .replace(/^\s*[\d.]+\s*-\s*/, '')            // tira "2.03 - "
  .replace(/\(\s*[-+]\s*\)\s*$/, '')            // tira "(-)"/"(+)" no fim
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();
const num = s => { const c = String(s == null ? '' : s).replace(/[R$\s]/g, '').replace(/,/g, ''); const v = parseFloat(c); return isFinite(v) ? Math.round(v) : 0; };

// Receita: mapeia a linha (filho) da planilha -> forma usada no fluxo
const RECEITA_FORMA = [
  [/cart/i, 'CARTAO'], [/pix/i, 'PIX'], [/venda a vista/i, 'DINHEIRO'],
  [/popular|pbm/i, 'PBM'], [/conv[eê]nio/i, 'CONVENIO'],
];

try {
  const XLSX = require('xlsx');
  const ARQ = process.env.PREVISAO_DRE_XLSX ||
    'C:/Users/joeme/OneDrive/1 - Adm e Financeiro/Relatorio Mensal/Analise Mutti 2025/Analise Despesas.xlsx';
  const wb = XLSX.readFile(ARQ, { cellDates: true });
  const ws = wb.Sheets['exported_table'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const empresas = db.prepare('SELECT id FROM empresas').all();
  const ins = db.prepare('INSERT OR REPLACE INTO previsao_dre (empresa_id,tipo,chave,mes,valor) VALUES (?,?,?,?,?)');

  // acumula em memória: acc[tipo][chave][mes] = valor
  const acc = { receita: {}, despesa: {} };
  const add = (tipo, chave, arr) => {
    acc[tipo][chave] = acc[tipo][chave] || Array(13).fill(0);
    for (let m = 1; m <= 12; m++) acc[tipo][chave][m] += arr[m] || 0;
  };
  // detecta seção (receita antes de "DESPESAS COM PESSOAL")
  let secao = 'receita';
  for (const r of rows) {
    const lab = String(r[0] || '').trim(); if (!lab) continue;
    const up = lab === lab.toUpperCase();
    const meses = Array(13).fill(0); for (let m = 1; m <= 12; m++) meses[m] = num(r[m]);
    const nk = norm(lab);
    if (nk === 'DESPESAS COM PESSOAL') secao = 'despesa';
    if (nk === 'RESULTADO 1' || nk === 'DESPESAS' && up) secao = 'fim';

    // DESPESA: cabeçalho de grupo (MAIÚSCULO terminando em "(-)")
    if (secao !== 'receita' && up && /\(\s*-\s*\)\s*$/.test(lab)) {
      if (['DESPESAS'].includes(nk)) continue;      // linha de total
      add('despesa', nk, meses);
      continue;
    }
    // RECEITA: linhas-filhas de forma de pagamento (na seção receita)
    if (secao === 'receita' && !up) {
      const map = RECEITA_FORMA.find(([re]) => re.test(lab));
      if (map) add('receita', map[1], meses);
    }
    // total receita operacional (guardo como OPERACIONAL)
    if (nk === 'RECEITA OPERACIONAL') add('receita', 'OPERACIONAL', meses);
  }

  let n = 0;
  for (const e of empresas) {
    for (const tipo of ['receita', 'despesa']) {
      for (const chave of Object.keys(acc[tipo])) {
        for (let m = 1; m <= 12; m++) { ins.run(e.id, tipo, chave, m, acc[tipo][chave][m]); n++; }
      }
    }
  }
  // resumo p/ conferência
  const somaAno = o => Object.fromEntries(Object.entries(o).map(([k, a]) => [k, a.reduce((x, v) => x + v, 0)]));
  console.log(`✅ migration 188: previsao_dre importada (${n} registros)`);
  console.log('   RECEITAS (total ano):', JSON.stringify(somaAno(acc.receita)));
  console.log('   DESPESAS (total ano):');
  for (const [k, a] of Object.entries(acc.despesa)) console.log('     -', k, 'R$', a.reduce((x, v) => x + v, 0).toLocaleString('pt-BR'));
} catch (e) {
  console.log('⚠️ migration 188: tabela criada, mas não importei o xlsx —', e.message);
}
