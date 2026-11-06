// financeiroValidacao.js — Painel único de Validação Financeira (agregador extensível).
// Cada FONTE publica suas pendências (lidas ao vivo do módulo) e sabe confirmar no módulo de origem.
// A tabela fin_validacao guarda só o comprovante + a confirmação (quem/quando). Para plugar uma nova
// fonte (Tesouraria, Contabilidade…), basta adicionar uma entrada em FONTES com pendentes()+confirmar().
const db = require('../db/connection');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const hoje = () => new Date().toISOString().slice(0, 10);

const FONTES = {
  trade: {
    rotulo: 'Trade — a receber', emoji: '📣',
    pendentes(emp) {
      return db.prepare(`SELECT p.id ref_id, p.valor, p.vencimento data, v.codigo ref, v.fornecedor_nome contraparte,
            v.associacao_nome, v.origem venda_origem, v.loja_id
          FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id
          WHERE p.empresa_id=? AND COALESCE(p.recebido,0)=0 AND v.status NOT IN ('cancelado','recusado')`).all(emp)
        .map(x => ({
          ref_id: String(x.ref_id), ref: x.ref || 'Trade', valor: r2(x.valor), data: (x.data || '').slice(0, 10),
          contraparte: x.contraparte || '—', loja_id: x.loja_id || null,
          descricao: x.venda_origem === 'associacao' ? `🤝 via ${x.associacao_nome || 'associação'}` : 'recebimento de trade',
        }));
    },
    confirmar(emp, refId, valor) {
      const p = db.prepare('SELECT * FROM tmkt_parcelas WHERE id=? AND empresa_id=?').get(refId, emp);
      if (!p) throw new Error('Parcela não encontrada.');
      db.prepare('UPDATE tmkt_parcelas SET recebido=1, recebido_em=?, recebido_valor=? WHERE id=?')
        .run(hoje(), valor != null ? r2(valor) : p.valor, p.id);
    },
  },
  devolucao: {
    rotulo: 'Devolução — reembolso', emoji: '↩️',
    pendentes(emp) {
      return db.prepare(`SELECT id ref_id, codigo ref, valor_total valor, fornecedor_nome contraparte, loja_id, status_desde data
          FROM devolucoes WHERE empresa_id=? AND status='reembolso'`).all(emp)
        .map(x => ({
          ref_id: String(x.ref_id), ref: x.ref || ('DEV ' + String(x.ref_id).slice(0, 6)), valor: r2(x.valor),
          data: (x.data || '').slice(0, 10), contraparte: x.contraparte || '—', loja_id: x.loja_id || null,
          descricao: 'reembolso de devolução',
        }));
    },
    confirmar(emp, refId) {
      const d = db.prepare('SELECT * FROM devolucoes WHERE id=? AND empresa_id=?').get(refId, emp);
      if (!d) throw new Error('Devolução não encontrada.');
      db.prepare(`UPDATE devolucoes SET status='concluido', pago=1, reembolso_momento=COALESCE(reembolso_momento,datetime('now')),
        status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(refId, emp);
    },
  },
};

function overlay(emp) {
  const m = {};
  db.prepare('SELECT * FROM fin_validacao WHERE empresa_id=?').all(emp).forEach(v => { m[v.origem + '|' + v.ref_id] = v; });
  return m;
}
function nomeLojas(emp) {
  const m = {};
  try { db.prepare('SELECT id, nome FROM lojas WHERE empresa_id=?').all(emp).forEach(l => { m[l.id] = l.nome; }); } catch (e) { /* ignore */ }
  return m;
}

function listar(emp, { origem } = {}) {
  const ov = overlay(emp), lojas = nomeLojas(emp);
  const itens = [];
  for (const [k, f] of Object.entries(FONTES)) {
    if (origem && origem !== k) continue;
    let pend = [];
    try { pend = f.pendentes(emp); } catch (e) { pend = []; }
    for (const p of pend) {
      const v = ov[k + '|' + p.ref_id] || {};
      itens.push({
        origem: k, origemRotulo: f.rotulo, emoji: f.emoji, ...p,
        loja: lojas[p.loja_id] || p.loja_id || '—',
        status: v.status || 'pendente', temComprovante: !!(v.comprovante && v.comprovante.length),
        comprovante_nome: v.comprovante_nome || null, comprovante_por: v.comprovante_por || null,
      });
    }
  }
  const pend = itens.filter(x => x.status !== 'confirmado');
  pend.sort((a, b) => Number(b.temComprovante) - Number(a.temComprovante) || String(a.data).localeCompare(String(b.data)));
  const porOrigem = {};
  for (const [k, f] of Object.entries(FONTES)) {
    const da = pend.filter(x => x.origem === k);
    porOrigem[k] = { rotulo: f.rotulo, emoji: f.emoji, n: da.length, valor: r2(da.reduce((s, x) => s + x.valor, 0)) };
  }
  return {
    ok: true, itens: pend,
    resumo: {
      pendentes: pend.length, valorPendente: r2(pend.reduce((s, x) => s + x.valor, 0)),
      comComprovante: pend.filter(x => x.temComprovante).length,
      porOrigem: Object.entries(porOrigem).map(([k, v]) => ({ origem: k, ...v })),
    },
  };
}

function upsert(emp, origem, refId, campos) {
  const atual = db.prepare('SELECT id FROM fin_validacao WHERE empresa_id=? AND origem=? AND ref_id=?').get(emp, origem, refId);
  if (atual) {
    const set = Object.keys(campos).map(c => `${c}=?`).join(',');
    db.prepare(`UPDATE fin_validacao SET ${set} WHERE id=?`).run(...Object.values(campos), atual.id);
  } else {
    const cols = ['id', 'empresa_id', 'origem', 'ref_id', ...Object.keys(campos)];
    db.prepare(`INSERT INTO fin_validacao (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(uuid(), emp, origem, refId, ...Object.values(campos));
  }
}

function anexarComprovante(emp, { origem, ref_id, dados, mime, nome, usuario }) {
  if (!FONTES[origem]) throw new Error('Origem inválida.');
  if (!dados) throw new Error('Envie o arquivo do comprovante.');
  upsert(emp, origem, String(ref_id), {
    comprovante: String(dados).slice(0, 12000000), comprovante_mime: mime || null,
    comprovante_nome: nome || 'comprovante', comprovante_por: (usuario && (usuario.nome || usuario.id)) || null,
    comprovante_em: new Date().toISOString(),
  });
  return { ok: true };
}
function getComprovante(emp, origem, refId) {
  return db.prepare('SELECT comprovante, comprovante_mime, comprovante_nome FROM fin_validacao WHERE empresa_id=? AND origem=? AND ref_id=?').get(emp, origem, String(refId));
}
function confirmar(emp, { origem, ref_id, valor, usuario }) {
  const f = FONTES[origem];
  if (!f) throw new Error('Origem inválida.');
  f.confirmar(emp, String(ref_id), valor);   // baixa no módulo de origem
  upsert(emp, origem, String(ref_id), {
    status: 'confirmado', valor_confirmado: valor != null ? r2(valor) : null,
    confirmado_por: (usuario && (usuario.nome || usuario.id)) || null, confirmado_em: new Date().toISOString(),
  });
  return { ok: true };
}

module.exports = { listar, anexarComprovante, getComprovante, confirmar, FONTES };
