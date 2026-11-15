// crmCadernoFilipeta.js — fluxo pedido pelo Joe (2026-11-15): quando SURGE um caderno de oferta
// NOVO no ERP, cria automaticamente uma TAREFA de Marketing "Criar filipeta" (p/ montar e subir no
// Trivio). Resolve a dor de caderno novo que não vira filipeta. Dedup por (origem='filipeta',
// referencia_id='caderno:<id>') — roda quantas vezes quiser sem duplicar. Só cria p/ cadernos que
// começaram nos últimos `diasNovo` dias (não dispara tarefa pra encarte velho no 1º boot).
const { erpQuery, habilitado } = require('../db/erp');
const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

async function sincronizarCadernosFilipeta(empresaId, { dryRun = false, diasNovo = 10 } = {}) {
  if (!habilitado()) return { ok: false, erp: false };
  const rows = await erpQuery(`
    SELECT c.id, c.nome, c.datahorainicial, c.datahorafinal,
      (SELECT count(*) FROM itemcadernooferta i WHERE i.cadernoofertaid=c.id AND i.precooferta>0) itens
    FROM cadernooferta c
    WHERE c.status='A' AND c.datahorainicial >= now() - make_interval(days => $1::int)
      AND c.datahorafinal >= now()
    ORDER BY c.datahorainicial DESC LIMIT 100`, [diasNovo]).catch(e => { console.error('[caderno-filipeta] erro ERP:', e.message); return []; });
  if (!rows.length) return { ok: true, criadas: 0, novos: [] };

  const existe = db.prepare("SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='filipeta' AND referencia_id=?");
  // Responsável: um colaborador de Marketing ativo (se não houver, a tarefa fica sem dono na fila).
  let resp = null;
  try { const m = db.prepare("SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.nome='Marketing' AND c.ativo=1 ORDER BY c.nome LIMIT 1").get(empresaId); resp = m ? m.id : null; } catch { /* */ }
  const ins = db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?,'tarefa','filipeta',?,?,?,?,'aberto',datetime('now'),datetime('now'))`);
  const fmtD = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); };

  let criadas = 0; const novos = [];
  const processar = () => {
    for (const r of rows) {
      const ref = 'caderno:' + r.id;
      if (existe.get(empresaId, ref)) continue;
      const nome = r.nome || ('Caderno #' + r.id);
      const titulo = `📰 Criar filipeta: ${nome}`;
      const desc = `Novo caderno de oferta no ERP (#${r.id}) com ${Number(r.itens) || 0} item(ns), vigente de ${fmtD(r.datahorainicial)} a ${fmtD(r.datahorafinal)}. Montar a filipeta no Trivio (Caderno → Filipeta) e subir antes do início. Responsável: Marketing.`;
      if (!dryRun) ins.run(uuidv4(), empresaId, ref, titulo.slice(0, 140), desc, resp);
      criadas++; novos.push({ id: Number(r.id), nome, itens: Number(r.itens) || 0 });
    }
  };
  if (dryRun) processar(); else db.transaction(processar)();
  return { ok: true, criadas, novos, responsavel: resp };
}

module.exports = { sincronizarCadernosFilipeta };
