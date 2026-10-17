// publico.js — endpoints PÚBLICOS (sem login): Banco de Talentos de estágio + Portal Trade Marketing.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const { erpQuery, habilitado } = require('../db/erp');
const bcrypt = require('bcryptjs');
const EMP = 'empresa-mutti-001';
const soDig = s => String(s || '').replace(/\D/g, '');

// Questões do teste (sem revelar a resposta correta)
router.get('/estagio/questoes', (req, res) => {
  const rows = db.prepare(`SELECT id, pergunta, alt_json FROM estagio_teste_questao WHERE empresa_id=? AND ativo=1 ORDER BY criado_em`).all(EMP);
  res.json(rows.map(q => ({ id: q.id, pergunta: q.pergunta, alternativas: (() => { try { return JSON.parse(q.alt_json || '[]'); } catch { return []; } })() })));
});

// Candidato se inscreve + envia respostas → corrige e salva no banco de talentos
router.post('/estagio/candidato', (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  const qs = db.prepare(`SELECT id, correta FROM estagio_teste_questao WHERE empresa_id=? AND ativo=1`).all(EMP);
  const resp = b.respostas || {};
  let acertos = 0; qs.forEach(q => { if (String(resp[q.id]) === String(q.correta)) acertos++; });
  const total = qs.length; const nota = total ? Math.round(acertos / total * 1000) / 10 : 0;
  const tipoVaga = (b.tipo_vaga === 'efetivo') ? 'efetivo' : 'estagio';
  db.prepare(`INSERT INTO estagio_candidato (id,empresa_id,nome,cpf,email,telefone,escola,curso,serie,boletim,frequencia,teste_nota,teste_total,teste_respostas_json,status,tipo_vaga)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'novo', ?)`)
    .run(uuid(), EMP, b.nome, b.cpf || null, b.email || null, b.telefone || null, b.escola || null, b.curso || null, b.serie || null,
      Number(b.boletim) || null, Number(b.frequencia) || null, nota, total, JSON.stringify(resp), tipoVaga);
  res.json({ ok: true, nota, acertos, total });
});

// ── Dados bancários preenchidos pelo próprio estagiário (link por ficha) ──
router.get('/estagio/ficha/:id', (req, res) => {
  const f = db.prepare(`SELECT nome, banco, agencia, conta, tipo_conta, pix, dados_bancarios_em FROM estagio_ficha WHERE id=? AND empresa_id=?`).get(req.params.id, EMP);
  if (!f) return res.status(404).json({ erro: 'Ficha não encontrada.' });
  const msg = db.prepare(`SELECT valor FROM estagio_config WHERE empresa_id=? AND chave='estagio_banco_msg'`).get(EMP);
  res.json({ nome: f.nome, banco: f.banco || '', agencia: f.agencia || '', conta: f.conta || '', tipo_conta: f.tipo_conta || '', pix: f.pix || '', ja_informou: !!f.dados_bancarios_em, mensagem: msg ? msg.valor : '' });
});
router.post('/estagio/ficha/:id/bancarios', (req, res) => {
  const b = req.body || {};
  const f = db.prepare(`SELECT id FROM estagio_ficha WHERE id=? AND empresa_id=?`).get(req.params.id, EMP);
  if (!f) return res.status(404).json({ erro: 'Ficha não encontrada.' });
  if (!b.pix && !(b.banco && b.conta)) return res.status(400).json({ erro: 'Informe os dados bancários (banco + conta) ou ao menos uma chave PIX.' });
  const temBanco = !!(b.banco && b.conta);
  // só marca "dados bancários informados" quando vierem os dados completos do banco (PIX sozinho não encerra a pendência)
  db.prepare(`UPDATE estagio_ficha SET banco=?, agencia=?, conta=?, tipo_conta=?, pix=?, ${temBanco ? "dados_bancarios_em=datetime('now')," : ''} atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(b.banco || null, b.agencia || null, b.conta || null, b.tipo_conta || null, b.pix || null, req.params.id, EMP);
  res.json({ ok: true, pendente: !temBanco });
});

// ── PORTAL TRADE MARKETING (fornecedor, sem login) ──────────────────────────────────────────
const ROT_PRAZO = { mensal: 'Mensal', semanal: 'Semanal', trimestral: 'Trimestral', periodo: 'Por período' };
const padDoc = (d, n) => { d = soDig(d); return (d && d.length < n) ? d.padStart(n, '0') : d; };

// ── PORTA DE ENTRADA: identificação antes de ver o catálogo (barra curiosos) ──
// Só entra quem tem CNPJ cadastrado (fornecedor no Alpha OU liberado na mão) E CPF existente no Alpha.
router.post('/trade/acesso', async (req, res) => {
  const b = req.body || {};
  const cnpj = soDig(b.cnpj), cpf = soDig(b.cpf);
  const nome = (b.nome || '').trim(), tel = (b.telefone || '').trim(), email = (b.email || '').trim();
  if (cnpj.length !== 14) return res.status(400).json({ erro: 'Informe um CNPJ válido (14 dígitos).' });
  if (cpf.length !== 11) return res.status(400).json({ erro: 'Informe um CPF válido (11 dígitos).' });
  const cnpj14 = padDoc(cnpj, 14), cpf11 = padDoc(cpf, 11);
  // (a) CNPJ cadastrado? liberado na mão OU fornecedor ativo no Alpha
  let via = null, temCnpj = false;
  if (db.prepare(`SELECT 1 FROM tmkt_acesso_liberado WHERE empresa_id=? AND documento=? AND ativo=1`).get(EMP, cnpj14)) { temCnpj = true; via = 'liberado'; }
  if (!temCnpj && habilitado()) {
    try {
      const r = await erpQuery(`SELECT 1 FROM fornecedor f JOIN pessoa pe ON pe.id=f.pessoaid WHERE pe.cnpj IN ($1,$2) LIMIT 1`, [cnpj14, cnpj]);
      if (r && r.length) { temCnpj = true; via = 'alpha'; }
    } catch (e) { /* ERP fora do ar → só a allowlist vale */ }
  }
  // (b) CPF da pessoa existe no Alpha?
  let temCpf = false;
  if (habilitado()) {
    try { const r = await erpQuery(`SELECT 1 FROM pessoa WHERE cpf IN ($1,$2) LIMIT 1`, [cpf11, cpf]); temCpf = !!(r && r.length); } catch (e) { /* ERP fora do ar */ }
  }
  if (temCnpj && temCpf) {
    const token = uuid().replace(/-/g, '');
    db.prepare(`INSERT INTO tmkt_acesso_sessao (token, empresa_id, cnpj, cpf, nome, via) VALUES (?,?,?,?,?,?)`).run(token, EMP, cnpj14, cpf11, nome || null, via);
    return res.json({ ok: true, token, nome });
  }
  // bloqueado → registra interesse p/ a empresa liberar depois
  const motivo = (!temCnpj && !temCpf) ? 'ambos' : (!temCnpj ? 'sem_cnpj' : 'sem_cpf');
  db.prepare(`INSERT INTO tmkt_interesse (id, empresa_id, cnpj, cpf, nome, telefone, email, motivo) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uuid(), EMP, cnpj14, cpf11, nome || null, tel || null, email || null, motivo);
  return res.status(403).json({ ok: false, erro_acesso: true, erro: 'Seu acesso ainda não está liberado. Guardamos seus dados e nosso time comercial vai falar com você.' });
});

// middleware: exige uma sessão de acesso válida (token emitido em /trade/acesso)
function exigeAcesso(req, res, next) {
  const tok = String(req.get('x-acesso') || req.query.acesso || '');
  if (tok && db.prepare('SELECT 1 FROM tmkt_acesso_sessao WHERE token=? AND empresa_id=?').get(tok, EMP)) return next();
  return res.status(401).json({ erro_acesso: true, erro: 'Identifique-se para ver os espaços.' });
}

// ── TRAVAMENTO DE VAGA + DATA (anti double-booking) ──
// vendas que SEGURAM a vaga (tudo que não foi cancelado/recusado)
const OCUPA_STATUS = ['pedido', 'rascunho', 'negociacao', 'confirmado', 'briefing', 'aguardando', 'vendido', 'vigente', 'concluido'];
// dois períodos se sobrepõem? (datas 'YYYY-MM-DD'); sem data = considera sobreposição (conservador)
function periodosSobrepoem(ai, af, bi, bf) {
  if (!ai || !af || !bi || !bf) return true;
  return String(ai) <= String(bf) && String(bi) <= String(af);
}
// quantas vagas de um espaço estão LIVRES no período (desconta reservas ativas que sobrepõem)
function vagasLivres(espacoId, ini, fim, excludeVendaId) {
  const e = db.prepare('SELECT quantidade, limite_dia, limite_mes FROM tmkt_espaco_loja WHERE empresa_id=? AND id=?').get(EMP, espacoId);
  if (!e) return 0;
  let total = Number(e.quantidade) || 1;
  // CAPACIDADE REAL por dia/mês (anti-oversell): se a posição tem teto (ex.: redes — X stories/dia, X/mês),
  // a capacidade na janela pedida é limitada por esse teto, pra não vender mais do que dá pra entregar.
  if ((e.limite_dia != null || e.limite_mes != null) && ini && fim) {
    const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1);
    const meses = Math.max(1, Math.round(dias / 30) || 1);
    const capDia = (e.limite_dia != null && Number(e.limite_dia) > 0) ? Number(e.limite_dia) * dias : Infinity;
    const capMes = (e.limite_mes != null && Number(e.limite_mes) > 0) ? Number(e.limite_mes) * meses : Infinity;
    const capTeto = Math.min(capDia, capMes);
    if (isFinite(capTeto)) total = Math.min(total, capTeto);
  }
  const ph = OCUPA_STATUS.map(() => '?').join(',');
  const rows = db.prepare(`SELECT ve.quantidade q, v.id vid, v.vigencia_ini vi, v.vigencia_fim vf
    FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
    WHERE ve.empresa_id=? AND ve.espaco_id=? AND v.status IN (${ph})`).all(EMP, espacoId, ...OCUPA_STATUS);
  let ocup = 0;
  rows.forEach(r => { if (r.vid !== excludeVendaId && periodosSobrepoem(ini, fim, r.vi, r.vf)) ocup += (Number(r.q) || 1); });
  // TRAVA por PLANO: um plano publicado com período de veiculação reserva as posições amarradas nesse período
  try {
    // a quantidade amarrada é POR COTA → reserva = quantidade × nº de cotas:
    // cota específica (cota_id) usa a qtd daquela cota; comum (cota_id NULL) usa a soma de todas;
    // plano sem cotas cadastradas cai no cota_qtd legado.
    const pl = db.prepare(`SELECT pe.quantidade q, p.veic_ini vi, p.veic_fim vf,
        COALESCE(
          (SELECT c.quantidade FROM tmkt_plano_cotas c WHERE c.id=pe.cota_id),
          (SELECT SUM(c2.quantidade) FROM tmkt_plano_cotas c2 WHERE c2.plano_id=p.id),
          p.cota_qtd, 1) AS cotas
      FROM tmkt_plano_espacos pe JOIN tmkt_plano p ON p.id=pe.plano_id
      WHERE pe.empresa_id=? AND pe.espaco_id=? AND p.status IN ('publicado','vigente') AND p.veic_ini IS NOT NULL AND p.veic_fim IS NOT NULL`).all(EMP, espacoId);
    pl.forEach(r => { if (periodosSobrepoem(ini, fim, r.vi, r.vf)) ocup += (Number(r.q) || 1) * (Number(r.cotas) || 1); });
  } catch (e) { /* tabela nova pode não existir em bases antigas */ }
  return Math.max(0, total - ocup);
}
// tem gente na fila (prioridade) para esse espaço?
function temFila(espacoId) {
  try { return !!db.prepare('SELECT 1 FROM tmkt_fila WHERE empresa_id=? AND espaco_id=? AND COALESCE(atendido,0)=0').get(EMP, espacoId); }
  catch (e) { return false; }
}
// disponibilidade por período (o portal usa para mostrar o que já está esgotado naquelas datas)
router.get('/trade/disponibilidade', exigeAcesso, (req, res) => {
  const ini = req.query.ini || null, fim = req.query.fim || null;
  const rows = db.prepare(`SELECT id, quantidade FROM tmkt_espaco_loja WHERE empresa_id=? AND COALESCE(disponivel,1)=1`).all(EMP);
  const disp = {};
  rows.forEach(e => { disp[e.id] = (ini && fim) ? vagasLivres(e.id, ini, fim) : (Number(e.quantidade) || 1); });
  res.json({ ok: true, disp, periodo: (ini && fim) ? { ini, fim } : null });
});

// catálogo: espaços disponíveis pro fornecedor escolher (foto/tamanho/prazo/preço), por loja/área
router.get('/trade/catalogo', exigeAcesso, (req, res) => {
  const esp = db.prepare(`SELECT id, loja_id, loja_nome, area, espaco, tamanho, prazo_tipo, descricao, preco_unit, quantidade,
    COALESCE(disponivel,1) AS disponivel, COALESCE(destaque,0) AS destaque, COALESCE(segmento,'off') AS segmento,
    COALESCE(modo_venda,'periodo') AS modo_venda, COALESCE(unidade,'mes') AS unidade, (foto IS NOT NULL AND foto<>'') AS tem_foto
    FROM tmkt_espaco_loja WHERE empresa_id=? ORDER BY destaque DESC, loja_nome, area, espaco`).all(EMP);
  res.json({ ok: true, espacos: esp.map(e => ({ ...e, prazo_rotulo: ROT_PRAZO[e.prazo_tipo] || 'Mensal', tem_foto: !!e.tem_foto, ocupado: !e.disponivel, destaque: !!e.destaque })) });
});
// foto do espaço (pública, só leitura)
router.get('/trade/espaco/:id/foto', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!r || !r.foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', 'image/jpeg'); res.send(Buffer.from(String(r.foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// detalhe do espaço (ao clicar no card): descrição, observações e galeria de fotos
router.get('/trade/espaco/:id', exigeAcesso, (req, res) => {
  const e = db.prepare(`SELECT id, loja_id, loja_nome, area, espaco, tamanho, prazo_tipo, descricao, observacoes, preco_unit, quantidade,
    COALESCE(disponivel,1) AS disponivel, COALESCE(destaque,0) AS destaque, (foto IS NOT NULL AND foto<>'') AS tem_foto
    FROM tmkt_espaco_loja WHERE empresa_id=? AND id=?`).get(EMP, req.params.id);
  if (!e) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  const galeria = db.prepare(`SELECT id FROM tmkt_espaco_foto WHERE empresa_id=? AND espaco_id=? ORDER BY ordem, criado_em`).all(EMP, req.params.id).map(g => g.id);
  // fotos = a principal (foto do espaço) + as da galeria
  const fotos = (e.tem_foto ? [API_FOTO(e.id)] : []).concat(galeria.map(gid => `/api/publico/trade/galeria/${gid}/foto`));
  res.json({ ok: true, ...e, prazo_rotulo: ROT_PRAZO[e.prazo_tipo] || 'Mensal', tem_foto: !!e.tem_foto, ocupado: !e.disponivel, destaque: !!e.destaque, fotos });
});
function API_FOTO(id) { return `/api/publico/trade/espaco/${id}/foto`; }
router.get('/trade/galeria/:gid/foto', (req, res) => {
  const r = db.prepare('SELECT foto, tipo_mime FROM tmkt_espaco_foto WHERE id=? AND empresa_id=?').get(req.params.gid, EMP);
  if (!r || !r.foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.tipo_mime || 'image/jpeg'); res.send(Buffer.from(String(r.foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// busca no ERP p/ o escopo dos produtos da ação (produto, fornecedor, laboratório, classificação, caderno)
router.get('/trade/escopo', exigeAcesso, async (req, res) => {
  const tipo = req.query.tipo, q = (req.query.q || '').trim();
  if (!habilitado()) return res.json({ itens: [] });
  if (q.length < 2 && tipo !== 'caderno') return res.json({ itens: [] });
  try {
    let rows = [];
    if (tipo === 'produto') rows = await erpQuery(`SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 25`, [`%${q}%`]);
    else if (tipo === 'fornecedor') rows = await erpQuery(`SELECT f.id, pe.nome FROM fornecedor f JOIN pessoa pe ON pe.id=f.pessoaid WHERE f.status='A' AND pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [`%${q}%`]);
    else if (tipo === 'laboratorio') rows = await erpQuery(`SELECT f.id, pe.nome FROM fabricante f JOIN pessoa pe ON pe.id=f.pessoaid WHERE pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [`%${q}%`]).catch(() => []);
    else if (tipo === 'classificacao') rows = await erpQuery(`SELECT id, nome FROM classificacao WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [`%${q}%`]).catch(() => []);
    else if (tipo === 'caderno') rows = await erpQuery(`SELECT id, nome, to_char(datahorainicial,'DD/MM/YYYY') ini, to_char(datahorafinal,'DD/MM/YYYY') fim FROM cadernooferta WHERE nome ILIKE $1 ORDER BY datahorainicial DESC NULLS LAST LIMIT 25`, [`%${q || ''}%`]).catch(() => []);
    res.json({ itens: rows.map(x => ({ id: String(x.id), nome: x.nome + (x.ini ? ` (${x.ini}–${x.fim})` : ''), ean: x.ean || null })) });
  } catch (e) { res.json({ itens: [], erro: e.message }); }
});
// ── PLANOS COMERCIAIS (ações de maior relevância do ano) ──
const PLANO_PUB = `status IN ('publicado','vigente')`; // "publicado" no portal = status publicado/vigente na gestão
router.get('/trade/planos', exigeAcesso, (req, res) => {
  const rows = db.prepare(`SELECT id, nome, tema, chamada, periodo, cota_tipo, cota_qtd, investimento, destaque, capa_pos,
    (capa_foto IS NOT NULL AND capa_foto<>'') AS tem_capa
    FROM tmkt_plano WHERE empresa_id=? AND ${PLANO_PUB} ORDER BY destaque DESC, ordem, nome`).all(EMP);
  res.json({ ok: true, planos: rows.map(p => ({ ...p, destaque: !!p.destaque, tem_capa: !!p.tem_capa })) });
});
router.get('/trade/plano/:id/capa', (req, res) => {
  const r = db.prepare('SELECT capa_foto FROM tmkt_plano WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!r || !r.capa_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.capa_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', 'image/jpeg'); res.send(Buffer.from(String(r.capa_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
router.get('/trade/plano/:id/foto/:fid', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_plano_fotos WHERE id=? AND plano_id=? AND empresa_id=?').get(req.params.fid, req.params.id, EMP);
  if (!r || !r.foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', 'image/jpeg'); res.send(Buffer.from(String(r.foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
router.get('/trade/plano/:id', exigeAcesso, (req, res) => {
  const p = db.prepare(`SELECT * FROM tmkt_plano WHERE empresa_id=? AND id=? AND ${PLANO_PUB}`).get(EMP, req.params.id);
  if (!p) return res.status(404).json({ erro: 'Plano não encontrado.' });
  const jp = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
  const fotos = db.prepare('SELECT id, legenda, secao FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(EMP, req.params.id);
  // posições amarradas (o que está incluso). cota_id != null → pertence a uma cota (Ouro/Prata/Bronze)
  const links = db.prepare(`SELECT pe.quantidade, pe.cota_id, pe.espaco_id, el.espaco, el.loja_nome, el.segmento
      FROM tmkt_plano_espacos pe JOIN tmkt_espaco_loja el ON el.id=pe.espaco_id
      WHERE pe.empresa_id=? AND pe.plano_id=? ORDER BY el.segmento, el.espaco`).all(EMP, req.params.id);
  const cotas = db.prepare('SELECT id, nome, preco, quantidade, cor, ordem FROM tmkt_plano_cotas WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(EMP, req.params.id)
    .map(c => ({ ...c, incluso: links.filter(l => l.cota_id === c.id) }));
  const inclui = links.filter(l => !l.cota_id); // comum a todas as cotas
  res.json({ ok: true, ...p, provas: jp(p.provas_json), formatos: jp(p.formatos_json), faq: jp(p.faq_json), fotos, cotas, inclui, destaque: !!p.destaque });
});

// ── CALENDÁRIO DE TRADE (portal) — expande recorrências no mês pedido ──
function expandirCalendario(eventos, ano, mes) { // mes 1-12
  const nd = new Date(ano, mes, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  const out = [];
  eventos.forEach(e => {
    const push = dia => {
      const data = `${ano}-${pad(mes)}-${pad(dia)}`;
      if (e.data_ini && data < e.data_ini) return;
      if (e.data_fim && data > e.data_fim) return;
      out.push({ ...e, dia, data });
    };
    if (e.recorrencia === 'semanal' || e.recorrencia === 'quinzenal') {
      for (let d = 1; d <= nd; d++) {
        if (new Date(ano, mes - 1, d).getDay() === Number(e.dia_semana)) {
          if (e.recorrencia === 'quinzenal' && Math.floor((d - 1) / 7) % 2 !== 0) continue; // 1ª e 3ª semana
          push(d);
        }
      }
    } else if (e.recorrencia === 'mensal') {
      if (e.dia_mes >= 1 && e.dia_mes <= nd) push(e.dia_mes);
    } else { // único / campanha
      const ref = e.data || e.data_ini;
      if (ref) { const [y, m] = ref.split('-').map(Number); if (y === ano && m === mes) push(Number(ref.slice(8, 10))); }
    }
  });
  return out.sort((a, b) => a.dia - b.dia);
}
router.get('/trade/calendario', exigeAcesso, (req, res) => {
  const mesStr = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
  const [ano, mes] = mesStr.split('-').map(Number);
  const ev = db.prepare(`SELECT id, nome, tipo, categoria, recorrencia, dia_semana, dia_mes, data, data_ini, data_fim,
      descricao, cor, COALESCE(patrocinavel,1) patrocinavel, preco, plano_id, patrocinador_nome, (comprov_foto IS NOT NULL) AS tem_comprov, (slogan_foto IS NOT NULL) AS tem_slogan
    FROM tmkt_calendario WHERE empresa_id=? AND status='ativo' AND COALESCE(no_trade,0)=1`).all(EMP)
    .map(e => ({ ...e, patrocinavel: !!e.patrocinavel, tem_comprov: !!e.tem_comprov, tem_slogan: !!e.tem_slogan }));
  // posições vinculadas (o que é comercializável em cada ação)
  const linkStmt = db.prepare(`SELECT ce.espaco_id, el.espaco, el.area, el.loja_nome, el.segmento, ce.quantidade,
      el.preco_unit, el.tamanho, el.descricao, el.unidade, el.modo_venda, COALESCE(el.disponivel,1) disponivel, (el.foto IS NOT NULL) AS tem_foto
    FROM tmkt_calendario_espacos ce JOIN tmkt_espaco_loja el ON el.id=ce.espaco_id
    WHERE ce.empresa_id=? AND ce.evento_id=?`);
  ev.forEach(e => { try { e.vinculadas = linkStmt.all(EMP, e.id).map(v => ({ ...v, tem_foto: !!v.tem_foto, disponivel: !!v.disponivel })); } catch (_) { e.vinculadas = []; } });
  res.json({ ok: true, mes: mesStr, dias: expandirCalendario(ev, ano, mes) });
});
router.get('/trade/calendario/:id/slogan', (req, res) => {
  const r = db.prepare('SELECT slogan_foto, slogan_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!r || !r.slogan_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.slogan_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.slogan_mime || 'image/jpeg'); res.send(Buffer.from(String(r.slogan_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
router.get('/trade/calendario/:id/comprovacao', (req, res) => {
  const r = db.prepare('SELECT comprov_foto, comprov_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!r || !r.comprov_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.comprov_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.comprov_mime || 'image/jpeg'); res.send(Buffer.from(String(r.comprov_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});

// fornecedor envia o PEDIDO (entra como pendente de aprovação)
router.post('/trade/pedido', exigeAcesso, (req, res) => {
  const b = req.body || {};
  const espacos = Array.isArray(b.espacos) ? b.espacos : [];
  const cnpj = soDig(b.cnpj);
  if (cnpj.length < 11 || !b.contato_nome) return res.status(400).json({ erro: 'Informe o CNPJ e o nome do contato.' });
  if (!b.email || !b.senha || String(b.senha).length < 4) return res.status(400).json({ erro: 'Informe e-mail e uma senha (mín. 4 caracteres) para acompanhar o pedido.' });
  if (!espacos.length) return res.status(400).json({ erro: 'Escolha ao menos um espaço.' });
  // conta do fornecedor: cria na 1ª compra; nas próximas, confere a senha
  const conta = db.prepare('SELECT senha_hash, email FROM tmkt_fornecedor WHERE empresa_id=? AND cnpj=?').get(EMP, cnpj);
  if (conta && conta.senha_hash) {
    if (!bcrypt.compareSync(String(b.senha), conta.senha_hash)) return res.status(401).json({ erro: 'Já existe conta para este CNPJ. Senha incorreta.' });
  } else {
    db.prepare(`INSERT INTO tmkt_fornecedor (empresa_id, cnpj, nome, email, senha_hash, atualizado_em) VALUES (?,?,?,?,?,datetime('now'))
      ON CONFLICT(empresa_id,cnpj) DO UPDATE SET nome=excluded.nome, email=excluded.email, senha_hash=excluded.senha_hash, atualizado_em=datetime('now')`)
      .run(EMP, cnpj, b.fornecedor_nome || b.contato_nome, b.email, bcrypt.hashSync(String(b.senha), 10));
  }
  // espacos: aceita ['id'] ou [{id, qtd, ...criativo}] — cada espaço é de UMA loja, com quantidade + criativo
  const qtdPorId = {}, criaPorId = {};
  const PRODUCAO_CUSTO = 150;
  espacos.forEach(x => {
    const id = String(x && x.id != null ? x.id : x);
    qtdPorId[id] = Math.max(1, Number(x && x.qtd) || 1);
    if (x && typeof x === 'object') {
      const tipo = ['anexo', 'texto', 'producao'].includes(x.criativo_tipo) ? x.criativo_tipo : (x.arte ? 'anexo' : null);
      criaPorId[id] = {
        insercoes: x.insercoes != null ? Math.max(1, Number(x.insercoes) || 1) : null,
        agenda: x.agenda ? String(x.agenda).slice(0, 2000) : null,
        criativo_tipo: tipo,
        arte_b64: tipo === 'anexo' && x.arte ? String(x.arte).slice(0, 8_000_000) : null,
        arte_mime: tipo === 'anexo' && x.arte ? (x.mime || null) : null,
        criativo_texto: tipo === 'texto' ? String(x.criativo_texto || '').slice(0, 4000) : null,
        producao: tipo === 'producao' ? 1 : 0,
        briefing: x.briefing ? String(x.briefing).slice(0, 4000) : null
      };
    }
  });
  const ids = Object.keys(qtdPorId);
  const place = ids.map(() => '?').join(',');
  const esp = db.prepare(`SELECT * FROM tmkt_espaco_loja WHERE empresa_id=? AND id IN (${place}) AND COALESCE(disponivel,1)=1`).all(EMP, ...ids);
  if (!esp.length) return res.status(400).json({ erro: 'Espaços indisponíveis.' });
  const token = uuid().replace(/-/g, '');
  const vid = uuid();
  const codigo = 'P' + Date.now().toString().slice(-6);
  const prazoDias = Number(b.comprovacao_prazo_dias) || 5;
  const vigIni = b.vigencia_ini || b.periodo_ini || null, vigFim = b.vigencia_fim || b.periodo_fim || null; // período desejado pelo fornecedor
  // ── TRAVAMENTO: exige período e confere se tem vaga nele (anti double-booking) ──
  if (!vigIni || !vigFim) return res.status(400).json({ erro_periodo: true, erro: 'Informe o período da ação (início e fim) para reservar as vagas.' });
  if (String(vigFim) < String(vigIni)) return res.status(400).json({ erro_periodo: true, erro: 'O fim do período não pode ser antes do início.' });
  // quantas "unidades" cada posição cobra, conforme a Un.: por mês × nº de meses do período;
  // inserção × nº de inserções; por período/edição/semana = flat (preço único pela janela).
  const meses = Math.max(1, Math.round((new Date(vigFim) - new Date(vigIni)) / (30 * 864e5)) || 1);
  const fatorCobranca = (e, q, c) => {
    if ((e.modo_venda || 'periodo') === 'insercao') return Math.max(1, Number(c && c.insercoes) || q || 1);
    if (e.unidade === 'mes') return q * meses;
    return q; // periodo | edicao | semana → preço único pela janela
  };
  // valor = soma (preço × fator da Un.) + R$150 por item que pediu produção de arte pela Mutti
  const valor = esp.reduce((s, e) => {
    const base = (Number(e.preco_unit) || 0) * fatorCobranca(e, qtdPorId[e.id] || 1, criaPorId[e.id]);
    const prod = (criaPorId[e.id] && criaPorId[e.id].producao) ? PRODUCAO_CUSTO : 0;
    return s + base + prod;
  }, 0);
  const conflitos = [];
  esp.forEach(e => { const livres = vagasLivres(e.id, vigIni, vigFim); const querido = qtdPorId[e.id] || 1; if (querido > livres) conflitos.push({ id: e.id, espaco: e.espaco, livres, querido }); });
  if (conflitos.length) return res.status(409).json({ erro_vaga: true, erro: 'Algumas posições já estão reservadas nesse período. Escolha outro período, reduza a quantidade ou entre na fila de espera.', conflitos });
  // escopo "por produto" já vira a lista de EANs monitorados (habilita o sell-out na hora)
  const eans = (b.escopo_tipo === 'produto' && Array.isArray(b.escopo_ref)) ? b.escopo_ref.map(x => x.ean).filter(Boolean) : [];
  const meta = b.meta || {};
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO tmkt_vendas (id, empresa_id, codigo, fornecedor_nome, fornecedor_cnpj, contato_nome, contato_email, contato_fone,
      forma_pagamento, valor, status, origem, token, vigencia_ini, vigencia_fim, escopo_tipo, escopo_ref, eans_monitorados,
      meta_compra_valor, meta_escopo_tipo, meta_escopo_ref, meta_periodo_ini, meta_periodo_fim, comprovacao_prazo_dias, observacao, status_desde, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'pedido','portal',?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'), datetime('now'), datetime('now'))`)
      .run(vid, EMP, codigo, b.fornecedor_nome || b.contato_nome, cnpj, b.contato_nome, b.email || b.contato_email || null, b.contato_fone || null,
        b.forma_pagamento || null, Math.round(valor * 100) / 100, token, vigIni, vigFim, b.escopo_tipo || null,
        b.escopo_ref ? JSON.stringify(b.escopo_ref).slice(0, 8000) : null, eans.length ? JSON.stringify(eans) : null,
        meta.valor ? Number(meta.valor) : null, meta.tipo || null, meta.ref ? JSON.stringify(meta.ref).slice(0, 8000) : null,
        meta.ini || vigIni || null, meta.fim || vigFim || null, prazoDias, b.observacao || null);
    if (b.plano_id) { try { db.prepare('UPDATE tmkt_vendas SET plano_id=? WHERE id=?').run(b.plano_id, vid); } catch (e) { /* coluna pode não existir */ } }
    const insEsp = db.prepare(`INSERT INTO tmkt_venda_espacos
      (id, empresa_id, venda_id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_id, loja_nome,
       modo_venda, insercoes, agenda, criativo_tipo, arte_b64, arte_mime, criativo_texto,
       producao, producao_custo, producao_isenta, briefing, briefing_status, arte_status)
      VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?)`);
    esp.forEach(e => {
      const q = qtdPorId[e.id] || 1;
      const c = criaPorId[e.id] || {};
      const prod = c.producao ? 1 : 0;
      const base = (Number(e.preco_unit) || 0) * fatorCobranca(e, q, c);
      // arte_status: produção → "pendente" (Mutti vai produzir); anexo/texto → "enviada"; nada → "pendente"
      const arteStatus = prod ? 'pendente' : (c.criativo_tipo === 'anexo' || c.criativo_tipo === 'texto') ? 'enviada' : 'pendente';
      const briefStatus = c.briefing ? 'enviado' : 'rascunho';
      insEsp.run(uuid(), EMP, vid, e.id, e.espaco, e.area, base + (prod ? PRODUCAO_CUSTO : 0), q, e.loja_id, e.loja_nome,
        e.modo_venda || 'periodo', c.insercoes || null, c.agenda || null, c.criativo_tipo || null,
        c.arte_b64 || null, c.arte_mime || null, c.criativo_texto || null,
        prod, prod ? PRODUCAO_CUSTO : 0, 0, c.briefing || null, briefStatus, arteStatus);
    });
    // parcelas/datas de pagamento informadas
    const pagtos = Array.isArray(b.pagamentos) ? b.pagamentos : [];
    const insP = db.prepare(`INSERT INTO tmkt_parcelas (id, empresa_id, venda_id, numero, vencimento, valor, forma) VALUES (?,?,?,?,?,?,?)`);
    pagtos.forEach((p, i) => { if (p && p.vencimento) insP.run(uuid(), EMP, vid, i + 1, p.vencimento, Number(p.valor) || 0, p.forma || b.forma_pagamento || null); });
  });
  tx();
  res.status(201).json({ ok: true, codigo, token, valor: Math.round(valor * 100) / 100, acompanhamento: `/trade.html?t=${token}` });
});
// login do fornecedor (CNPJ + e-mail + senha) → devolve os pedidos dele pra acompanhar
router.post('/trade/login', (req, res) => {
  const b = req.body || {};
  const cnpj = soDig(b.cnpj);
  const c = db.prepare('SELECT * FROM tmkt_fornecedor WHERE empresa_id=? AND cnpj=?').get(EMP, cnpj);
  if (!c || !c.senha_hash || !bcrypt.compareSync(String(b.senha || ''), c.senha_hash)) return res.status(401).json({ erro: 'CNPJ, e-mail ou senha incorretos.' });
  if (b.email && c.email && String(b.email).toLowerCase() !== String(c.email).toLowerCase()) return res.status(401).json({ erro: 'E-mail não confere com o CNPJ.' });
  const pedidos = db.prepare(`SELECT codigo, token, status, valor, criado_em FROM tmkt_vendas WHERE empresa_id=? AND fornecedor_cnpj=? ORDER BY criado_em DESC`).all(EMP, cnpj);
  res.json({ ok: true, fornecedor: c.nome, pedidos });
});

// panorama de vendas dos produtos (antes × depois) pelo sell-out do ERP
async function selloutPanorama(eans, iniV, fimV) {
  if (!habilitado() || !eans.length) return null;
  const d = n => new Date(n).toISOString().slice(0, 10);
  const hoje = d(Date.now());
  let ini, fim, antIni, antFim;
  if (iniV) { ini = iniV; fim = (fimV && fimV < hoje) ? fimV : hoje; const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 864e5)); antFim = ini; antIni = d(new Date(ini).getTime() - dias * 864e5); }
  else { fim = hoje; ini = d(Date.now() - 30 * 864e5); antFim = ini; antIni = d(new Date(ini).getTime() - 30 * 864e5); }
  const sql = `SELECT COALESCE(sum(iv.quantidade),0) qt, COALESCE(sum(iv.valortotal),0) vl
    FROM itemvenda iv JOIN embalagem e ON e.id=iv.embalagemid JOIN venda v ON v.id=iv.vendaid
    WHERE e.codigobarras = ANY($1::text[]) AND v.status='F' AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)`;
  try {
    const [at, an] = await Promise.all([erpQuery(sql, [eans, ini, fim]), erpQuery(sql, [eans, antIni, antFim])]);
    const atual = { qtd: Number(at[0].qt) || 0, valor: Number(at[0].vl) || 0 };
    const antes = { qtd: Number(an[0].qt) || 0, valor: Number(an[0].vl) || 0 };
    return { iniciou: !!iniV, periodo: { ini, fim }, anterior: { ini: antIni, fim: antFim }, atual, antes,
      variacao: antes.valor ? Math.round((atual.valor - antes.valor) / antes.valor * 100) : null };
  } catch { return null; }
}

// acompanhamento do pedido pelo fornecedor (por token)
router.get('/trade/acompanhamento/:token', async (req, res) => {
  const v = db.prepare(`SELECT id, codigo, fornecedor_nome, status, valor, forma_pagamento, vigencia_ini, vigencia_fim,
    comprovacao_prazo_dias, comprovacao_ate, comprovacao_em, escopo_tipo, escopo_ref, eans_monitorados, observacao, criado_em,
    meta_compra_valor, meta_escopo_tipo, meta_escopo_ref, meta_periodo_ini, meta_periodo_fim, meta_periodicidade
    FROM tmkt_vendas WHERE empresa_id=? AND token=?`).get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const espacos = db.prepare(`SELECT id, espaco_desc, area_desc, loja_nome, valor, COALESCE(quantidade,1) AS quantidade,
    modo_venda, insercoes, agenda, criativo_tipo, criativo_texto, (arte_b64 IS NOT NULL) AS tem_arte, arte_mime,
    COALESCE(producao,0) AS producao, COALESCE(producao_isenta,0) AS producao_isenta,
    briefing, COALESCE(briefing_status,'rascunho') AS briefing_status, COALESCE(arte_status,'pendente') AS arte_status, arte_obs
    FROM tmkt_venda_espacos WHERE venda_id=?`).all(v.id).map(e => ({ ...e, tem_arte: !!e.tem_arte, producao: !!e.producao, producao_isenta: !!e.producao_isenta }));
  const parcelas = db.prepare(`SELECT numero, vencimento, valor, forma, recebido, (comprovante_em IS NOT NULL) AS tem_comprovante FROM tmkt_parcelas WHERE venda_id=? ORDER BY numero`).all(v.id);
  const ROT = { rascunho: 'Rascunho', pedido: 'Pedido enviado — aguardando aprovação', negociacao: 'Em negociação', aprovado: 'Aprovado', vendido: 'Confirmado', confirmado: 'Confirmado', briefing: 'Em briefing / material', aguardando: 'Aguardando liberação', vigente: 'Em veiculação', ativo: 'Em exposição', concluido: 'Concluído', encerrado: 'Encerrado', cancelado: 'Cancelado' };
  const eans = v.eans_monitorados ? (() => { try { return JSON.parse(v.eans_monitorados); } catch { return []; } })() : [];
  // só compara "durante a ação" se a ação já começou; senão mostra o panorama ANTES (baseline 30 dias)
  const hojeStr = new Date().toISOString().slice(0, 10);
  const jaComecou = v.vigencia_ini && v.vigencia_ini <= hojeStr;
  const sellout = eans.length ? await selloutPanorama(eans, jaComecou ? v.vigencia_ini : null, jaComecou ? v.vigencia_fim : null) : null;
  // compromisso de compra DA EMPRESA com o fornecedor (contrapartida) × compras reais do Alpha
  let meta = null;
  if (v.meta_compra_valor && v.meta_escopo_tipo) {
    const refs = v.meta_escopo_ref ? (() => { try { return JSON.parse(v.meta_escopo_ref); } catch { return []; } })() : [];
    const per = periodoCompromisso(v.meta_periodicidade, v.meta_periodo_ini, v.meta_periodo_fim);
    const c = await comprasPorEscopo(v.meta_escopo_tipo, refs, per.ini, per.fim);
    const comprado = c && !c.erro ? c.comprado : 0;
    meta = { valor: v.meta_compra_valor, tipo: v.meta_escopo_tipo, periodicidade: v.meta_periodicidade || 'mensal', refs,
      comprado, pct: v.meta_compra_valor ? Math.round(comprado / v.meta_compra_valor * 100) : null, periodo: per };
  }
  res.json({ ok: true, codigo: v.codigo, fornecedor: v.fornecedor_nome, status: v.status, status_rotulo: ROT[v.status] || v.status,
    valor: v.valor, forma_pagamento: v.forma_pagamento, vigencia_ini: v.vigencia_ini, vigencia_fim: v.vigencia_fim,
    comprovacao_prazo_dias: v.comprovacao_prazo_dias, comprovacao_ate: v.comprovacao_ate, comprovacao_enviada: !!v.comprovacao_em,
    escopo_tipo: v.escopo_tipo, escopo_ref: v.escopo_ref ? JSON.parse(v.escopo_ref) : [], observacao: v.observacao, espacos, parcelas,
    sellout, produtos_definidos: eans.length, meta });
});
// fornecedor envia a comprovação da ação montada (foto)
router.post('/trade/acompanhamento/:token/comprovacao', (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a foto da ação montada.' });
  db.prepare(`UPDATE tmkt_vendas SET comprovacao_foto=?, comprovacao_mime=?, comprovacao_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`)
    .run(b.foto, b.mime || 'image/jpeg', v.id);
  res.json({ ok: true });
});
// fornecedor (RE)ENVIA o material de um item — ex.: após reprovação da arte. Volta p/ "enviada" (aprovação).
router.post('/trade/acompanhamento/:token/item/:iid/material', (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const it = db.prepare('SELECT id FROM tmkt_venda_espacos WHERE id=? AND venda_id=? AND empresa_id=?').get(req.params.iid, v.id, EMP);
  if (!it) return res.status(404).json({ erro: 'Posição não encontrada neste pedido.' });
  const b = req.body || {};
  if (b.arte) {
    db.prepare(`UPDATE tmkt_venda_espacos SET criativo_tipo='anexo', arte_b64=?, arte_mime=?, criativo_texto=NULL, arte_status='enviada', arte_obs=NULL WHERE id=?`)
      .run(String(b.arte).slice(0, 8_000_000), b.mime || null, it.id);
  } else if (b.texto != null) {
    db.prepare(`UPDATE tmkt_venda_espacos SET criativo_tipo='texto', criativo_texto=?, arte_b64=NULL, arte_mime=NULL, arte_status='enviada', arte_obs=NULL WHERE id=?`)
      .run(String(b.texto).slice(0, 4000), it.id);
  } else return res.status(400).json({ erro: 'Envie a arte ou o texto.' });
  res.json({ ok: true });
});
// BRIEFING (chat) — fornecedor lê tudo e escreve observações / anexa arquivos
router.get('/trade/acompanhamento/:token/briefing', (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const msgs = db.prepare(`SELECT id, autor, autor_nome, COALESCE(tipo,'msg') tipo, texto, (anexo_b64 IS NOT NULL) AS tem_anexo, anexo_mime, anexo_nome, criado_em
    FROM tmkt_venda_briefing WHERE empresa_id=? AND venda_id=? ORDER BY criado_em`).all(EMP, v.id).map(m => ({ ...m, tem_anexo: !!m.tem_anexo }));
  res.json({ ok: true, mensagens: msgs });
});
router.post('/trade/acompanhamento/:token/briefing', (req, res) => {
  const v = db.prepare('SELECT id, fornecedor_nome FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const b = req.body || {};
  if (!b.texto && !b.anexo) return res.status(400).json({ erro: 'Escreva algo ou anexe um arquivo.' });
  db.prepare(`INSERT INTO tmkt_venda_briefing (id, empresa_id, venda_id, autor, autor_nome, tipo, texto, anexo_b64, anexo_mime, anexo_nome, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))`)
    .run(uuid(), EMP, v.id, 'fornecedor', v.fornecedor_nome || 'Fornecedor', 'msg',
      b.texto ? String(b.texto).slice(0, 4000) : null, b.anexo ? String(b.anexo).slice(0, 8_000_000) : null, b.mime || null, b.nome || null);
  res.json({ ok: true });
});
router.get('/trade/briefing/:bid/anexo', (req, res) => {
  const r = db.prepare('SELECT anexo_b64, anexo_mime FROM tmkt_venda_briefing WHERE id=? AND empresa_id=?').get(req.params.bid, EMP);
  if (!r || !r.anexo_b64) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.anexo_b64 || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.anexo_mime || 'application/octet-stream'); res.send(Buffer.from(String(r.anexo_b64).replace(/^data:[^,]+,/, ''), 'base64'));
});
// fornecedor INFORMA um pagamento que fez (presta contas depois — ex.: boleto/bonificação que a
// empresa liberou mais tarde). Cria uma parcela já com o comprovante, se houver.
router.post('/trade/acompanhamento/:token/pagamento', (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const b = req.body || {};
  if (!b.valor && !b.foto) return res.status(400).json({ erro: 'Informe o valor ou anexe o comprovante.' });
  const prox = (db.prepare('SELECT COALESCE(MAX(numero),0) m FROM tmkt_parcelas WHERE venda_id=?').get(v.id).m) + 1;
  db.prepare(`INSERT INTO tmkt_parcelas (id, empresa_id, venda_id, numero, vencimento, valor, forma, comprovante_foto, comprovante_mime, comprovante_em)
    VALUES (?,?,?,?,?,?,?,?,?,${b.foto ? "datetime('now')" : 'NULL'})`)
    .run(uuid(), EMP, v.id, prox, b.vencimento || null, Number(b.valor) || 0, b.forma || null, b.foto || null, b.foto ? (b.mime || 'image/jpeg') : null);
  res.status(201).json({ ok: true });
});
// fornecedor anexa o COMPROVANTE DE QUITAÇÃO de uma parcela existente
router.post('/trade/acompanhamento/:token/parcela/:num/comprovante', (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (!req.body || !req.body.foto) return res.status(400).json({ erro: 'Anexe o comprovante.' });
  const r = db.prepare(`UPDATE tmkt_parcelas SET comprovante_foto=?, comprovante_mime=?, comprovante_em=datetime('now') WHERE venda_id=? AND numero=?`)
    .run(req.body.foto, req.body.mime || 'image/jpeg', v.id, Number(req.params.num));
  if (!r.changes) return res.status(404).json({ erro: 'Parcela não encontrada.' });
  res.json({ ok: true });
});
// RECOMPRA: renova as mesmas posições para um novo período (se tiver vaga e NÃO houver fila)
router.post('/trade/acompanhamento/:token/recompra', (req, res) => {
  const b = req.body || {};
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE empresa_id=? AND token=?').get(EMP, req.params.token);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const vi = b.vigencia_ini, vf = b.vigencia_fim;
  if (!vi || !vf) return res.status(400).json({ erro_periodo: true, erro: 'Informe o novo período (início e fim).' });
  if (String(vf) < String(vi)) return res.status(400).json({ erro_periodo: true, erro: 'O fim não pode ser antes do início.' });
  const itens = db.prepare('SELECT espaco_id, espaco_desc, area_desc, valor, quantidade, loja_id, loja_nome FROM tmkt_venda_espacos WHERE empresa_id=? AND venda_id=?').all(EMP, v.id);
  if (!itens.length) return res.status(400).json({ erro: 'Pedido sem posições para recomprar.' });
  // FILA tem prioridade: quem não reservou antes não consegue recomprar se há fila
  const comFila = itens.filter(it => it.espaco_id && temFila(it.espaco_id)).map(it => it.espaco_desc);
  if (comFila.length) return res.status(409).json({ erro_fila: true, erro: 'Há fila de espera para: ' + comFila.join(', ') + '. Como a vaga não foi reservada antes, a prioridade é de quem está na fila — fale com o nosso comercial.' });
  // confere vaga no novo período
  const conflitos = [];
  itens.forEach(it => { if (it.espaco_id) { const livres = vagasLivres(it.espaco_id, vi, vf); if ((Number(it.quantidade) || 1) > livres) conflitos.push({ espaco: it.espaco_desc, livres }); } });
  if (conflitos.length) return res.status(409).json({ erro_vaga: true, erro: 'Sem vaga no novo período para algumas posições.', conflitos });
  const token = uuid().replace(/-/g, ''); const vid = uuid(); const codigo = 'P' + Date.now().toString().slice(-6);
  const valor = itens.reduce((s, it) => s + (Number(it.valor) || 0), 0);
  db.transaction(() => {
    db.prepare(`INSERT INTO tmkt_vendas (id, empresa_id, codigo, fornecedor_nome, fornecedor_cnpj, contato_nome, contato_email, contato_fone, forma_pagamento, valor, status, origem, token, vigencia_ini, vigencia_fim, escopo_tipo, escopo_ref, eans_monitorados, comprovacao_prazo_dias, observacao, status_desde, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'pedido','recompra',?,?,?,?,?,?,?,?, datetime('now'), datetime('now'), datetime('now'))`)
      .run(vid, EMP, codigo, v.fornecedor_nome, v.fornecedor_cnpj, v.contato_nome, v.contato_email, v.contato_fone, v.forma_pagamento, Math.round(valor * 100) / 100, token, vi, vf, v.escopo_tipo, v.escopo_ref, v.eans_monitorados, v.comprovacao_prazo_dias || 5, 'Recompra do pedido ' + v.codigo);
    const insEsp = db.prepare('INSERT INTO tmkt_venda_espacos (id, empresa_id, venda_id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_id, loja_nome) VALUES (?,?,?,?,?,?,?,?,?,?)');
    itens.forEach(it => insEsp.run(uuid(), EMP, vid, it.espaco_id, it.espaco_desc, it.area_desc, it.valor, it.quantidade, it.loja_id, it.loja_nome));
  })();
  res.status(201).json({ ok: true, codigo, token, valor: Math.round(valor * 100) / 100, acompanhamento: `/trade.html?t=${token}` });
});
// entrar na FILA DE ESPERA de um espaço ocupado
router.post('/trade/fila', exigeAcesso, (req, res) => {
  const b = req.body || {};
  if (!b.espaco_id || !b.cnpj || !b.contato_nome) return res.status(400).json({ erro: 'Informe o espaço, CNPJ e seu nome.' });
  const e = db.prepare('SELECT espaco, loja_nome FROM tmkt_espaco_loja WHERE empresa_id=? AND id=?').get(EMP, String(b.espaco_id));
  if (!e) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  db.prepare(`INSERT INTO tmkt_fila (id, empresa_id, espaco_id, cnpj, fornecedor_nome, contato_nome, contato_email, contato_fone, periodo_ini, periodo_fim, observacao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), EMP, String(b.espaco_id), soDig(b.cnpj), b.fornecedor_nome || b.contato_nome, b.contato_nome, b.contato_email || null, b.contato_fone || null, b.periodo_ini || null, b.periodo_fim || null, b.observacao || null);
  const pos = db.prepare(`SELECT COUNT(*) n FROM tmkt_fila WHERE empresa_id=? AND espaco_id=? AND status='esperando'`).get(EMP, String(b.espaco_id)).n;
  res.status(201).json({ ok: true, espaco: e.espaco, loja: e.loja_nome, posicao: pos });
});

// janela do compromisso conforme a periodicidade (mensal/trimestral/semestral) ou período fixo
function periodoCompromisso(periodicidade, iniFixo, fimFixo) {
  const d = x => x.toISOString().slice(0, 10);
  if (iniFixo && fimFixo) return { ini: iniFixo, fim: fimFixo };
  const n = new Date();
  if (periodicidade === 'trimestral') { const q = Math.floor(n.getMonth() / 3); return { ini: d(new Date(n.getFullYear(), q * 3, 1)), fim: d(new Date(n.getFullYear(), q * 3 + 3, 0)) }; }
  if (periodicidade === 'semestral') { const h = n.getMonth() < 6 ? 0 : 6; return { ini: d(new Date(n.getFullYear(), h, 1)), fim: d(new Date(n.getFullYear(), h + 6, 0)) }; }
  return { ini: d(new Date(n.getFullYear(), n.getMonth(), 1)), fim: d(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
}

// COMPRA (entrada do Alpha) por escopo — mede a contrapartida (compromisso de compra da empresa)
async function comprasPorEscopo(tipo, refs, ini, fim) {
  if (!habilitado() || !Array.isArray(refs) || !refs.length) return null;
  const d = n => new Date(n).toISOString().slice(0, 10);
  const pIni = ini || d(Date.now() - 90 * 864e5), pFim = fim || d(Date.now());
  const base = `FROM itemnotafiscal it JOIN notafiscal nf ON nf.id=it.notafiscalid`;
  const per = `nf.datahoraentrada >= $PI::date AND nf.datahoraentrada < ($PF::date + 1)`;
  let sql, params;
  try {
    if (tipo === 'produto') { const eans = refs.map(r => r.ean).filter(Boolean); if (!eans.length) return null; sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE it.codigobarras = ANY($1::text[]) AND ${per.replace('$PI', '$2').replace('$PF', '$3')}`; params = [eans, pIni, pFim]; }
    else if (tipo === 'fornecedor') { const ids = refs.map(r => Number(r.id)).filter(Boolean); sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE nf.fornecedorid = ANY($1::bigint[]) AND ${per.replace('$PI', '$2').replace('$PF', '$3')}`; params = [ids, pIni, pFim]; }
    else if (tipo === 'laboratorio') { const ids = refs.map(r => Number(r.id)).filter(Boolean); sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN produto pr ON pr.id=e.produtoid WHERE pr.fabricanteid = ANY($1::bigint[]) AND ${per.replace('$PI', '$2').replace('$PF', '$3')}`; params = [ids, pIni, pFim]; }
    else if (tipo === 'classificacao' || tipo === 'grupo') { const ids = refs.map(r => Number(r.id)).filter(Boolean); sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid WHERE cp.classificacaoid = ANY($1::bigint[]) AND ${per.replace('$PI', '$2').replace('$PF', '$3')}`; params = [ids, pIni, pFim]; }
    else return null;
    const r = await erpQuery(sql, params);
    return { comprado: Number(r[0].v) || 0, periodo: { ini: pIni, fim: pFim } };
  } catch (e) { return { erro: e.message }; }
}

module.exports = router;
