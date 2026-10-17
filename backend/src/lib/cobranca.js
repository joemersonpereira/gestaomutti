// cobranca.js — monta e envia o e-mail de cobrança de uma negociação + a rotina automática (opt-in).
const db = require('../db/connection');
const { enviarEmail, smtpOk } = require('./mailer');

const fmtD = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const fmtV = x => 'R$ ' + (Number(x) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

function montarHtml(v, parc, total) {
  const linhas = parc.map(p => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">Parcela ${p.numero}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${fmtD(p.vencimento)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${p.forma || '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmtV(p.valor)}</td></tr>`).join('');
  const link = `${process.env.PUBLIC_URL || 'http://localhost:3001'}/trade.html?t=${v.token}`;
  return `<div style="font-family:Arial,sans-serif;color:#243;max-width:560px">
    <h2 style="color:#1E874B">Grupo Mutti · Trade Marketing</h2>
    <p>Olá${v.contato_nome ? ', ' + v.contato_nome : ''}! Segue o resumo dos pagamentos em aberto da negociação <b>${v.codigo}</b> (${v.fornecedor_nome}).</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="text-align:left;color:#64748b"><th style="padding:6px 10px">Parcela</th><th style="padding:6px 10px">Vencimento</th><th style="padding:6px 10px">Forma</th><th style="padding:6px 10px;text-align:right">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
    <p style="font-size:16px"><b>Total em aberto: ${fmtV(total)}</b></p>
    <p>Você pode informar o pagamento e anexar o comprovante no seu painel: <a href="${link}">${link}</a></p>
    <p style="color:#94a3b8;font-size:12px">Nome e CPF de cliente não são compartilhados.</p></div>`;
}

async function cobrarVenda(emp, vendaId, marcar) {
  const v = db.prepare('SELECT id, codigo, fornecedor_nome, contato_nome, contato_email, token FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(vendaId, emp);
  if (!v) throw new Error('Negociação não encontrada.');
  if (!v.contato_email) throw new Error('Essa negociação não tem e-mail de contato.');
  if (!smtpOk()) throw new Error('SMTP não configurado no servidor.');
  const parc = db.prepare(`SELECT numero, vencimento, valor, forma FROM tmkt_parcelas WHERE venda_id=? AND COALESCE(recebido,0)=0 ORDER BY vencimento`).all(v.id);
  if (!parc.length) throw new Error('Não há parcelas em aberto nessa negociação.');
  const total = parc.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  await enviarEmail({ to: v.contato_email, subject: `Cobrança · ${v.codigo} · Trade Grupo Mutti`, html: montarHtml(v, parc, total) });
  if (marcar) db.prepare(`UPDATE tmkt_parcelas SET cobranca_em=datetime('now') WHERE venda_id=? AND COALESCE(recebido,0)=0`).run(v.id);
  return { ok: true, to: v.contato_email };
}

// rotina automática: só roda nas empresas com configuracoes.tmkt_cobranca_auto='1'
async function rodarCobrancaAuto() {
  if (!smtpOk()) return;
  let cfgs = [];
  try { cfgs = db.prepare(`SELECT empresa_id FROM configuracoes WHERE chave='tmkt_cobranca_auto' AND valor='1'`).all(); } catch (e) { return; }
  for (const c of cfgs) {
    const emp = c.empresa_id;
    const dias = Number((db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='tmkt_cobranca_dias'`).get(emp) || {}).valor) || 3;
    let vendas = [];
    try {
      vendas = db.prepare(`SELECT DISTINCT p.venda_id FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id
        WHERE p.empresa_id=? AND COALESCE(p.recebido,0)=0 AND p.vencimento < date('now') AND p.vencimento IS NOT NULL
          AND v.status<>'cancelado' AND v.contato_email IS NOT NULL AND v.contato_email<>''
          AND (p.cobranca_em IS NULL OR p.cobranca_em < datetime('now', '-' || ? || ' days'))`).all(emp, dias);
    } catch (e) { continue; }
    for (const row of vendas) { try { await cobrarVenda(emp, row.venda_id, true); } catch (e) { /* pula a que falhar */ } }
    if (vendas.length) console.log(`[cobrancaAuto] ${emp}: ${vendas.length} cobrança(s) enviada(s)`);
  }
}

module.exports = { cobrarVenda, rodarCobrancaAuto };
