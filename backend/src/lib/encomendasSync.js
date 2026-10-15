// Sincroniza ENCOMENDAS PENDENTES do ERP (status 'A' = aguardando, não baixada/cancelada)
// com TAREFAS do colaborador que a lançou. Cada encomenda pendente vira uma tarefa
// (origem='encomenda') atribuída ao colaborador; quando a encomenda é baixada/resolvida
// (some do status 'A'), a tarefa é encerrada automaticamente. Essas tarefas alimentam o
// indicador do GERENTE "Encomendas (<5 pendentes)" (que conta tarefas origem='encomenda').
const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const { erpQuery, habilitado } = require('../db/erp');

let ultimaSync = 0;
const INTERVALO = 15 * 60 * 1000; // no máx. 1x a cada 15 min (é operação de escrita)

function lojaMapErp() { // erp_unidadenegocio_id (string) → loja_id
  const m = {};
  db.prepare('SELECT id, erp_unidadenegocio_id FROM lojas WHERE erp_unidadenegocio_id IS NOT NULL')
    .all().forEach(l => { m[String(l.erp_unidadenegocio_id)] = l.id; });
  return m;
}
function gerenteDaLoja(empresaId, lojaId) {
  const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.loja_id=? AND f.nome='Gerente' AND c.ativo=1 LIMIT 1`).get(empresaId, lojaId);
  return r ? r.id : null;
}

// Cria/encerra as tarefas de encomenda. force=true ignora o intervalo.
async function sincronizarEncomendas(empresaId, force = false) {
  if (!habilitado()) return { ok: false, motivo: 'erp_desligado' };
  if (!force && Date.now() - ultimaSync < INTERVALO) return { ok: false, motivo: 'throttle' };
  ultimaSync = Date.now();

  const lojaMap = lojaMapErp();
  const unis = Object.keys(lojaMap).map(Number);
  if (!unis.length) return { ok: false, motivo: 'sem_lojas' };

  const colabs = db.prepare('SELECT id, loja_id, erp_pessoa_id FROM colaboradores WHERE erp_pessoa_id IS NOT NULL AND ativo=1').all();
  const porPessoa = new Map(colabs.map(c => [String(c.erp_pessoa_id), c]));

  let rows;
  try {
    rows = await erpQuery(`
      SELECT e.id, e.codigo, e.unidadenegocioid, u.pessoaid,
             COALESCE(pr.descricao, emb.descricao, e.produtosemcadastronome, 'produto') AS produto,
             cli.nome AS cliente, e.datahora
      FROM encomenda e
      JOIN usuario u ON u.id=e.usuarioid
      LEFT JOIN pessoa cli ON cli.id=e.pessoaid
      LEFT JOIN embalagem emb ON emb.id=e.embalagemid
      LEFT JOIN produto pr ON pr.id=emb.produtoid
      WHERE e.status='A' AND e.unidadenegocioid = ANY($1::int[])`, [unis]);
  } catch (e) {
    console.error('[encomendas] falha ao ler ERP:', e.message);
    return { ok: false, erro: e.message };
  }

  const pendentes = new Set();
  const existe = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='encomenda' AND referencia_id=?`);
  const insert = db.prepare(`INSERT INTO tarefas (id,empresa_id,loja_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?,?,?, 'encomenda', ?, ?, ?, ?, 'aberto', datetime('now'), datetime('now'))`);
  let criadas = 0;
  for (const r of rows) {
    const ref = 'enc:' + r.id;
    pendentes.add(ref);
    const lojaId = lojaMap[String(r.unidadenegocioid)];
    if (!lojaId) continue;
    if (existe.get(empresaId, ref)) continue; // já tem tarefa p/ essa encomenda
    const colab = porPessoa.get(String(r.pessoaid));
    const responsavel = (colab && colab.loja_id === lojaId) ? colab.id : gerenteDaLoja(empresaId, lojaId);
    const dataBR = r.datahora ? new Date(r.datahora).toLocaleDateString('pt-BR') : '';
    const titulo = `Encomenda pendente — ${r.produto}`.slice(0, 140);
    const desc = `Cliente: ${r.cliente || '—'} · pedido #${r.codigo || ''}${dataBR ? ' · lançada em ' + dataBR : ''}. `
      + `Avise o cliente que o produto chegou e dê baixa na encomenda.`;
    insert.run(uuidv4(), empresaId, lojaId, 'tarefa', ref, titulo, desc, responsavel || null);
    criadas++;
  }

  // Encerra as tarefas de encomendas que não estão mais pendentes (baixadas/resolvidas/canceladas)
  let fechadas = 0;
  const abertas = db.prepare(`SELECT id, referencia_id FROM tarefas
    WHERE empresa_id=? AND origem='encomenda' AND status!='concluido' AND referencia_id LIKE 'enc:%'`).all(empresaId);
  const close = db.prepare(`UPDATE tarefas SET status='concluido', reanalise_status='encerrada_auto', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`);
  for (const t of abertas) { if (!pendentes.has(t.referencia_id)) { close.run(t.id); fechadas++; } }

  return { ok: true, pendentes: pendentes.size, criadas, fechadas };
}

module.exports = { sincronizarEncomendas };
