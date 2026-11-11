// convenioErp.js — Convênio (Joe 2026-11-11). Lê do ERP os convênios (crediario = empresa) e o consumo
// por competência (crediarioreceber dos clientes do convênio), e sobrepõe o overlay do app
// (convenio_empresa = alocação/dados, convenio_fechamento = controle da NF por mês).
const { erpQuery } = require('../db/erp');
const db = require('../db/connection');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

// Lista os convênios do ERP (crediarios ativos) + overlay do app (quais são empresas a faturar, dados, dia de fechamento).
async function listarConvenios(emp) {
  const rows = await erpQuery(`
    SELECT c.id::text id, c.nome,
      (SELECT count(*) FROM cliente cl WHERE cl.crediarioid=c.id) clientes,
      (SELECT COALESCE(sum(cr.valor),0)::float8 FROM crediarioreceber cr JOIN cliente cl ON cl.id=cr.clienteid WHERE cl.crediarioid=c.id AND cr.status='A') aberto,
      COALESCE(pe.cnpj, pe.cpf) doc
    FROM crediario c
    LEFT JOIN pessoa pe ON pe.id=c.pessoaid
    WHERE c.status='A'
    ORDER BY clientes DESC`);
  const ov = {};
  db.prepare('SELECT * FROM convenio_empresa WHERE empresa_id=?').all(emp).forEach(x => { ov[x.erp_crediario_id] = x; });
  const convenios = rows.map(r => {
    const o = ov[r.id] || {};
    return {
      erp_crediario_id: r.id, nome: (r.nome || '').trim(), clientes: Number(r.clientes) || 0, aberto: r2(r.aberto),
      doc_erp: r.doc || null,
      is_empresa: o.is_empresa != null ? !!o.is_empresa : false,
      dia_fechamento: o.dia_fechamento || null, cnpj: o.cnpj || r.doc || null,
      email: o.email || null, telefone: o.telefone || null,
      responsavel_colab_id: o.responsavel_colab_id || null, ativo: o.ativo != null ? !!o.ativo : true,
    };
  });
  return { ok: true, convenios };
}

// Consumo de um convênio numa competência (AAAA-MM): soma crediarioreceber por dataemissao do mês.
async function consumoCompetencia(emp, crediarioId, comp) {
  const ini = comp + '-01';
  const [y, m] = comp.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const fim = `${comp}-${String(lastDay).padStart(2, '0')}`;
  const rows = await erpQuery(`
    SELECT count(*) titulos, COALESCE(sum(cr.valor),0)::float8 consumo
    FROM crediarioreceber cr JOIN cliente cl ON cl.id=cr.clienteid
    WHERE cl.crediarioid=$1 AND cr.dataemissao >= $2::date AND cr.dataemissao < ($3::date + 1)`, [crediarioId, ini, fim]);
  const r = rows[0] || {};
  return { ok: true, competencia: comp, titulos: Number(r.titulos) || 0, consumo: r2(r.consumo) };
}

// Salva a alocação/dados de um convênio (quem é empresa a faturar, dia de fechamento, cnpj, email, responsável).
function salvarConvenio(emp, crediarioId, dados) {
  const nome = dados.nome || null;
  const ex = db.prepare('SELECT id FROM convenio_empresa WHERE empresa_id=? AND erp_crediario_id=?').get(emp, crediarioId);
  const campos = {
    nome, is_empresa: dados.is_empresa ? 1 : 0, dia_fechamento: dados.dia_fechamento != null && dados.dia_fechamento !== '' ? Number(dados.dia_fechamento) : null,
    cnpj: dados.cnpj || null, email: dados.email || null, telefone: dados.telefone || null,
    responsavel_colab_id: dados.responsavel_colab_id || null, ativo: dados.ativo === false ? 0 : 1,
  };
  if (ex) {
    db.prepare(`UPDATE convenio_empresa SET nome=?, is_empresa=?, dia_fechamento=?, cnpj=?, email=?, telefone=?, responsavel_colab_id=?, ativo=? WHERE id=?`)
      .run(campos.nome, campos.is_empresa, campos.dia_fechamento, campos.cnpj, campos.email, campos.telefone, campos.responsavel_colab_id, campos.ativo, ex.id);
  } else {
    db.prepare(`INSERT INTO convenio_empresa (id, empresa_id, erp_crediario_id, nome, is_empresa, dia_fechamento, cnpj, email, telefone, responsavel_colab_id, ativo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), emp, crediarioId, campos.nome, campos.is_empresa, campos.dia_fechamento, campos.cnpj, campos.email, campos.telefone, campos.responsavel_colab_id, campos.ativo);
  }
  return { ok: true };
}

// Fechamentos (controle de NF por competência) de um convênio.
function listarFechamentos(emp, crediarioId) {
  const rows = db.prepare('SELECT id, competencia, valor, nf_numero, nf_emitida_em, enviada_em, paga_em, prazo_data, no_prazo, obs, (nf_anexo IS NOT NULL AND nf_anexo<>\'\') tem_anexo FROM convenio_fechamento WHERE empresa_id=? AND erp_crediario_id=? ORDER BY competencia DESC').all(emp, crediarioId);
  return { ok: true, fechamentos: rows };
}
function salvarFechamento(emp, crediarioId, comp, dados) {
  if (!comp) throw new Error('Informe a competência.');
  // prazo = dia de fechamento do convênio no mês seguinte à competência (se cadastrado)
  const ex = db.prepare('SELECT id FROM convenio_fechamento WHERE empresa_id=? AND erp_crediario_id=? AND competencia=?').get(emp, crediarioId, comp);
  const noPrazo = (dados.enviada_em && dados.prazo_data) ? (dados.enviada_em <= dados.prazo_data ? 1 : 0) : (dados.no_prazo != null ? (dados.no_prazo ? 1 : 0) : null);
  const f = {
    valor: dados.valor != null && dados.valor !== '' ? r2(dados.valor) : null, nf_numero: dados.nf_numero || null,
    nf_emitida_em: dados.nf_emitida_em || null, enviada_em: dados.enviada_em || null, paga_em: dados.paga_em || null,
    prazo_data: dados.prazo_data || null, no_prazo: noPrazo, obs: dados.obs || null,
    nf_anexo: dados.nf_anexo || null, nf_mime: dados.nf_mime || null, por: (dados.usuario && (dados.usuario.nome || dados.usuario.id)) || null,
  };
  if (ex) {
    // não apaga o anexo se não vier um novo
    const setAnexo = f.nf_anexo ? ', nf_anexo=?, nf_mime=?' : '';
    const args = [f.valor, f.nf_numero, f.nf_emitida_em, f.enviada_em, f.paga_em, f.prazo_data, f.no_prazo, f.obs, f.por];
    if (f.nf_anexo) { args.push(f.nf_anexo, f.nf_mime); }
    db.prepare(`UPDATE convenio_fechamento SET valor=?, nf_numero=?, nf_emitida_em=?, enviada_em=?, paga_em=?, prazo_data=?, no_prazo=?, obs=?, por=?${setAnexo}, atualizado_em=datetime('now') WHERE id=?`).run(...args, ex.id);
  } else {
    db.prepare(`INSERT INTO convenio_fechamento (id, empresa_id, erp_crediario_id, competencia, valor, nf_numero, nf_emitida_em, enviada_em, paga_em, prazo_data, no_prazo, nf_anexo, nf_mime, obs, por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), emp, crediarioId, comp, f.valor, f.nf_numero, f.nf_emitida_em, f.enviada_em, f.paga_em, f.prazo_data, f.no_prazo, f.nf_anexo, f.nf_mime, f.obs, f.por);
  }
  return { ok: true };
}
function anexoFechamento(emp, id) {
  return db.prepare('SELECT nf_anexo, nf_mime FROM convenio_fechamento WHERE empresa_id=? AND id=?').get(emp, id);
}

// Metas do responsável: % de convênios enviados no prazo no período.
function metasResponsavel(emp, { ano } = {}) {
  const like = (ano ? String(ano) : '%') + '%';
  const rows = db.prepare(`SELECT no_prazo, enviada_em FROM convenio_fechamento WHERE empresa_id=? AND competencia LIKE ?`).all(emp, ano ? ano + '-%' : '%');
  const enviados = rows.filter(r => r.enviada_em);
  const noPrazo = enviados.filter(r => r.no_prazo === 1).length;
  return { ok: true, total: rows.length, enviados: enviados.length, noPrazo, pctNoPrazo: enviados.length ? Math.round(100 * noPrazo / enviados.length) : null };
}

module.exports = { listarConvenios, consumoCompetencia, salvarConvenio, listarFechamentos, salvarFechamento, anexoFechamento, metasResponsavel };
