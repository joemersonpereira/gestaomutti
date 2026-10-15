const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const vendasErp = require('../lib/vendasErp');

router.use(auth);
router.use(exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH', 'Marketing'));

function csv(rows, colunas) {
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const head = colunas.map(c => c.label).join(';');
  const body = rows.map(r => colunas.map(c => esc(c.get ? c.get(r) : r[c.key])).join(';')).join('\n');
  return '\ufeff' + head + '\n' + body; // BOM p/ Excel pt-BR
}
function enviarCsv(res, nome, conteudo) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}

// GET /relatorios/vendas.csv?mes=&ano=&loja_id=
router.get('/vendas.csv', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaIds = req.query.loja_id ? [req.query.loja_id] : null;
  const rows = await vendasErp.detalheVendasMes(lojaIds, mes, ano); // ao vivo do ERP (por dia+vendedor)
  enviarCsv(res, `vendas-${mes}-${ano}.csv`, csv(rows, [
    { label: 'Data', key: 'data_venda' }, { label: 'Loja', key: 'loja' },
    { label: 'Vendedor', key: 'vendedor' }, { label: 'Valor', get: r => Number(r.valor).toFixed(2).replace('.', ',') },
  ]));
});

// GET /relatorios/ocorrencias.csv
router.get('/ocorrencias.csv', (req, res) => {
  const rows = db.prepare(`SELECT o.data_ocorrencia, c.nome colaborador, o.tipo, o.pontos_deduzidos, o.status FROM ocorrencias o JOIN colaboradores c ON c.id=o.colaborador_id WHERE o.empresa_id=? ORDER BY o.data_ocorrencia DESC`).all(req.usuario.empresa_id);
  enviarCsv(res, 'ocorrencias.csv', csv(rows, [
    { label: 'Data', key: 'data_ocorrencia' }, { label: 'Colaborador', key: 'colaborador' },
    { label: 'Tipo', key: 'tipo' }, { label: 'Pontos', key: 'pontos_deduzidos' }, { label: 'Status', key: 'status' },
  ]));
});

// GET /relatorios/vendas.xlsx — usa lib xlsx se instalada, senão orienta usar CSV
router.get('/vendas.xlsx', async (req, res) => {
  let XLSX;
  try { XLSX = require('xlsx'); }
  catch { return res.status(501).json({ erro: 'Exportação .xlsx requer a dependência "xlsx". Instale com: npm i xlsx — ou use /relatorios/vendas.csv.' }); }
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaIds = req.query.loja_id ? [req.query.loja_id] : null;
  const det = await vendasErp.detalheVendasMes(lojaIds, mes, ano); // ao vivo do ERP
  const rows = det.map(r => ({ Data: r.data_venda, Loja: r.loja, Vendedor: r.vendedor, Valor: r.valor }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Vendas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="vendas-${mes}-${ano}.xlsx"`);
  res.send(buf);
});

// GET /relatorios/painel.html?loja_id= — relatório imprimível (PDF via navegador)
router.get('/painel.html', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const loja = db.prepare('SELECT nome FROM lojas WHERE id=?').get(lojaId);

  // Dados mínimos: meta de vendas e total (ao vivo do ERP)
  const meta = db.prepare(`SELECT valor_meta FROM metas WHERE empresa_id=? AND loja_id=? AND colaborador_id IS NULL AND mes=? AND ano=? ORDER BY criado_em DESC LIMIT 1`).get(req.usuario.empresa_id, lojaId, mes, ano);
  const vendido = await vendasErp.totalLojaMes(lojaId, mes, ano);
  const pct = meta && meta.valor_meta ? Math.round((vendido / meta.valor_meta) * 100) : 0;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Relatório — ${loja?.nome || ''} ${mes}/${ano}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:780px;margin:2rem auto;color:#222}
  h1{font-size:22px}.box{border:1px solid #ddd;border-radius:10px;padding:16px;margin:12px 0}
  .big{font-size:30px;font-weight:700;color:${pct>=90?'#3B6D11':pct>=75?'#BA7517':'#993C1D'}}
  table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #eee;padding:6px;text-align:left}
  @media print{button{display:none}}</style></head><body>
  <h1>📊 Relatório de Desempenho — ${loja?.nome || ''}</h1>
  <p>Período: ${String(mes).padStart(2,'0')}/${ano} · Gerado em ${hoje.toLocaleString('pt-BR')}</p>
  <div class="box"><div>Meta de vendas</div><div class="big">${pct}%</div>
  <div>Meta: R$ ${meta?Number(meta.valor_meta).toLocaleString('pt-BR'):'—'} · Vendido: R$ ${Number(vendido).toLocaleString('pt-BR')}</div></div>
  <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
