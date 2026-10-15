// feiras.js — Feiras de negócios (oportunidade de compra). Cadastro + participantes (ERP) +
// tarefa automática "faltam N dias — segurar compra p/ a feira" para compradores + Diretor.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('../lib/escopoCompras');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria'];
router.use(auth);

const participantesDe = id => db.prepare('SELECT id, tipo, ref_id, nome FROM feira_participantes WHERE feira_id=? ORDER BY nome').all(id);

// Lista de feiras (com participantes e realizado das NFs marcadas).
router.get('/', (req, res) => {
  const emp = req.usuario.empresa_id;
  const feiras = db.prepare('SELECT * FROM feiras WHERE empresa_id=? ORDER BY data_ini DESC').all(emp);
  const nfAgg = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(valor),0) v FROM feira_nfs WHERE feira_id=?');
  res.json({
    feiras: feiras.map(f => {
      const agg = nfAgg.get(f.id);
      return { ...f, participantes: participantesDe(f.id), realizadoNfs: agg.n, realizadoValor: Math.round(agg.v || 0) };
    }),
  });
});

// Fornecedores do ERP (para o seletor).
router.get('/erp/fornecedores', async (req, res) => {
  try {
    if (!habilitado()) return res.json({ itens: [] });
    const b = `%${(req.query.busca || '').trim()}%`;
    const rows = await erpQuery(`SELECT fo.id, pf.nome FROM fornecedor fo JOIN pessoa pf ON pf.id=fo.pessoaid
      WHERE pf.nome ILIKE $1 ORDER BY pf.nome LIMIT 50`, [b]);
    res.json({ itens: rows.map(r => ({ ref_id: String(r.id), nome: (r.nome || '').trim() })) });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Laboratórios (fabricantes) do ERP.
router.get('/erp/laboratorios', async (req, res) => {
  try {
    if (!habilitado()) return res.json({ itens: [] });
    const b = `%${(req.query.busca || '').trim()}%`;
    const rows = await erpQuery(`SELECT fb.id, pf.nome FROM fabricante fb JOIN pessoa pf ON pf.id=fb.pessoaid
      WHERE pf.nome ILIKE $1 ORDER BY pf.nome LIMIT 50`, [b]);
    res.json({ itens: rows.map(r => ({ ref_id: String(r.id), nome: (r.nome || '').trim() })) });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

function salvarParticipantes(feiraId, lista) {
  db.prepare('DELETE FROM feira_participantes WHERE feira_id=?').run(feiraId);
  const ins = db.prepare('INSERT INTO feira_participantes (id, feira_id, tipo, ref_id, nome) VALUES (?,?,?,?,?)');
  (lista || []).forEach(p => { if (p && p.nome) ins.run(uuid(), feiraId, p.tipo === 'laboratorio' ? 'laboratorio' : 'fornecedor', p.ref_id != null ? String(p.ref_id) : null, String(p.nome).slice(0, 200)); });
}

router.post('/', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body;
  if (!b.nome || !b.data_ini) return res.status(400).json({ erro: 'Informe nome e data da feira.' });
  const id = uuid();
  db.prepare(`INSERT INTO feiras (id, empresa_id, nome, data_ini, data_fim, verba_planejada, observacao, dias_aviso, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, req.usuario.empresa_id, b.nome, b.data_ini, b.data_fim || null,
    b.verba_planejada ? Number(b.verba_planejada) : null, b.observacao || null, Number(b.dias_aviso) || 30, req.usuario.id);
  salvarParticipantes(id, b.participantes);
  res.json({ ok: true, id });
});

router.put('/:id', exigePerfil(...GESTAO), (req, res) => {
  const f = db.prepare('SELECT id FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!f) return res.status(404).json({ erro: 'Feira não encontrada.' });
  const b = req.body;
  db.prepare(`UPDATE feiras SET nome=COALESCE(?,nome), data_ini=COALESCE(?,data_ini), data_fim=?, verba_planejada=?, observacao=?, dias_aviso=COALESCE(?,dias_aviso) WHERE id=?`)
    .run(b.nome || null, b.data_ini || null, b.data_fim || null, b.verba_planejada ? Number(b.verba_planejada) : null, b.observacao || null, b.dias_aviso ? Number(b.dias_aviso) : null, req.params.id);
  if (Array.isArray(b.participantes)) salvarParticipantes(req.params.id, b.participantes);
  res.json({ ok: true });
});

router.delete('/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM feiras WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  db.prepare('DELETE FROM feira_participantes WHERE feira_id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Lançamento das NFs compradas na feira (realizado) — com rateio por produto ──
// Sugere as NFs de entrada dos fornecedores/laboratórios da feira no período e calcula o
// VALOR ATRIBUÍVEL à feira: NF do fornecedor participante = valor total; laboratório = só os
// itens daquele fabricante (rateio por produto, p/ análise do orçamento CMV e do fluxo).
router.get('/:id/nfs-sugeridas', async (req, res) => {
  try {
    if (!habilitado()) return res.json({ itens: [] });
    const feira = db.prepare('SELECT * FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
    if (!feira) return res.status(404).json({ erro: 'Feira não encontrada.' });
    const unis = unisEmpresa(req.usuario.empresa_id);
    if (!unis.length) return res.json({ itens: [] });
    const parts = participantesDe(feira.id);
    const fornec = parts.filter(p => p.tipo === 'fornecedor' && p.ref_id).map(p => Number(p.ref_id));
    const labs = parts.filter(p => p.tipo === 'laboratorio' && p.ref_id).map(p => Number(p.ref_id));
    if (!fornec.length && !labs.length) return res.json({ itens: [], aviso: 'Cadastre fornecedores/laboratórios na feira.' });
    const de = req.query.de || feira.data_ini;
    const ate = req.query.ate || feira.data_fim || feira.data_ini;
    const ateExc = ate; // usa < ate + 1 dia
    const rows = await erpQuery(`
      WITH nf AS (
        SELECT nf.id, nf.numero, nf.datahoraentrada, COALESCE(pf.nome,'—') fornecedor, nf.valortotal::float8 total,
          (nf.fornecedorid = ANY($4::bigint[])) forn_match
        FROM notafiscal nf
        LEFT JOIN fornecedor fo ON fo.id=nf.fornecedorid LEFT JOIN pessoa pf ON pf.id=fo.pessoaid
        WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E') AND nf.fornecedorid IS NOT NULL
          AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
          AND ( nf.fornecedorid = ANY($4::bigint[])
             OR EXISTS (SELECT 1 FROM itemnotafiscal ii JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
                        WHERE ii.notafiscalid=nf.id AND pr.fabricanteid = ANY($5::bigint[])) )
      ),
      labval AS (
        SELECT ii.notafiscalid nfid, sum(ii.valortotal)::float8 v
        FROM itemnotafiscal ii JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
        WHERE pr.fabricanteid = ANY($5::bigint[]) GROUP BY ii.notafiscalid
      )
      SELECT n.id, n.numero, n.datahoraentrada, n.fornecedor, n.total, n.forn_match,
        CASE WHEN n.forn_match THEN n.total ELSE COALESCE(lv.v,0) END valor_feira
      FROM nf n LEFT JOIN labval lv ON lv.nfid = n.id
      ORDER BY n.datahoraentrada DESC LIMIT 300`,
      [unis, de, ateExc, fornec.length ? fornec : [0], labs.length ? labs : [0]]);
    const marcadas = new Set(db.prepare('SELECT nf_id FROM feira_nfs WHERE feira_id=?').all(feira.id).map(r => String(r.nf_id)));
    res.json({
      itens: rows.map(r => ({
        nf_id: String(r.id), numero: r.numero, data: r.datahoraentrada, fornecedor: (r.fornecedor || '').trim(),
        total: Math.round(Number(r.total) || 0), valorFeira: Math.round(Number(r.valor_feira) || 0),
        rateio: !r.forn_match, marcada: marcadas.has(String(r.id)),
      })).filter(x => x.valorFeira > 0),
      periodo: [de, ate],
    });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Busca uma NF pelo NÚMERO digitado (caso a pessoa não queira marcar da lista sugerida).
// Não exige que o fornecedor seja participante nem estar no período: acha a NF no ERP e calcula
// o valor atribuível — fornecedor participante = total; laboratório participante = rateio dos itens
// daquele fabricante; nenhum vínculo = valor total (compra manual, confia na NF inteira).
router.get('/:id/nf-por-numero', async (req, res) => {
  try {
    if (!habilitado()) return res.json({ itens: [] });
    const feira = db.prepare('SELECT * FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
    if (!feira) return res.status(404).json({ erro: 'Feira não encontrada.' });
    const numero = String(req.query.numero || '').trim();
    if (!numero) return res.status(400).json({ erro: 'Informe o número da NF.' });
    const unis = unisEmpresa(req.usuario.empresa_id);
    if (!unis.length) return res.json({ itens: [] });
    const parts = participantesDe(feira.id);
    const fornec = parts.filter(p => p.tipo === 'fornecedor' && p.ref_id).map(p => Number(p.ref_id));
    const labs = parts.filter(p => p.tipo === 'laboratorio' && p.ref_id).map(p => Number(p.ref_id));
    const rows = await erpQuery(`
      WITH nf AS (
        SELECT nf.id, nf.numero, nf.datahoraentrada, COALESCE(pf.nome,'—') fornecedor, nf.valortotal::float8 total,
          (nf.fornecedorid = ANY($3::bigint[])) forn_match
        FROM notafiscal nf
        LEFT JOIN fornecedor fo ON fo.id=nf.fornecedorid LEFT JOIN pessoa pf ON pf.id=fo.pessoaid
        WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E')
          AND nf.numero = $2 AND nf.fornecedorid IS NOT NULL
      ),
      labval AS (
        SELECT ii.notafiscalid nfid, sum(ii.valortotal)::float8 v
        FROM itemnotafiscal ii JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
        WHERE pr.fabricanteid = ANY($4::bigint[]) GROUP BY ii.notafiscalid
      )
      SELECT n.id, n.numero, n.datahoraentrada, n.fornecedor, n.total, n.forn_match,
        CASE WHEN n.forn_match THEN n.total
             WHEN COALESCE(lv.v,0) > 0 THEN lv.v
             ELSE n.total END valor_feira,
        (NOT n.forn_match AND COALESCE(lv.v,0) > 0) usa_rateio
      FROM nf n LEFT JOIN labval lv ON lv.nfid = n.id
      ORDER BY n.datahoraentrada DESC LIMIT 30`,
      [unis, numero, fornec.length ? fornec : [0], labs.length ? labs : [0]]);
    if (!rows.length) return res.json({ itens: [], aviso: `NF ${numero} não encontrada nas lojas do grupo.` });
    const marcadas = new Set(db.prepare('SELECT nf_id FROM feira_nfs WHERE feira_id=?').all(feira.id).map(r => String(r.nf_id)));
    res.json({
      itens: rows.map(r => ({
        nf_id: String(r.id), numero: r.numero, data: r.datahoraentrada, fornecedor: (r.fornecedor || '').trim(),
        total: Math.round(Number(r.total) || 0), valorFeira: Math.round(Number(r.valor_feira) || 0),
        rateio: !!r.usa_rateio, marcada: marcadas.has(String(r.id)),
      })),
    });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// Marca uma NF como compra de feira (guarda o valor atribuível já com rateio).
router.post('/:id/nfs', (req, res) => {
  const feira = db.prepare('SELECT id FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!feira) return res.status(404).json({ erro: 'Feira não encontrada.' });
  const b = req.body;
  if (!b.nf_id) return res.status(400).json({ erro: 'NF inválida.' });
  db.prepare(`INSERT OR REPLACE INTO feira_nfs (id, empresa_id, feira_id, nf_id, nf_numero, fornecedor, valor, data_entrada, marcado_por, marcado_em)
    VALUES (COALESCE((SELECT id FROM feira_nfs WHERE feira_id=? AND nf_id=?), ?),?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(req.params.id, String(b.nf_id), uuid(), req.usuario.empresa_id, req.params.id, String(b.nf_id), b.nf_numero || null, b.fornecedor || null, Number(b.valor) || 0, b.data_entrada || null, req.usuario.id);
  res.json({ ok: true });
});
router.delete('/:id/nfs/:nfId', (req, res) => {
  db.prepare('DELETE FROM feira_nfs WHERE feira_id=? AND nf_id=? AND empresa_id=?').run(req.params.id, String(req.params.nfId), req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Análise de compras por período → prever a verba da feira ────────────────
// Mostra quanto foi COMPRADO dos participantes (fornecedores/laboratórios) num período — base p/
// o comprador estimar a verba da feira. fornecedor = valor total das NFs; laboratório = itens do fabricante.
router.get('/:id/analise-compras', async (req, res) => {
  try {
    if (!habilitado()) return res.json({ total: 0, porParticipante: [] });
    const feira = db.prepare('SELECT * FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
    if (!feira) return res.status(404).json({ erro: 'Feira não encontrada.' });
    const unis = unisEmpresa(req.usuario.empresa_id);
    if (!unis.length) return res.json({ total: 0, porParticipante: [] });
    const parts = participantesDe(feira.id);
    const fornec = parts.filter(p => p.tipo === 'fornecedor' && p.ref_id).map(p => Number(p.ref_id));
    const labs = parts.filter(p => p.tipo === 'laboratorio' && p.ref_id).map(p => Number(p.ref_id));
    if (!fornec.length && !labs.length) return res.json({ total: 0, porParticipante: [], aviso: 'Cadastre fornecedores/laboratórios na feira.' });
    // Período: default últimos 90 dias.
    const hoje = new Date();
    const ate = req.query.ate || hoje.toISOString().slice(0, 10);
    const de = req.query.de || new Date(hoje.getTime() - 90 * 864e5).toISOString().slice(0, 10);
    const rowsF = fornec.length ? await erpQuery(`
      SELECT nf.fornecedorid id, COALESCE(pf.nome,'—') nome, sum(nf.valortotal)::float8 valor, count(*) n
      FROM notafiscal nf LEFT JOIN fornecedor fo ON fo.id=nf.fornecedorid LEFT JOIN pessoa pf ON pf.id=fo.pessoaid
      WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E') AND nf.fornecedorid = ANY($2::bigint[])
        AND nf.datahoraentrada >= $3::date AND nf.datahoraentrada < ($4::date + interval '1 day')
      GROUP BY nf.fornecedorid, pf.nome`, [unis, fornec, de, ate]) : [];
    const rowsL = labs.length ? await erpQuery(`
      SELECT pr.fabricanteid id, COALESCE(pf.nome,'—') nome, sum(ii.valortotal)::float8 valor, count(DISTINCT ii.notafiscalid) n
      FROM itemnotafiscal ii JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
        JOIN notafiscal nf ON nf.id=ii.notafiscalid
        LEFT JOIN fabricante fb ON fb.id=pr.fabricanteid LEFT JOIN pessoa pf ON pf.id=fb.pessoaid
      WHERE nf.unidadenegocioid = ANY($1::bigint[]) AND nf.status NOT IN ('X','E') AND pr.fabricanteid = ANY($2::bigint[])
        AND nf.datahoraentrada >= $3::date AND nf.datahoraentrada < ($4::date + interval '1 day')
      GROUP BY pr.fabricanteid, pf.nome`, [unis, labs, de, ate]) : [];
    const porParticipante = [
      ...rowsF.map(r => ({ tipo: 'fornecedor', nome: (r.nome || '').trim(), valor: Math.round(Number(r.valor) || 0), nfs: Number(r.n) || 0 })),
      ...rowsL.map(r => ({ tipo: 'laboratorio', nome: (r.nome || '').trim(), valor: Math.round(Number(r.valor) || 0), nfs: Number(r.n) || 0 })),
    ].sort((a, b) => b.valor - a.valor);
    const total = porParticipante.reduce((s, p) => s + p.valor, 0);
    const dias = Math.max(1, Math.round((new Date(ate) - new Date(de)) / 864e5));
    const meses = Math.max(1, dias / 30);
    res.json({ total, mediaMensal: Math.round(total / meses), porParticipante, periodo: [de, ate], dias });
  } catch (e) { res.status(502).json({ erro: 'ERP indisponível: ' + e.message }); }
});

// O comprador define a verba prevista → grava na feira, abre tarefa p/ o Diretor Geral e agenda na
// Comunidade (visão SÓ ESCRITÓRIO). Base da previsão fica registrada na descrição.
router.post('/:id/prever-verba', (req, res) => {
  const feira = db.prepare('SELECT * FROM feiras WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!feira) return res.status(404).json({ erro: 'Feira não encontrada.' });
  const emp = req.usuario.empresa_id;
  const verba = Math.round(Number(req.body.verba) || 0);
  if (verba <= 0) return res.status(400).json({ erro: 'Informe a verba prevista.' });
  const baseTxt = (req.body.base || '').toString().slice(0, 500);
  const justif = (req.body.justificativa || '').toString().slice(0, 800);
  db.prepare('UPDATE feiras SET verba_planejada=? WHERE id=?').run(verba, feira.id);

  const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const dataBR = feira.data_ini ? feira.data_ini.split('-').reverse().join('/') : '';
  // Tarefa p/ o Diretor Geral aprovar a verba prevista.
  const { gerarTarefa } = require('./tarefas');
  const diretor = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome='Diretor Geral' ORDER BY c.nome LIMIT 1`).get(emp);
  let tarefaId = null;
  if (diretor) {
    tarefaId = gerarTarefa({
      empresa_id: emp, loja_id: req.usuario.loja_id, tipo: 'tarefa', origem: 'feira_verba',
      referencia_id: `feira_verba:${feira.id}`,
      titulo: `💰 Verba de feira p/ aprovar — ${feira.nome}: ${brl(verba)}`,
      descricao: `${req.usuario.nome} previu a verba da feira "${feira.nome}" (${dataBR}) em ${brl(verba)}.\n`
        + (baseTxt ? `Base: ${baseTxt}\n` : '') + (justif ? `Justificativa: ${justif}\n` : '')
        + `Aprove/ajuste a verba p/ ela entrar no orçamento de compras.`,
      responsavel_id: diretor.id, criado_por: req.usuario.id,
    });
  }
  // Agenda da Comunidade — visão só escritório.
  if (feira.data_ini) {
    db.prepare(`INSERT INTO mural_eventos (id,empresa_id,titulo,descricao,data,hora,local,loja_id,escritorio,autor_id,autor_nome,criado_em)
      VALUES (?,?,?,?,?,?,?,?,1,?,?,datetime('now'))`)
      .run(uuid(), emp, `🎪 Feira ${feira.nome} — verba prevista ${brl(verba)}`,
        `Previsão de compra da feira lançada por ${req.usuario.nome}.` + (baseTxt ? ` ${baseTxt}` : ''),
        feira.data_ini, null, null, null, req.usuario.id, req.usuario.nome);
  }
  res.json({ ok: true, tarefaCriada: !!diretor, verba });
});

// Gera a tarefa de "faltam N dias — segure a compra p/ a feira" p/ TODOS os compradores + Diretor Geral.
// Roda no boot e 1x/dia. Idempotente: só quando entra na janela (data_ini - dias_aviso ≤ hoje < data_ini) e ainda não gerou.
function gerarTarefasFeira(empresaId) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const iso = d => d.toISOString().slice(0, 10);
  const feiras = db.prepare("SELECT * FROM feiras WHERE empresa_id=? AND tarefa_gerada=0 AND data_ini IS NOT NULL").all(empresaId);
  if (!feiras.length) return { criadas: 0 };
  const compradores = db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND (f.nome LIKE 'Comprador%' OR f.nome='Diretor Geral') ORDER BY c.nome`).all(empresaId);
  if (!compradores.length) return { criadas: 0 };
  const existe = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='feira' AND referencia_id=?`);
  const ins = db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,prazo,status,criado_em,atualizado_em)
    VALUES (?,?,'tarefa','feira',?,?,?,?,?,'aberto',datetime('now'),datetime('now'))`);
  let criadas = 0;
  const tx = db.transaction(() => {
    for (const feira of feiras) {
      const ini = new Date(feira.data_ini + 'T00:00:00');
      const gatilho = new Date(ini); gatilho.setDate(ini.getDate() - (feira.dias_aviso || 30));
      if (hoje < gatilho || hoje >= ini) continue; // fora da janela
      const dias = Math.round((ini - hoje) / 864e5);
      const parts = participantesDe(feira.id);
      const labs = parts.map(p => p.nome).join(', ') || 'os fornecedores/laboratórios da feira';
      const titulo = `🎪 Faltam ${dias} dias para a feira ${feira.nome} — segure a compra`;
      const desc = `A feira "${feira.nome}" começa em ${feira.data_ini.split('-').reverse().join('/')} (${dias} dias). `
        + `Faça APENAS REPOSIÇÃO de ${labs} até lá — a compra de volume maior deve ser feita na feira, onde a condição é melhor.`
        + (feira.verba_planejada ? ` Verba planejada p/ a feira: R$ ${Math.round(feira.verba_planejada).toLocaleString('pt-BR')}.` : '');
      for (const c of compradores) {
        const ref = `feira:${feira.id}:${c.id}`;
        if (existe.get(empresaId, ref)) continue;
        ins.run(uuid(), empresaId, ref, titulo.slice(0, 140), desc, c.id, feira.data_ini);
        criadas++;
      }
      db.prepare('UPDATE feiras SET tarefa_gerada=1 WHERE id=?').run(feira.id);
    }
  });
  tx();
  return { criadas };
}

// Dispara manualmente (gestão) — útil p/ testar.
router.post('/gerar-tarefas', exigePerfil(...GESTAO), (req, res) => res.json(gerarTarefasFeira(req.usuario.empresa_id)));

module.exports = router;
module.exports.gerarTarefasFeira = gerarTarefasFeira;
