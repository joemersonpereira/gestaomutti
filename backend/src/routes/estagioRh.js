// estagioRh.js — módulo Estágios (ciclo completo) · Fase 1: cadastros base + ficha.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const { auth, exigePerfil } = require('../middleware/auth');

const PERFIS = ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria', 'Tesouraria', 'Financeiro'];
// Quem pode validar cada etapa do pagamento (RH → Tesouraria → Financeiro). Gestor/Diretor fazem qualquer uma.
const PERFIL_ETAPA = {
  rh: ['RH', 'Gestor Geral', 'Diretor Geral'],
  tesouraria: ['Tesouraria', 'Gestor Geral', 'Diretor Geral'],
  financeiro: ['Financeiro', 'Gestor Geral', 'Diretor Geral'],
};
const emp = req => req.usuario.empresa_id;
router.use(auth);

// definição das entidades: tabela + campos graváveis
const TAB = {
  escola: { t: 'estagio_escola', campos: ['nome', 'cidade', 'contato', 'telefone', 'cnpj', 'endereco', 'ativo'] },
  empresa: { t: 'estagio_empresa', campos: ['nome', 'cnpj', 'tipo', 'endereco', 'ativo'] },
  seguro: { t: 'estagio_seguro', campos: ['seguradora', 'apolice', 'vigencia_ini', 'vigencia_fim', 'valor', 'cobertura', 'ativo'] },
  ficha: { t: 'estagio_ficha', campos: ['nome', 'cpf', 'nascimento', 'escola_id', 'curso', 'serie', 'empresa_registro_id', 'empresa_atuacao_id', 'loja', 'valor_bolsa', 'vale_transporte', 'beneficios', 'seguro_id', 'resp_nome', 'resp_cpf', 'resp_telefone', 'resp_parentesco', 'data_inicio', 'data_fim', 'status', 'origem', 'banco', 'agencia', 'conta', 'tipo_conta', 'pix'] },
  avaliacao: { t: 'estagio_avaliacao', campos: ['ficha_id', 'competencia', 'nota', 'supervisor', 'comentario'] },
  ferias: { t: 'estagio_ferias', campos: ['ficha_id', 'data_ini', 'data_fim', 'dias', 'status', 'obs'] },
  candidato: { t: 'estagio_candidato', campos: ['nome', 'cpf', 'email', 'telefone', 'escola', 'curso', 'serie', 'boletim', 'frequencia', 'status', 'obs', 'tipo_vaga'] },
  questao: { t: 'estagio_teste_questao', campos: ['pergunta', 'alt_json', 'correta', 'ativo'] },
};

// índice de aprovação do estagiário = média das notas das avaliações mensais
function indiceFicha(e, fichaId) {
  const r = db.prepare(`SELECT AVG(nota) m, COUNT(*) n FROM estagio_avaliacao WHERE empresa_id=? AND ficha_id=?`).get(e, fichaId);
  return { indice: r && r.m != null ? Math.round(r.m * 10) / 10 : null, avaliacoes: (r && r.n) || 0 };
}

// ── Config (modelo de contrato) ──
router.get('/config/:chave', exigePerfil(...PERFIS), (req, res) => {
  const r = db.prepare(`SELECT valor FROM estagio_config WHERE empresa_id=? AND chave=?`).get(emp(req), req.params.chave);
  res.json({ chave: req.params.chave, valor: r ? r.valor : '' });
});
router.put('/config/:chave', exigePerfil(...PERFIS), (req, res) => {
  db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(emp(req), req.params.chave, req.body?.valor || '');
  res.json({ ok: true });
});

// ── Índice de aprovação de uma ficha ──
router.get('/indice/:fichaId', exigePerfil(...PERFIS), (req, res) => res.json(indiceFicha(emp(req), req.params.fichaId)));

// ── Renovação (fim do contrato) ──
router.get('/renovacoes', exigePerfil(...PERFIS), (req, res) => {
  res.json(db.prepare(`SELECT r.*, f.nome ficha_nome, f.data_fim FROM estagio_renovacao r
    LEFT JOIN estagio_ficha f ON f.id=r.ficha_id WHERE r.empresa_id=? ORDER BY r.criado_em DESC`).all(emp(req)));
});
router.post('/renovacao/abrir/:fichaId', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const fid = req.params.fichaId;
  const { indice } = indiceFicha(e, fid);
  const status = (indice != null && indice >= 90) ? 'pendente_gerente' : 'pendente_rh';
  const { v4: uuid } = require('uuid');
  const existe = db.prepare(`SELECT id FROM estagio_renovacao WHERE empresa_id=? AND ficha_id=?`).get(e, fid);
  if (existe) db.prepare(`UPDATE estagio_renovacao SET indice=?, status=? WHERE id=?`).run(indice, status, existe.id);
  else db.prepare(`INSERT INTO estagio_renovacao (id,empresa_id,ficha_id,indice,status) VALUES (?,?,?,?,?)`).run(uuid(), e, fid, indice, status);
  res.json({ ok: true, indice, status });
});
router.post('/renovacao/:id/rh', exigePerfil(...PERFIS), (req, res) => {
  db.prepare(`UPDATE estagio_renovacao SET rh_parecer=?, status='pendente_gerente' WHERE id=? AND empresa_id=?`).run(req.body?.parecer || '', req.params.id, emp(req));
  res.json({ ok: true });
});
router.post('/renovacao/:id/decidir', exigePerfil(...PERFIS), (req, res) => {
  const st = req.body?.status; if (!['aprovada', 'recusada'].includes(st)) return res.status(400).json({ erro: 'Status inválido.' });
  db.prepare(`UPDATE estagio_renovacao SET status=?, decidido_por=?, decidido_em=datetime('now') WHERE id=? AND empresa_id=?`).run(st, req.usuario.nome || null, req.params.id, emp(req));
  res.json({ ok: true });
});

// ── Documentos (anexos) do estagiário ──
router.get('/documentos/:fichaId', exigePerfil(...PERFIS), (req, res) => {
  res.json(db.prepare(`SELECT id, nome, tipo, criado_em FROM estagio_documento WHERE empresa_id=? AND ficha_id=? ORDER BY criado_em DESC`).all(emp(req), req.params.fichaId));
});
router.get('/documento/:id', exigePerfil(...PERFIS), (req, res) => {
  const d = db.prepare(`SELECT nome, tipo, dados FROM estagio_documento WHERE id=? AND empresa_id=?`).get(req.params.id, emp(req));
  if (!d) return res.status(404).json({ erro: 'Documento não encontrado.' });
  res.json(d);
});
router.post('/documento', exigePerfil(...PERFIS), (req, res) => {
  const b = req.body || {}; const { v4: uuid } = require('uuid');
  if (!b.ficha_id || !b.dados) return res.status(400).json({ erro: 'Informe o arquivo.' });
  const id = uuid();
  db.prepare(`INSERT INTO estagio_documento (id,empresa_id,ficha_id,nome,tipo,dados) VALUES (?,?,?,?,?,?)`).run(id, emp(req), b.ficha_id, b.nome || 'documento', b.tipo || '', b.dados);
  res.json({ ok: true, id });
});
router.delete('/documento/:id', exigePerfil(...PERFIS), (req, res) => { db.prepare(`DELETE FROM estagio_documento WHERE id=? AND empresa_id=?`).run(req.params.id, emp(req)); res.status(204).end(); });

// ── Ranking de colocação (boletim + frequência + teste, por pesos) ──
router.get('/ranking', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req);
  let pesos = { boletim: 0.3, frequencia: 0.2, teste: 0.5 };
  const cfg = db.prepare(`SELECT valor FROM estagio_config WHERE empresa_id=? AND chave='ranking_pesos'`).get(e);
  if (cfg) { try { pesos = JSON.parse(cfg.valor); } catch { /* default */ } }
  const cands = db.prepare(`SELECT * FROM estagio_candidato WHERE empresa_id=? AND status NOT IN ('descartado','contratado') ORDER BY nome`).all(e);
  const ranking = cands.map(c => {
    const bP = (Number(c.boletim) || 0) * 10;           // boletim 0-10 → 0-100
    const fP = Number(c.frequencia) || 0;               // 0-100
    const tP = Number(c.teste_nota) || 0;               // 0-100
    const score = Math.round((pesos.boletim * bP + pesos.frequencia * fP + pesos.teste * tP) * 10) / 10;
    return { id: c.id, nome: c.nome, escola: c.escola, boletim: c.boletim, frequencia: c.frequencia, teste_nota: c.teste_nota, status: c.status, score };
  }).sort((a, b) => b.score - a.score);
  res.json({ pesos, ranking });
});

// ── Contratar candidato → cria ficha e marca o candidato como contratado ──
router.post('/candidato/:id/contratar', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const { v4: uuid } = require('uuid');
  const c = db.prepare(`SELECT * FROM estagio_candidato WHERE id=? AND empresa_id=?`).get(req.params.id, e);
  if (!c) return res.status(404).json({ erro: 'Candidato não encontrado.' });
  const fid = uuid();
  db.prepare(`INSERT INTO estagio_ficha (id,empresa_id,nome,cpf,curso,serie,status,origem) VALUES (?,?,?,?,?,?, 'ativo','banco_talentos')`)
    .run(fid, e, c.nome, c.cpf || null, c.curso || null, c.serie || null);
  db.prepare(`UPDATE estagio_candidato SET status='contratado' WHERE id=? AND empresa_id=?`).run(req.params.id, e);
  res.json({ ok: true, fichaId: fid });
});

// ── Fechamento mensal / Pagamento ──
router.get('/pagamentos', exigePerfil(...PERFIS), (req, res) => {
  const comp = req.query.competencia;
  res.json(db.prepare(`SELECT p.*, f.nome ficha_nome, f.cpf, f.loja, f.banco, f.agencia, f.conta, f.tipo_conta, f.pix, f.dados_bancarios_em
    FROM estagio_pagamento p LEFT JOIN estagio_ficha f ON f.id=p.ficha_id
    WHERE p.empresa_id=? AND p.competencia=? ORDER BY f.nome`).all(emp(req), comp));
});
// gera a folha do mês a partir das fichas ativas (sem sobrescrever descontos já lançados)
router.post('/pagamento/gerar/:competencia', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const comp = req.params.competencia; const { v4: uuid } = require('uuid');
  const fichas = db.prepare(`SELECT * FROM estagio_ficha WHERE empresa_id=? AND status='ativo'`).all(e);
  let n = 0;
  for (const f of fichas) {
    const ja = db.prepare(`SELECT 1 FROM estagio_pagamento WHERE empresa_id=? AND ficha_id=? AND competencia=?`).get(e, f.id, comp);
    if (ja) continue;
    const bolsa = Number(f.valor_bolsa) || 0, vt = Number(f.vale_transporte) || 0;
    db.prepare(`INSERT INTO estagio_pagamento (id,empresa_id,ficha_id,competencia,bolsa,vt,desconto,liquido,status) VALUES (?,?,?,?,?,?,0,?, 'aberto')`)
      .run(uuid(), e, f.id, comp, bolsa, vt, Math.round((bolsa + vt) * 100) / 100);
    n++;
  }
  res.json({ ok: true, gerados: n });
});
router.put('/pagamento/:id', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const b = req.body || {};
  const p = db.prepare(`SELECT * FROM estagio_pagamento WHERE id=? AND empresa_id=?`).get(req.params.id, e);
  if (!p) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
  const desconto = Number(b.desconto) || 0;
  const liquido = Math.round(((p.bolsa || 0) + (p.vt || 0) - desconto) * 100) / 100;
  db.prepare(`UPDATE estagio_pagamento SET desconto=?, desconto_obs=?, liquido=? WHERE id=? AND empresa_id=?`).run(desconto, b.desconto_obs || null, liquido, req.params.id, e);
  res.json({ ok: true, liquido });
});
// Resumo mensal do pagamento (modelo da planilha do Joe): totais + por tipo/conta/banco/loja.
router.get('/pagamento/resumo/:competencia', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const comp = req.params.competencia;
  const rows = db.prepare(`SELECT p.liquido, p.bolsa, p.vt, p.desconto, p.status,
      f.banco, f.conta, f.pix, f.loja, f.dados_bancarios_em, f.status AS fstatus
    FROM estagio_pagamento p LEFT JOIN estagio_ficha f ON f.id=p.ficha_id
    WHERE p.empresa_id=? AND p.competencia=?`).all(e, comp);
  const ativosHoje = db.prepare(`SELECT COUNT(*) n FROM estagio_ficha WHERE empresa_id=? AND status='ativo'`).get(e).n;
  const contaDe = r => (r.conta && r.banco) ? 'Sim' : (r.pix ? 'PIX' : 'Não');
  const soma = arr => Math.round(arr.reduce((a, r) => a + (Number(r.liquido) || 0), 0) * 100) / 100;
  const grupo = (keyFn) => {
    const m = {};
    rows.forEach(r => { const k = keyFn(r) || '—'; (m[k] = m[k] || { qtd: 0, valor: 0 }); m[k].qtd++; m[k].valor += Number(r.liquido) || 0; });
    return Object.entries(m).map(([k, v]) => ({ chave: k, qtd: v.qtd, valor: Math.round(v.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  };
  res.json({
    competencia: comp,
    total: soma(rows),
    recorrente_bolsa: soma(rows),                 // bolsa = recorrente (os lançamentos atuais são bolsa)
    eventual: 0,                                   // rescisão + férias (ainda sem valor lançado)
    a_pagar_sem_conta: soma(rows.filter(r => contaDe(r) === 'Não')),
    a_pagar_pix: soma(rows.filter(r => contaDe(r) === 'PIX')),
    lancamentos_com_valor: rows.filter(r => (Number(r.liquido) || 0) > 0).length,
    nomes_na_lista: rows.length,
    ativos_hoje: ativosHoje,
    inativos_na_lista: rows.filter(r => r.fstatus && r.fstatus !== 'ativo').length,
    por_tipo: [
      { chave: 'BOLSA', qtd: rows.length, valor: soma(rows) },
      { chave: 'RESCISÃO', qtd: 0, valor: 0 },
      { chave: 'FÉRIAS', qtd: 0, valor: 0 },
    ],
    por_conta: grupo(contaDe),
    por_banco: grupo(r => r.banco),
    por_loja: grupo(r => r.loja),
  });
});

// 3 fluxos de aprovação do pagamento: RH (saldo da bolsa) → Tesouraria (descontos) → Financeiro (pago).
// POST /pagamento/:id/etapa  body: { etapa:'rh'|'tesouraria'|'financeiro', ok:bool }
router.post('/pagamento/:id/etapa', (req, res) => {
  const etapa = req.body.etapa; const ok = req.body.ok ? 1 : 0;
  if (!PERFIL_ETAPA[etapa]) return res.status(400).json({ erro: 'Etapa inválida.' });
  if (!PERFIL_ETAPA[etapa].includes(req.usuario.funcao_nome)) return res.status(403).json({ erro: `Sem permissão para a etapa ${etapa}.` });
  const e = emp(req);
  const p = db.prepare(`SELECT * FROM estagio_pagamento WHERE id=? AND empresa_id=?`).get(req.params.id, e);
  if (!p) return res.status(404).json({ erro: 'Pagamento não encontrado.' });
  // Ordem: tesouraria exige RH ok; financeiro exige tesouraria ok.
  if (ok && etapa === 'tesouraria' && !p.rh_ok) return res.status(400).json({ erro: 'O RH precisa validar o saldo da bolsa primeiro.' });
  if (ok && etapa === 'financeiro' && !p.tes_ok) return res.status(400).json({ erro: 'A Tesouraria precisa validar os descontos primeiro.' });
  const col = { rh: 'rh', tesouraria: 'tes', financeiro: 'fin' }[etapa];
  const nome = req.usuario.nome || req.usuario.funcao_nome || '';
  db.prepare(`UPDATE estagio_pagamento SET ${col}_ok=?, ${col}_em=?, ${col}_por=? WHERE id=? AND empresa_id=?`)
    .run(ok, ok ? new Date().toISOString() : null, ok ? nome : null, req.params.id, e);
  // Status reflete o estágio atual: pago (financeiro) > liberado (tesouraria) > conferido (rh) > aberto.
  const np = db.prepare(`SELECT rh_ok, tes_ok, fin_ok FROM estagio_pagamento WHERE id=?`).get(req.params.id);
  const status = np.fin_ok ? 'pago' : np.tes_ok ? 'liberado' : np.rh_ok ? 'conferido' : 'aberto';
  db.prepare(`UPDATE estagio_pagamento SET status=? WHERE id=?`).run(status, req.params.id);
  res.json({ ok: true, status });
});
router.post('/pagamento/liberar/:competencia', exigePerfil(...PERFIS), (req, res) => {
  const r = db.prepare(`UPDATE estagio_pagamento SET status='liberado', liberado_por=?, liberado_em=datetime('now') WHERE empresa_id=? AND competencia=? AND status='aberto'`).run(req.usuario.nome || null, emp(req), req.params.competencia);
  res.json({ ok: true, liberados: r.changes });
});

// ── Rescisão ──
router.post('/rescisao/:fichaId', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const { v4: uuid } = require('uuid');
  db.prepare(`INSERT INTO estagio_rescisao (id,empresa_id,ficha_id,data,motivo) VALUES (?,?,?,?,?)`).run(uuid(), e, req.params.fichaId, req.body?.data || new Date().toISOString().slice(0, 10), req.body?.motivo || '');
  db.prepare(`UPDATE estagio_ficha SET status='rescindido', atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(req.params.fichaId, e);
  res.json({ ok: true });
});

router.get('/:ent', exigePerfil(...PERFIS), (req, res) => {
  const d = TAB[req.params.ent]; if (!d) return res.status(404).json({ erro: 'Entidade inválida.' });
  res.json(db.prepare(`SELECT * FROM ${d.t} WHERE empresa_id=? ORDER BY ${d.t === 'estagio_ficha' ? 'nome' : 'criado_em DESC'}`).all(emp(req)));
});

router.post('/:ent', exigePerfil(...PERFIS), (req, res) => {
  const d = TAB[req.params.ent]; if (!d) return res.status(404).json({ erro: 'Entidade inválida.' });
  const b = req.body || {}; const e = emp(req);
  if (d.campos.includes('nome') && !b.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  if (d.t === 'estagio_seguro' && !b.seguradora) return res.status(400).json({ erro: 'Informe a seguradora.' });
  const id = b.id || uuid();
  const existe = db.prepare(`SELECT 1 FROM ${d.t} WHERE id=? AND empresa_id=?`).get(id, e);
  if (existe) {
    const set = d.campos.map(c => `${c}=?`).join(', ') + (d.t === 'estagio_ficha' ? ", atualizado_em=datetime('now')" : '');
    db.prepare(`UPDATE ${d.t} SET ${set} WHERE id=? AND empresa_id=?`).run(...d.campos.map(c => b[c] ?? null), id, e);
  } else {
    const cols = ['id', 'empresa_id', ...d.campos];
    db.prepare(`INSERT INTO ${d.t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(id, e, ...d.campos.map(c => b[c] ?? null));
  }
  res.json({ ok: true, id });
});

router.delete('/:ent/:id', exigePerfil(...PERFIS), (req, res) => {
  const d = TAB[req.params.ent]; if (!d) return res.status(404).json({ erro: 'Entidade inválida.' });
  db.prepare(`DELETE FROM ${d.t} WHERE id=? AND empresa_id=?`).run(req.params.id, emp(req));
  res.status(204).end();
});

module.exports = router;
