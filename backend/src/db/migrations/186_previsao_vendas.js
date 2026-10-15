// 186_previsao_vendas.js — importa a "Previsão vendas big.xlsx" (vendas semanais da REDE do ano
// anterior: dinheiro+pix+débito+cartão) p/ virar a PREVISÃO de receita no fluxo de caixa (deslocada 1 ano).
const path = require('path');
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS previsao_vendas (
  empresa_id TEXT, semana_ini TEXT, semana_fim TEXT, valor REAL,
  PRIMARY KEY (empresa_id, semana_ini)
)`);

function toISO(d) { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }

try {
  const XLSX = require('xlsx');
  const ARQ = process.env.PREVISAO_VENDAS_XLSX || 'C:/Users/joeme/OneDrive/1 - Adm e Financeiro/Relatorio Mensal/Previsão vendas big.xlsx';
  const empresas = db.prepare('SELECT id FROM empresas').all();
  const wb = XLSX.readFile(ARQ);
  const ws = wb.Sheets['Ciclos Semanais'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const ins = db.prepare('INSERT OR REPLACE INTO previsao_vendas (empresa_id, semana_ini, semana_fim, valor) VALUES (?,?,?,?)');
  let n = 0;
  for (const r of rows) {
    const periodo = String(r[1] || ''); const val = Number(r[2]);
    const mm = periodo.match(/(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!mm || !isFinite(val) || val <= 0) continue;
    const ini = toISO(mm[1]), fim = toISO(mm[2]);
    if (!ini) continue;
    for (const e of empresas) { ins.run(e.id, ini, fim, Math.round(val)); n++; }
  }
  console.log(`✅ migration 186: previsao_vendas importada (${n / Math.max(1, empresas.length)} semanas × ${empresas.length} empresa(s))`);
} catch (e) {
  console.log('⚠️ migration 186: tabela criada, mas não importei o xlsx —', e.message);
}
