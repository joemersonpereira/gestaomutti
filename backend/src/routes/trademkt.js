// trademkt.js — Trade Marketing: aluguel de espaços da loja a fornecedores (áreas/espaços, vendas, parcelas, sell-out do ERP).
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { auth, exigePerfil } = require('../middleware/auth');
const { enviarEmail, smtpOk } = require('../lib/mailer');
const { cobrarVenda } = require('../lib/cobranca');
const outreach = require('../lib/trade-outreach');

const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];
// fluxo do Kanban (Joe 2026-10-16): rascunho → negociação → confirmado → briefing (material/arte pendente)
// → aguardando (liberar veiculação) → vigente (em veiculação) → encerrado. 'pedido' = entrada do portal (cai em Negociação).
const STATUS = ['rascunho', 'pedido', 'negociacao', 'confirmado', 'briefing', 'aguardando', 'vigente', 'comprovacao', 'encerrado', 'perdido', 'cancelado'];
router.use(auth);
// cache de ERP por rota (sell-out e lookups /erp/*). Aplicado só nessas rotas (o router tem portal
// público + GETs com exigePerfil, então router-wide não é seguro aqui). Sell-out do dia atrasa até 1h.
const { cacheMiddleware: _tradeCacheMw } = require('../lib/erpCache');
const tradeCache = _tradeCacheMw('trade');

// ── Grupos econômicos (agrupar fornecedores) ────────────────────────────────
router.get('/grupos-economicos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const grupos = db.prepare('SELECT * FROM tmkt_grupos_economicos WHERE empresa_id=? ORDER BY nome').all(emp);
  const forn = db.prepare('SELECT * FROM tmkt_grupo_fornecedores WHERE empresa_id=? ORDER BY fornecedor_nome').all(emp);
  res.json({ grupos: grupos.map(g => ({ ...g, fornecedores: forn.filter(f => f.grupo_id === g.id) })) });
});
router.post('/grupos-economicos', exigePerfil(...GESTAO), (req, res) => {
  if (!req.body.nome) return res.status(400).json({ erro: 'Informe o nome do grupo.' });
  const id = uuid();
  db.prepare('INSERT INTO tmkt_grupos_economicos (id,empresa_id,nome,observacao) VALUES (?,?,?,?)').run(id, req.usuario.empresa_id, req.body.nome, req.body.observacao || null);
  res.json({ ok: true, id });
});
router.delete('/grupos-economicos/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_grupo_fornecedores WHERE grupo_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_grupos_economicos WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
router.post('/grupos-economicos/:id/fornecedor', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.fornecedor_id) return res.status(400).json({ erro: 'Selecione o fornecedor.' });
  const ja = db.prepare('SELECT 1 FROM tmkt_grupo_fornecedores WHERE grupo_id=? AND fornecedor_id=?').get(req.params.id, String(b.fornecedor_id));
  if (ja) return res.json({ ok: true, jaExistia: true });
  db.prepare('INSERT INTO tmkt_grupo_fornecedores (id,empresa_id,grupo_id,fornecedor_id,fornecedor_nome) VALUES (?,?,?,?,?)')
    .run(uuid(), req.usuario.empresa_id, req.params.id, String(b.fornecedor_id), b.fornecedor_nome || null);
  res.json({ ok: true });
});
router.delete('/grupos-economicos/fornecedor/:fid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_grupo_fornecedores WHERE id=? AND empresa_id=?').run(req.params.fid, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Modelo de contrato com placeholders (@Fornecedor, @Valor, @VigenciaInicio…) ──
const OBJETO_PADRAO = 'Cessão onerosa de espaço(s) comercial(is) nas lojas do Grupo Mutti ao CESSIONÁRIO, para exposição e ativação dos produtos/marcas indicados, durante a vigência e nas condições abaixo.';
// Dados da matriz que CEDE o espaço (editáveis por config; padrão informado pelo Joe).
function cedenteDe(emp) {
  const g = k => db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?").get(emp, k)?.valor;
  return {
    nome: g('tmkt_cedente_nome') || 'FARMÁCIA MUTTI LTDA',
    cnpj: g('tmkt_cedente_cnpj') || '18.681.698/0003-85',
    endereco: g('tmkt_cedente_endereco') || 'Praça Barão do Rio Branco, nº 59, Centro, Entre Rios-BA, CEP 48.180-000',
    comarca: g('tmkt_cedente_comarca') || 'Entre Rios/BA',
  };
}
const TEMPLATE_PADRAO = `CONTRATO DE CESSÃO DE ESPAÇO COMERCIAL — @Codigo

CEDENTE: @Cedente — CNPJ @CedenteCnpj
Endereço: @CedenteEndereco

CESSIONÁRIO (fornecedor): @Fornecedor — CNPJ @FornecedorCnpj
Endereço: @CessionarioEndereco
Neste ato representado por @Representante.

As partes acima qualificadas têm, entre si, justo e contratado o presente Contrato de Cessão de Espaço Comercial, que se regerá pelas cláusulas e condições seguintes.

CLÁUSULA 1ª — DO OBJETO
@Objeto

CLÁUSULA 2ª — DOS ESPAÇOS E LOJAS
Lojas participantes: @Lojas
Espaços cedidos:
@Espacos

CLÁUSULA 3ª — DA VIGÊNCIA
O presente contrato vigora de @VigenciaInicio a @VigenciaFim.

CLÁUSULA 4ª — DO VALOR E DA FORMA DE PAGAMENTO
Valor total: @Valor. Forma de pagamento: @FormaPagamento.
Cronograma de pagamento (previsão):
@Parcelas

CLÁUSULA 5ª — DA INADIMPLÊNCIA E RESPONSABILIDADE
O descumprimento do acordo de pagamento pelo CESSIONÁRIO sujeita-o, independentemente de notificação prévia, a multa de 2% (dois por cento) sobre o valor em atraso, juros de mora de 1% (um por cento) ao mês e correção monetária, facultando à CEDENTE suspender imediatamente a veiculação e retirar o material cedido, sem prejuízo da cobrança integral dos valores devidos e das demais medidas judiciais e extrajudiciais cabíveis.

CLÁUSULA 6ª — DAS OBRIGAÇÕES
O CESSIONÁRIO é responsável pelo material exposto, por sua reposição e pela conformidade dos produtos. A CEDENTE garante a disponibilização do(s) espaço(s) contratado(s) durante a vigência, conforme o briefing acordado.

CLÁUSULA 7ª — DO FORO
Fica eleito o foro da comarca de @CedenteForo para dirimir eventuais dúvidas ou litígios oriundos deste contrato.

Tema / campanha: @Tema

Entre Rios-BA, @DataHoje.`;
const dBRr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const moneyBR = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

router.get('/contrato-template', (req, res) => {
  const r = db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='tmkt_contrato_template'").get(req.usuario.empresa_id);
  res.json({ template: r?.valor || TEMPLATE_PADRAO, padrao: TEMPLATE_PADRAO });
});
router.post('/contrato-template', exigePerfil(...GESTAO), (req, res) => {
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,'tmkt_contrato_template',?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(req.usuario.empresa_id, String(req.body.template || ''));
  res.json({ ok: true });
});
// Gera o texto do contrato de uma venda (preenche os @placeholders). c = linha tmkt_contrato (objeto, partes).
async function gerarContratoTexto(emp, v, c) {
  let tmpl = (db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='tmkt_contrato_template'").get(emp)?.valor) || TEMPLATE_PADRAO;
  // garante que CEDENTE/OBJETO/representante apareçam mesmo em templates antigos
  if (!tmpl.includes('@Cedente')) tmpl = tmpl.replace(/(\r?\n)/, '$1\nCEDENTE: @Cedente — CNPJ @CedenteCnpj\nEndereço: @CedenteEndereco\nNeste ato representado por @Representante.\n');
  if (!tmpl.includes('@Objeto')) tmpl = tmpl.replace(/(\n\s*\n|$)/, '\n\nOBJETO:\n@Objeto\n$1');
  const ced = cedenteDe(emp);
  const esp = db.prepare('SELECT * FROM tmkt_venda_espacos WHERE venda_id=? ORDER BY loja_nome, area_desc').all(v.id);
  const lojas = [...new Set(esp.map(e => e.loja_nome).filter(Boolean))].join(', ') || (v.loja_id ? '' : '—');
  const espTxt = esp.length ? esp.map(e => `  • ${e.loja_nome ? e.loja_nome + ' — ' : ''}${e.area_desc ? e.area_desc + ' · ' : ''}${e.espaco_desc}${e.slot ? ' (vaga ' + e.slot + ')' : ''} — ${moneyBR(e.valor)}`).join('\n') : '  (nenhum)';
  const parc = db.prepare('SELECT numero,vencimento,valor,forma FROM tmkt_parcelas WHERE venda_id=? ORDER BY numero').all(v.id);
  const parcTxt = parc.length ? parc.map(p => `  • Parcela ${p.numero} — venc. ${dBRr(p.vencimento)} — ${moneyBR(p.valor)}${p.forma ? ' (' + p.forma + ')' : ''}`).join('\n') : '  • Pagamento à vista / conforme acima.';
  let cnpjErp = '';
  if (!(c && c.contratante_cnpj) && habilitado() && v.fornecedor_id) {
    try { const r = await erpQuery('SELECT COALESCE(p.cnpj, p.cnpjcpf) doc FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.id=$1::bigint', [v.fornecedor_id]); cnpjErp = r[0]?.doc || ''; } catch { /* pode não ter cnpj */ }
  }
  const foNome = (c && c.contratante_nome) || v.fornecedor_nome || '—';
  const foCnpj = (c && c.contratante_cnpj) || cnpjErp || '—';
  const foEnd = (c && c.contratante_endereco) || '—';
  const fmtCpf = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d; };
  const rep = (c && c.representante_nome) ? `${c.representante_nome}${c.representante_cpf ? ', CPF ' + fmtCpf(c.representante_cpf) : ''}` : '—';
  const mapa = {
    '@Codigo': v.codigo || '', '@Fornecedor': foNome, '@FornecedorCnpj': foCnpj, '@CessionarioEndereco': foEnd, '@Representante': rep,
    '@Cedente': ced.nome, '@CedenteCnpj': ced.cnpj, '@CedenteEndereco': ced.endereco, '@CedenteForo': ced.comarca,
    '@Tema': v.tema_desc || '—', '@VigenciaInicio': dBRr(v.vigencia_ini), '@VigenciaFim': dBRr(v.vigencia_fim),
    '@FormaPagamento': v.forma_pagamento || '—', '@Valor': moneyBR(v.valor), '@Lojas': lojas || '—',
    '@Espacos': espTxt, '@Parcelas': parcTxt, '@DataHoje': dBRr(new Date().toISOString()), '@Objeto': ((c && c.objeto) || OBJETO_PADRAO),
  };
  return tmpl.replace(/@[A-Za-zçÇ]+/g, m => (m in mapa ? mapa[m] : m));
}
function contratoRow(emp, vendaId) {
  return db.prepare('SELECT * FROM tmkt_contrato WHERE empresa_id=? AND venda_id=?').get(emp, vendaId);
}
router.get('/vendas/:id/contrato', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const c = contratoRow(emp, v.id);
  const ced = cedenteDe(emp);
  // assinado = mostra o corpo "congelado" do momento da assinatura; senão, regenera ao vivo
  const texto = (c && c.status === 'assinado' && c.corpo) ? c.corpo : await gerarContratoTexto(emp, v, c);
  const temFinanceiro = !!((Number(v.valor) || 0) > 0 && v.forma_pagamento);
  res.json({
    texto, codigo: v.codigo,
    objeto: c?.objeto != null ? c.objeto : OBJETO_PADRAO,
    contratante_nome: c?.contratante_nome || '', contratante_cnpj: c?.contratante_cnpj || '', contratante_endereco: c?.contratante_endereco || '',
    fornecedor_nome: v.fornecedor_nome || '',
    representante_nome: c?.representante_nome || '', representante_cpf: c?.representante_cpf || '',
    cedente: ced, temFinanceiro,
    status: c?.status || 'rascunho',
    token: c?.token || null,
    assinante_nome: c?.assinante_nome || null, assinante_doc: c?.assinante_doc || null,
    ip: c?.ip || null, assinado_em: c?.assinado_em || null, solicitado_em: c?.solicitado_em || null,
    tem_selfie: !!(c && c.selfie_img), tem_documento: !!(c && c.documento_img), tem_assinatura: !!(c && c.assinatura_img),
  });
});
// Salva OBJETO + dados editáveis do contratante e do representante (upsert em rascunho).
router.put('/vendas/:id/contrato', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const c = contratoRow(emp, v.id);
  if (c && c.status === 'assinado') return res.status(400).json({ erro: 'Contrato já assinado — não pode ser alterado.' });
  const campos = {
    objeto: String(b.objeto != null ? b.objeto : (c?.objeto ?? '')).trim(),
    contratante_nome: (b.contratante_nome ?? c?.contratante_nome ?? '') || null,
    contratante_cnpj: (b.contratante_cnpj ?? c?.contratante_cnpj ?? '') || null,
    contratante_endereco: (b.contratante_endereco ?? c?.contratante_endereco ?? '') || null,
    representante_nome: (b.representante_nome ?? c?.representante_nome ?? '') || null,
    representante_cpf: (soDig(b.representante_cpf ?? c?.representante_cpf ?? '')) || null,
  };
  if (c) db.prepare(`UPDATE tmkt_contrato SET objeto=?, contratante_nome=?, contratante_cnpj=?, contratante_endereco=?, representante_nome=?, representante_cpf=? WHERE id=?`)
    .run(campos.objeto, campos.contratante_nome, campos.contratante_cnpj, campos.contratante_endereco, campos.representante_nome, campos.representante_cpf, c.id);
  else db.prepare(`INSERT INTO tmkt_contrato (id,empresa_id,venda_id,objeto,contratante_nome,contratante_cnpj,contratante_endereco,representante_nome,representante_cpf,status) VALUES (?,?,?,?,?,?,?,?,?, 'rascunho')`)
    .run(uuid(), emp, v.id, campos.objeto, campos.contratante_nome, campos.contratante_cnpj, campos.contratante_endereco, campos.representante_nome, campos.representante_cpf);
  res.json({ ok: true });
});
// Solicita assinatura: exige financeiro e representante (nome+CPF), congela o corpo, gera o token.
router.post('/vendas/:id/contrato/solicitar', exigePerfil(...GESTAO), async (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  let c = contratoRow(emp, v.id);
  if (c && c.status === 'assinado') return res.status(400).json({ erro: 'Contrato já assinado.' });
  if (!((Number(v.valor) || 0) > 0 && v.forma_pagamento)) return res.status(400).json({ erro: 'Preencha o financeiro da negociação (valor e forma de pagamento) antes de gerar o contrato — pode ser uma previsão.' });
  if (!(c && c.representante_nome && c.representante_cpf)) return res.status(400).json({ erro: 'Informe quem vai assinar pela empresa (nome + CPF) — o CPF precisa bater na hora de assinar.' });
  const corpo = await gerarContratoTexto(emp, v, c);
  const token = uuid().replace(/-/g, '');
  db.prepare("UPDATE tmkt_contrato SET corpo=?, token=?, status='aguardando', solicitado_em=datetime('now') WHERE id=?").run(corpo, token, c.id);
  res.json({ ok: true, token });
});
// Cancela a solicitação (volta a rascunho) — só se ainda não assinou.
router.post('/vendas/:id/contrato/cancelar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const c = db.prepare('SELECT c.* FROM tmkt_contrato c JOIN tmkt_vendas v ON v.id=c.venda_id WHERE v.id=? AND v.empresa_id=?').get(req.params.id, emp);
  if (!c) return res.status(404).json({ erro: 'Sem contrato.' });
  if (c.status === 'assinado') return res.status(400).json({ erro: 'Já assinado.' });
  db.prepare("UPDATE tmkt_contrato SET status='rascunho', token=NULL WHERE id=?").run(c.id);
  res.json({ ok: true });
});
// Serve as evidências da assinatura (selfie | documento | assinatura) — só gestão.
router.get('/vendas/:id/contrato/evidencia/:tipo', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const col = { selfie: 'selfie_img', documento: 'documento_img', assinatura: 'assinatura_img' }[req.params.tipo];
  if (!col) return res.status(404).end();
  const c = db.prepare(`SELECT c.${col} img FROM tmkt_contrato c JOIN tmkt_vendas v ON v.id=c.venda_id WHERE v.id=? AND v.empresa_id=?`).get(req.params.id, emp);
  const m = c && c.img && /^data:([^;]+);base64,(.+)$/.exec(c.img);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]); res.send(Buffer.from(m[2], 'base64'));
});

function proximoCodigo(emp) {
  const ano = new Date().getFullYear();
  const n = db.prepare("SELECT COUNT(*) c FROM tmkt_vendas WHERE empresa_id=? AND codigo LIKE ?").get(emp, `TM-${ano}-%`).c + 1;
  return `TM-${ano}-${String(n).padStart(5, '0')}`;
}

// ── Cadastros: áreas, espaços, temas ─────────────────────────────────────
router.get('/cadastros', (req, res) => {
  const emp = req.usuario.empresa_id;
  res.json({
    areas: db.prepare(`SELECT a.id, a.empresa_id, a.descricao, a.canal, a.tamanho, a.detalhe, a.cobranca, a.ordem, a.criado_em,
        (SELECT COUNT(*) FROM tmkt_area_fotos f WHERE f.area_id=a.id) nfotos
      FROM tmkt_areas a WHERE a.empresa_id=? ORDER BY a.ordem, a.descricao`).all(emp),
    espacos: db.prepare('SELECT * FROM tmkt_espacos WHERE empresa_id=? ORDER BY descricao').all(emp),
    temas: db.prepare('SELECT * FROM tmkt_temas WHERE empresa_id=? ORDER BY descricao').all(emp),
  });
});
// ── Áreas detalhadas (canal/tamanho/descrição + fotos) ─────────────────────
const CANAIS = ['fisico', 'encarte', 'ecommerce', 'social', 'crm_filipeta', 'crm_pdv', 'radio_ext', 'radio_int', 'endomarketing'];
const COBRANCAS = ['mensal', 'insercao', 'diario', 'unidade', 'hora'];
const normCobranca = v => (COBRANCAS.includes(v) ? v : null);
router.post('/areas', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.descricao) return res.status(400).json({ erro: 'Informe o nome da área.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_areas (id,empresa_id,descricao,canal,tamanho,detalhe,cobranca,ordem,criado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.descricao, CANAIS.includes(b.canal) ? b.canal : 'fisico', b.tamanho || null, b.detalhe || null, normCobranca(b.cobranca), Number(b.ordem) || 0);
  res.json({ ok: true, id });
});
router.put('/areas/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body, emp = req.usuario.empresa_id;
  const atual = db.prepare('SELECT id FROM tmkt_areas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!atual) return res.status(404).json({ erro: 'Área não encontrada.' });
  const campos = { descricao: v => v, canal: v => CANAIS.includes(v) ? v : null, tamanho: v => v, detalhe: v => v, cobranca: normCobranca, ordem: v => Number(v) || 0 };
  const sets = [], vals = [];
  for (const [k, norm] of Object.entries(campos)) if (k in b) { sets.push(`${k}=?`); vals.push(norm(b[k])); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_areas SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/areas/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_area_fotos WHERE area_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_areas WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
// Fotos da área (várias) — base64, leitura/gravação próprias
router.get('/areas/:id/fotos', (req, res) => {
  const rows = db.prepare('SELECT id, foto, legenda, ordem FROM tmkt_area_fotos WHERE area_id=? AND empresa_id=? ORDER BY ordem, criado_em')
    .all(req.params.id, req.usuario.empresa_id);
  res.json({ fotos: rows });
});
router.post('/areas/:id/fotos', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body, emp = req.usuario.empresa_id;
  if (!b.foto || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(b.foto)) return res.status(400).json({ erro: 'Envie uma imagem.' });
  if (!db.prepare('SELECT 1 FROM tmkt_areas WHERE id=? AND empresa_id=?').get(req.params.id, emp)) return res.status(404).json({ erro: 'Área não encontrada.' });
  const n = db.prepare('SELECT COUNT(*) c FROM tmkt_area_fotos WHERE area_id=?').get(req.params.id).c;
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_area_fotos (id,empresa_id,area_id,foto,legenda,ordem,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`)
    .run(id, emp, req.params.id, b.foto, b.legenda || null, n);
  res.json({ ok: true, id });
});
router.delete('/areas/fotos/:fid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_area_fotos WHERE id=? AND empresa_id=?').run(req.params.fid, req.usuario.empresa_id);
  res.json({ ok: true });
});
const tabelaOk = t => ({ areas: 'tmkt_areas', temas: 'tmkt_temas' }[t]);
router.post('/cadastros/:tipo', exigePerfil(...GESTAO), (req, res) => {
  const t = tabelaOk(req.params.tipo);
  if (!t || !req.body.descricao) return res.status(400).json({ erro: 'Dados inválidos.' });
  const id = uuid();
  db.prepare(`INSERT INTO ${t} (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`).run(id, req.usuario.empresa_id, req.body.descricao);
  res.json({ ok: true, id });
});
router.delete('/cadastros/:tipo/:id', exigePerfil(...GESTAO), (req, res) => {
  const t = tabelaOk(req.params.tipo);
  if (!t) return res.status(400).json({ erro: 'Tipo inválido.' });
  db.prepare(`DELETE FROM ${t} WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// Espaços (têm área + valor de referência)
router.post('/espacos', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.descricao) return res.status(400).json({ erro: 'Informe a descrição.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_espacos (id,empresa_id,area_id,descricao,observacoes,valor_ref,tamanho,cobranca,criado_em) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.area_id || null, b.descricao, b.observacoes || null, Number(b.valor_ref) || 0, b.tamanho || null, normCobranca(b.cobranca));
  res.json({ ok: true, id });
});
router.put('/espacos/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body, emp = req.usuario.empresa_id;
  if (!db.prepare('SELECT 1 FROM tmkt_espacos WHERE id=? AND empresa_id=?').get(req.params.id, emp)) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  const campos = { descricao: v => v, area_id: v => v || null, valor_ref: v => Number(v) || 0, tamanho: v => v || null, cobranca: normCobranca, observacoes: v => v || null };
  const sets = [], vals = [];
  for (const [k, norm] of Object.entries(campos)) if (k in b) { sets.push(`${k}=?`); vals.push(norm(b[k])); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_espacos SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/espacos/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_espacos WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Dashboard: KPIs + performance por loja (filtro opcional por loja).
router.get('/dashboard', (req, res) => {
  const emp = req.usuario.empresa_id, loja = req.query.loja;
  const el = db.prepare(`SELECT loja_nome, loja_id, SUM(quantidade) total, SUM(quantidade*preco_unit) potencial
    FROM tmkt_espaco_loja WHERE empresa_id=? ${loja ? 'AND loja_nome=?' : ''} GROUP BY loja_nome, loja_id`).all(...(loja ? [emp, loja] : [emp]));
  // vendidos/receita por loja (vendas vigentes/concluídas)
  // vendidos e receita atribuídos à loja do ESPAÇO vendido (negociação pode ter espaços de várias lojas)
  // "vendido/ocupado" = negócio COMPROMETIDO (fechado), não só os já vigentes — senão um confirmado
  // de R$ 3.700 aparece como "tudo disponível". Mesma régua do resto do sistema (menos rascunho/pedido/negociação, que ainda não fecharam).
  const vend = db.prepare(`SELECT COALESCE(ve.loja_id, v.loja_id) loja_id, COUNT(ve.id) vendidos, COALESCE(SUM(ve.valor) FILTER (WHERE COALESCE(v.uso_interno,0)=0),0) receita
    FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id WHERE v.empresa_id=? AND v.status IN ('confirmado','briefing','aguardando','vigente','comprovacao','vendido','concluido','encerrado') AND COALESCE(v.nao_ocupa,0)=0
    GROUP BY COALESCE(ve.loja_id, v.loja_id)`).all(emp).reduce((m, r) => (m[r.loja_id] = r, m), {});
  const monitorados = db.prepare(`SELECT COALESCE(SUM(json_array_length(eans_monitorados)),0) n FROM tmkt_vendas WHERE empresa_id=? AND eans_monitorados IS NOT NULL`).get(emp).n || 0;

  const lojas = el.map(r => {
    const vendidos = (vend[r.loja_id] || {}).vendidos || 0;
    const rec = (vend[r.loja_id] || {}).receita || 0;
    const total = r.total || 0;
    return { loja: r.loja_nome, total, vendidos, disponiveis: total - vendidos, ocupacao: total ? Math.round(vendidos / total * 100) : 0, receita: rec, potencial: r.potencial || 0 };
  }).sort((a, b) => b.potencial - a.potencial);

  const tot = lojas.reduce((a, l) => ({ total: a.total + l.total, vendidos: a.vendidos + l.vendidos, potencial: a.potencial + l.potencial, receita: a.receita + l.receita }), { total: 0, vendidos: 0, potencial: 0, receita: 0 });
  // funil por status (negociações reais), ignorando canceladas/recusadas
  const pipeline = db.prepare(`SELECT status, COUNT(*) n, COALESCE(SUM(valor),0) valor
    FROM tmkt_vendas WHERE empresa_id=? AND status NOT IN ('cancelado','recusado','perdido') GROUP BY status`).all(emp)
    .reduce((m, r) => (m[r.status] = { n: r.n, valor: r.valor }, m), {});
  // financeiro: vendido (negócios fechados), a receber e recebido
  const vendidoTotal = db.prepare(`SELECT COALESCE(SUM(valor),0) v FROM tmkt_vendas WHERE empresa_id=? AND status IN ('confirmado','vendido','vigente','comprovacao','concluido','encerrado') AND COALESCE(uso_interno,0)=0`).get(emp).v || 0;
  // pendente = negociações ainda em aberto (não fecharam nem foram perdidas) — o pipeline em R$
  const pendenteRow = db.prepare(`SELECT COALESCE(SUM(valor),0) v, COUNT(*) n FROM tmkt_vendas WHERE empresa_id=? AND status IN ('pedido','rascunho','negociacao') AND COALESCE(uso_interno,0)=0`).get(emp);
  const pendenteTotal = pendenteRow.v || 0, pendenteQtd = pendenteRow.n || 0;
  // "deixado de ganhar": espaços usados pela PRÓPRIA empresa (uso interno) — ocupam mas não geram receita
  const diRow = db.prepare(`SELECT COALESCE(SUM(valor),0) v, COUNT(*) n FROM tmkt_vendas WHERE empresa_id=? AND COALESCE(uso_interno,0)=1 AND status NOT IN ('cancelado','recusado','perdido')`).get(emp);
  const deixadoGanhar = diRow.v || 0, usoInternoQtd = diRow.n || 0;
  const aReceber = db.prepare(`SELECT COALESCE(SUM(p.valor),0) v FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id WHERE p.empresa_id=? AND COALESCE(p.recebido,0)=0 AND v.status NOT IN ('cancelado','perdido')`).get(emp).v || 0;
  const recebido = db.prepare(`SELECT COALESCE(SUM(recebido_valor),0) v FROM tmkt_parcelas WHERE empresa_id=? AND recebido=1`).get(emp).v || 0;
  // negociações recentes
  const recentes = db.prepare(`SELECT codigo, fornecedor_nome, valor, status, origem, criado_em FROM tmkt_vendas
    WHERE empresa_id=? AND status NOT IN ('cancelado','recusado','perdido') ORDER BY criado_em DESC LIMIT 6`).all(emp);
  // top fornecedores (por valor fechado)
  const topForn = db.prepare(`SELECT fornecedor_nome nome, COUNT(*) n, COALESCE(SUM(valor),0) valor FROM tmkt_vendas
    WHERE empresa_id=? AND status IN ('confirmado','vendido','vigente','comprovacao','concluido','encerrado') GROUP BY fornecedor_nome ORDER BY valor DESC LIMIT 6`).all(emp);
  res.json({
    kpis: {
      total: tot.total, vendidos: tot.vendidos, disponiveis: tot.total - tot.vendidos,
      ocupacao: tot.total ? Math.round(tot.vendidos / tot.total * 100) : 0,
      potencial: tot.potencial, potencialPerdido: tot.potencial - tot.receita, receita: tot.receita, monitorados,
      vendidoTotal, aReceber, recebido, pendenteTotal, pendenteQtd, deixadoGanhar, usoInternoQtd,
    },
    lojas, pipeline, recentes, topForn,
  });
});

// Apuração por PLANO comercial: tudo que foi vinculado a cada plano (p/ medir o plano depois).
router.get('/planos-apuracao', (req, res) => {
  const emp = req.usuario.empresa_id;
  const FECHADO = "('confirmado','vendido','vigente','comprovacao','concluido','encerrado')";
  const rows = db.prepare(`SELECT plano_nome AS plano, COUNT(*) n, COALESCE(SUM(valor),0) valor,
      COUNT(*) FILTER (WHERE status IN ${FECHADO} AND COALESCE(uso_interno,0)=0) n_fechado,
      COALESCE(SUM(valor) FILTER (WHERE status IN ${FECHADO} AND COALESCE(uso_interno,0)=0),0) valor_fechado,
      COUNT(*) FILTER (WHERE status IN ('pedido','rascunho','negociacao')) n_aberto
    FROM tmkt_vendas WHERE empresa_id=? AND plano_id IS NOT NULL AND plano_nome IS NOT NULL
      AND status NOT IN ('cancelado','recusado','perdido')
    GROUP BY plano_nome ORDER BY valor_fechado DESC, valor DESC`).all(emp);
  res.json({ planos: rows });
});

// Resumo filtrável do dashboard (por plano comercial e/ou por espaço) + listas pros dropdowns.
router.get('/dashboard-filtro', (req, res) => {
  const emp = req.usuario.empresa_id;
  const plano = (req.query.plano || '').trim(), espaco = (req.query.espaco || '').trim();
  const forn = (req.query.fornecedor || '').trim(), de = (req.query.de || '').trim(), ate = (req.query.ate || '').trim();
  const conds = ['v.empresa_id=@emp']; const p = { emp };
  if (plano) { conds.push('v.plano_nome=@plano'); p.plano = plano; }
  if (espaco) { conds.push('EXISTS (SELECT 1 FROM tmkt_venda_espacos ve WHERE ve.venda_id=v.id AND ve.espaco_desc=@espaco)'); p.espaco = espaco; }
  if (forn) { conds.push('v.fornecedor_nome=@forn'); p.forn = forn; }
  if (de) { conds.push('date(v.criado_em)>=@de'); p.de = de; }
  if (ate) { conds.push('date(v.criado_em)<=@ate'); p.ate = ate; }
  const uso = (req.query.uso || '').trim();
  if (uso === '1') conds.push('COALESCE(v.uso_interno,0)=1');       // só uso interno (da própria empresa)
  else if (uso === '0') conds.push('COALESCE(v.uso_interno,0)=0');  // só venda real
  const FECHADO = "('confirmado','vendido','vigente','comprovacao','concluido','encerrado')";
  const row = db.prepare(`SELECT
      COUNT(*) FILTER (WHERE v.status NOT IN ('cancelado','recusado','perdido')) n,
      COALESCE(SUM(v.valor) FILTER (WHERE v.status IN ${FECHADO} AND COALESCE(v.uso_interno,0)=0),0) fechado,
      COALESCE(SUM(v.valor) FILTER (WHERE v.status IN ('pedido','rascunho','negociacao')),0) pendente,
      COALESCE(SUM(v.valor) FILTER (WHERE COALESCE(v.uso_interno,0)=1 AND v.status NOT IN ('cancelado','recusado','perdido')),0) deixado
    FROM tmkt_vendas v WHERE ${conds.join(' AND ')}`).get(p);
  const planos = db.prepare("SELECT DISTINCT plano_nome FROM tmkt_vendas WHERE empresa_id=? AND plano_nome IS NOT NULL ORDER BY plano_nome").all(emp).map(r => r.plano_nome);
  const espacos = db.prepare("SELECT DISTINCT espaco_desc FROM tmkt_venda_espacos WHERE empresa_id=? AND espaco_desc IS NOT NULL AND espaco_desc<>'' ORDER BY espaco_desc").all(emp).map(r => r.espaco_desc);
  const fornecedores = db.prepare("SELECT DISTINCT fornecedor_nome FROM tmkt_vendas WHERE empresa_id=? AND fornecedor_nome IS NOT NULL AND fornecedor_nome<>'' ORDER BY fornecedor_nome").all(emp).map(r => r.fornecedor_nome);
  res.json({ ...row, planos, espacos, fornecedores });
});

// ── Premiação do VENDEDOR de trade (vendedor = criado_por) — regra POR ESPAÇO, apuração mensal ──
// A META só conta como REALIZADO quando o CONTRATO está ASSINADO (Joe 2026-11-11, "a partir de agora").
// Antes contava a partir do aceite do fornecedor (status 'vigente'); agora o gatilho é a assinatura
// eletrônica do contrato (tmkt_contrato.status='assinado'), pra o vendedor só ganhar quando a vinculação
// está de fato formalizada. ⚠ Enquanto não houver contrato assinado, a premiação do mês fica zerada.
// (v2.0 Postgres: WHERE EXISTS (SELECT 1 FROM tmkt_contrato c WHERE c.venda_id=v.id AND c.status='assinado').)
const PREM_ASSINADO = "EXISTS (SELECT 1 FROM tmkt_contrato ct WHERE ct.venda_id=v.id AND ct.status='assinado')";
const PREM_FAIXAS_PADRAO = [{ ate: 10, pct: 1 }, { ate: null, pct: 2 }];
function premFaixas(emp) {
  const r = db.prepare('SELECT faixas_json FROM tmkt_prem_vend_regra WHERE empresa_id=?').get(emp);
  if (r && r.faixas_json) { try { const f = JSON.parse(r.faixas_json); if (Array.isArray(f) && f.length) return f; } catch (e) { /* */ } }
  return PREM_FAIXAS_PADRAO;
}
function pctPorEspacos(faixas, qtd) {
  const ord = [...faixas].sort((a, b) => (a.ate == null ? 1e9 : a.ate) - (b.ate == null ? 1e9 : b.ate));
  for (const f of ord) { if (f.ate == null || qtd <= Number(f.ate)) return Number(f.pct) || 0; }
  return ord.length ? Number(ord[ord.length - 1].pct) || 0 : 0;
}
router.get('/premiacao-vendedor/regra', (req, res) => res.json({ faixas: premFaixas(req.usuario.empresa_id) }));
router.post('/premiacao-vendedor/regra', exigePerfil(...GESTAO), (req, res) => {
  const faixas = Array.isArray(req.body.faixas) ? req.body.faixas.map(f => ({ ate: (f.ate === '' || f.ate == null) ? null : Number(f.ate), pct: Number(f.pct) || 0 })) : PREM_FAIXAS_PADRAO;
  db.prepare(`INSERT INTO tmkt_prem_vend_regra (empresa_id, faixas_json, atualizado_em) VALUES (?,?,datetime('now'))
    ON CONFLICT(empresa_id) DO UPDATE SET faixas_json=excluded.faixas_json, atualizado_em=datetime('now')`).run(req.usuario.empresa_id, JSON.stringify(faixas));
  res.json({ ok: true, faixas });
});
router.get('/premiacao-vendedor', (req, res) => {
  const emp = req.usuario.empresa_id, mes = Number(req.query.mes), ano = Number(req.query.ano);
  if (!mes || !ano) return res.status(400).json({ erro: 'Informe mês e ano.' });
  const ym = `${ano}-${String(mes).padStart(2, '0')}`;
  const rows = db.prepare(`SELECT v.criado_por vendedor_id, col.nome vendedor_nome,
      COUNT(ve.id) espacos, COALESCE(SUM(ve.valor),0) valor
    FROM tmkt_vendas v JOIN tmkt_venda_espacos ve ON ve.venda_id=v.id
    LEFT JOIN colaboradores col ON col.id=v.criado_por
    WHERE v.empresa_id=? AND ${PREM_ASSINADO} AND COALESCE(v.uso_interno,0)=0 AND COALESCE(v.nao_ocupa,0)=0 AND COALESCE(v.nao_premia,0)=0
      AND v.criado_por IS NOT NULL AND strftime('%Y-%m', v.criado_em)=?
    GROUP BY v.criado_por, col.nome ORDER BY valor DESC`).all(emp, ym);
  const faixas = premFaixas(emp);
  const linhas = rows.map(r => { const pct = pctPorEspacos(faixas, r.espacos); return { vendedor_id: r.vendedor_id, vendedor_nome: r.vendedor_nome || '(sem nome)', espacos: r.espacos, valor: r.valor, pct, premiacao: Math.round(r.valor * pct) / 100 }; });
  const fech = db.prepare('SELECT fechado, fechado_em, fechado_por FROM tmkt_prem_vend_fechado WHERE empresa_id=? AND mes=? AND ano=?').get(emp, mes, ano);
  res.json({ faixas, linhas, total: linhas.reduce((s, l) => s + l.premiacao, 0), fechado: !!(fech && fech.fechado), fechado_em: fech ? fech.fechado_em : null, fechado_por: fech ? fech.fechado_por : null });
});
router.post('/premiacao-vendedor/fechar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, mes = Number(req.body.mes), ano = Number(req.body.ano), reabrir = !!req.body.reabrir;
  if (!mes || !ano) return res.status(400).json({ erro: 'Informe mês e ano.' });
  db.prepare(`INSERT INTO tmkt_prem_vend_fechado (empresa_id, mes, ano, fechado, fechado_em, fechado_por) VALUES (?,?,?,?,?,?)
    ON CONFLICT(empresa_id,mes,ano) DO UPDATE SET fechado=excluded.fechado, fechado_em=excluded.fechado_em, fechado_por=excluded.fechado_por`)
    .run(emp, mes, ano, reabrir ? 0 : 1, reabrir ? null : new Date().toISOString(), reabrir ? null : (req.usuario.nome || ''));
  res.json({ ok: true });
});

// Metas de ATIVIDADE do trade (prospecções/mês, contatos/dia, fechamentos/mês). Escopo 'geral' + por colaborador.
function tradeMetaDe(emp, uid) {
  const ind = uid && db.prepare("SELECT * FROM tmkt_trade_meta WHERE empresa_id=? AND escopo=?").get(emp, String(uid));
  const geral = db.prepare("SELECT * FROM tmkt_trade_meta WHERE empresa_id=? AND escopo='geral'").get(emp);
  const m = ind || geral || {};
  return { prospeccoes_mes: m.prospeccoes_mes || 0, contatos_dia: m.contatos_dia || 0, fechamentos_mes: m.fechamentos_mes || 0, origem: ind ? 'individual' : (geral ? 'geral' : 'vazia') };
}
// ── Metas por MÊS + carry-over ("excedente abate o próximo mês") ──
const ymOf = (a, m) => `${a}-${String(m).padStart(2, '0')}`;
function realizadoProsp(emp, uid, ym) { return db.prepare("SELECT COUNT(*) n FROM tmkt_prospeccao WHERE empresa_id=? AND responsavel_id=? AND strftime('%Y-%m',criado_em)=?").get(emp, uid, ym).n; }
function realizadoFech(emp, uid, ym) { return db.prepare("SELECT COUNT(*) n FROM tmkt_prospeccao WHERE empresa_id=? AND responsavel_id=? AND etapa='ganho' AND strftime('%Y-%m',atualizado_em)=?").get(emp, uid, ym).n; }
function realizadoContatos(emp, uid, ym) { return db.prepare("SELECT COUNT(*) n FROM tmkt_prospeccao_contato WHERE criado_por=? AND strftime('%Y-%m',quando)=?").get(uid, ym).n; }
// base (cadastrada) do mês para um colaborador: linha do mês dele → linha do mês 'geral' → fixo legado
function baseMesColab(emp, uid, ano, mes) {
  const r = db.prepare("SELECT prospeccoes_mes,contatos_dia,fechamentos_mes FROM tmkt_trade_meta_mes WHERE empresa_id=? AND escopo=? AND ano=? AND mes=?").get(emp, String(uid), ano, mes)
    || db.prepare("SELECT prospeccoes_mes,contatos_dia,fechamentos_mes FROM tmkt_trade_meta_mes WHERE empresa_id=? AND escopo='geral' AND ano=? AND mes=?").get(emp, ano, mes);
  if (r) return { prospeccoes_mes: r.prospeccoes_mes || 0, contatos_dia: r.contatos_dia || 0, fechamentos_mes: r.fechamentos_mes || 0 };
  const leg = tradeMetaDe(emp, uid);
  return { prospeccoes_mes: leg.prospeccoes_mes, contatos_dia: leg.contatos_dia, fechamentos_mes: leg.fechamentos_mes };
}
// banco de excedente disponível no INÍCIO de mesAlvo (acumula o que passou da base nos meses anteriores do ano)
function bancoDe(emp, uid, ano, mesAlvo, campo, realizadoFn) {
  let banco = 0;
  for (let m = 1; m < mesAlvo; m++) {
    const base = baseMesColab(emp, uid, ano, m)[campo];
    if (base <= 0) continue; // mês sem meta não consome nem gera banco
    const feito = realizadoFn(emp, uid, ymOf(ano, m));
    const usado = Math.min(banco, Math.max(0, base - feito)); // banco cobre o que faltou pra base
    const excedente = Math.max(0, feito - base);              // o que passou da base entra no banco
    banco = banco - usado + excedente;
  }
  return banco;
}
function metaEfetivaColab(emp, uid, ano, mes) {
  const base = baseMesColab(emp, uid, ano, mes);
  const bP = bancoDe(emp, uid, ano, mes, 'prospeccoes_mes', realizadoProsp);
  const bF = bancoDe(emp, uid, ano, mes, 'fechamentos_mes', realizadoFech);
  return {
    prospeccoes: { base: base.prospeccoes_mes, banco: bP, efetiva: Math.max(0, base.prospeccoes_mes - bP) },
    contatos: { meta: base.contatos_dia },
    fechamentos: { base: base.fechamentos_mes, banco: bF, efetiva: Math.max(0, base.fechamentos_mes - bF) },
  };
}
router.get('/trade-metas', (req, res) => {
  const emp = req.usuario.empresa_id;
  const linhas = db.prepare("SELECT * FROM tmkt_trade_meta WHERE empresa_id=? ORDER BY (escopo<>'geral'), escopo").all(emp)
    .map(l => ({ ...l, escopo_nome: l.escopo === 'geral' ? 'Todos (geral)' : (db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(l.escopo)?.nome || l.escopo) }));
  res.json({ linhas });
});
router.post('/trade-metas', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id, escopo = String(b.escopo || 'geral');
  db.prepare(`INSERT INTO tmkt_trade_meta (empresa_id,escopo,prospeccoes_mes,contatos_dia,fechamentos_mes,atualizado_em) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,escopo) DO UPDATE SET prospeccoes_mes=excluded.prospeccoes_mes, contatos_dia=excluded.contatos_dia, fechamentos_mes=excluded.fechamentos_mes, atualizado_em=datetime('now')`)
    .run(emp, escopo, Number(b.prospeccoes_mes) || 0, Number(b.contatos_dia) || 0, Number(b.fechamentos_mes) || 0);
  res.json({ ok: true });
});
router.delete('/trade-metas/:escopo', exigePerfil(...GESTAO), (req, res) => {
  if (req.params.escopo === 'geral') return res.status(400).json({ erro: 'A meta geral não pode ser removida (zere os valores).' });
  db.prepare('DELETE FROM tmkt_trade_meta WHERE empresa_id=? AND escopo=?').run(req.usuario.empresa_id, req.params.escopo);
  res.json({ ok: true });
});
// Cadastra a meta de um PERÍODO (início→fim) aplicando o mesmo valor em cada mês.
router.post('/trade-metas/periodo', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id, escopo = String(b.escopo || 'geral');
  const ai = Number(b.ano_ini), mi = Number(b.mes_ini), af = Number(b.ano_fim), mf = Number(b.mes_fim);
  if (!ai || !mi || !af || !mf) return res.status(400).json({ erro: 'Informe mês/ano de início e fim.' });
  const ini = ai * 12 + (mi - 1), fim = af * 12 + (mf - 1);
  if (fim < ini) return res.status(400).json({ erro: 'O fim está antes do início.' });
  if (fim - ini > 35) return res.status(400).json({ erro: 'Período muito longo (máx. 36 meses).' });
  const up = db.prepare(`INSERT INTO tmkt_trade_meta_mes (empresa_id,escopo,ano,mes,prospeccoes_mes,contatos_dia,fechamentos_mes,atualizado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,escopo,ano,mes) DO UPDATE SET prospeccoes_mes=excluded.prospeccoes_mes, contatos_dia=excluded.contatos_dia, fechamentos_mes=excluded.fechamentos_mes, atualizado_em=datetime('now')`);
  const p = Number(b.prospeccoes_mes) || 0, c = Number(b.contatos_dia) || 0, f = Number(b.fechamentos_mes) || 0;
  db.transaction(() => { for (let k = ini; k <= fim; k++) up.run(emp, escopo, Math.floor(k / 12), (k % 12) + 1, p, c, f); })();
  res.json({ ok: true, meses: fim - ini + 1 });
});
// Ajuste pontual de UM mês.
router.post('/trade-metas/mes', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id, escopo = String(b.escopo || 'geral');
  const ano = Number(b.ano), mes = Number(b.mes);
  if (!ano || !mes) return res.status(400).json({ erro: 'Informe mês e ano.' });
  db.prepare(`INSERT INTO tmkt_trade_meta_mes (empresa_id,escopo,ano,mes,prospeccoes_mes,contatos_dia,fechamentos_mes,atualizado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,escopo,ano,mes) DO UPDATE SET prospeccoes_mes=excluded.prospeccoes_mes, contatos_dia=excluded.contatos_dia, fechamentos_mes=excluded.fechamentos_mes, atualizado_em=datetime('now')`)
    .run(emp, escopo, ano, mes, Number(b.prospeccoes_mes) || 0, Number(b.contatos_dia) || 0, Number(b.fechamentos_mes) || 0);
  res.json({ ok: true });
});
router.delete('/trade-metas/mes/:escopo/:ano/:mes', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_trade_meta_mes WHERE empresa_id=? AND escopo=? AND ano=? AND mes=?')
    .run(req.usuario.empresa_id, req.params.escopo, Number(req.params.ano), Number(req.params.mes));
  res.json({ ok: true });
});
// Monitor de acompanhamento: por colaborador de trade, meta efetiva (com carry-over) x realizado no mês.
router.get('/trade-metas/monitor', (req, res) => {
  const emp = req.usuario.empresa_id;
  const now = new Date();
  const ano = Number(req.query.ano) || now.getFullYear(), mes = Number(req.query.mes) || (now.getMonth() + 1);
  const ym = ymOf(ano, mes);
  // Universo do monitor: quem é de trade OU tem meta individual no mês OU tem atividade de prospecção/contato no mês.
  // (Antes exigia trade=1; se ninguém estava marcado, o monitor vinha sempre vazio.)
  const colabs = db.prepare(`SELECT DISTINCT c.id, c.nome FROM colaboradores c
    WHERE COALESCE(c.ativo,1)=1 AND (
      c.trade=1
      OR c.id IN (SELECT escopo FROM tmkt_trade_meta_mes WHERE empresa_id=? AND ano=? AND mes=? AND escopo<>'geral')
      OR c.id IN (SELECT responsavel_id FROM tmkt_prospeccao WHERE empresa_id=? AND responsavel_id IS NOT NULL AND strftime('%Y-%m',criado_em)=?)
      OR c.id IN (SELECT criado_por FROM tmkt_prospeccao_contato WHERE criado_por IS NOT NULL AND strftime('%Y-%m',quando)=?)
    ) ORDER BY c.nome`).all(emp, ano, mes, emp, ym, ym);
  const linhas = colabs.map(c => {
    const ef = metaEfetivaColab(emp, c.id, ano, mes);
    const fP = realizadoProsp(emp, c.id, ym), fF = realizadoFech(emp, c.id, ym), fC = realizadoContatos(emp, c.id, ym);
    return { id: c.id, nome: c.nome,
      prospeccoes: { ...ef.prospeccoes, feito: fP, bateu: ef.prospeccoes.base > 0 && fP >= ef.prospeccoes.efetiva },
      fechamentos: { ...ef.fechamentos, feito: fF, bateu: ef.fechamentos.base > 0 && fF >= ef.fechamentos.efetiva },
      contatos: { meta: ef.contatos.meta, feito: fC } };
  });
  const cadastro = db.prepare("SELECT * FROM tmkt_trade_meta_mes WHERE empresa_id=? AND ano=? AND mes=? ORDER BY (escopo<>'geral'), escopo").all(emp, ano, mes)
    .map(l => ({ ...l, escopo_nome: l.escopo === 'geral' ? 'Todos (geral)' : (db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(l.escopo)?.nome || l.escopo) }));
  res.json({ ano, mes, linhas, cadastro });
});

// "Minha meta" (do usuário logado): premiação de trade do mês + tarefas de trade dele (atrasadas/em dia).
router.get('/minha-meta', (req, res) => {
  const emp = req.usuario.empresa_id, uid = req.usuario.id;
  const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const r = db.prepare(`SELECT COUNT(ve.id) espacos, COALESCE(SUM(ve.valor),0) valor
    FROM tmkt_vendas v JOIN tmkt_venda_espacos ve ON ve.venda_id=v.id
    WHERE v.empresa_id=? AND v.criado_por=? AND ${PREM_ASSINADO} AND COALESCE(v.uso_interno,0)=0 AND COALESCE(v.nao_ocupa,0)=0 AND COALESCE(v.nao_premia,0)=0
      AND strftime('%Y-%m', v.criado_em)=?`).get(emp, uid, ym);
  const faixas = premFaixas(emp);
  const pct = pctPorEspacos(faixas, r.espacos);
  const premiacao = Math.round(r.valor * pct) / 100;
  const ord = [...faixas].sort((a, b) => (a.ate == null ? 1e9 : a.ate) - (b.ate == null ? 1e9 : b.ate));
  let proxima = null;
  for (let i = 0; i < ord.length; i++) { const f = ord[i]; if (f.ate == null || r.espacos <= Number(f.ate)) { const next = ord[i + 1]; if (f.ate != null && next && Number(next.pct) > pct) proxima = { faltam: Number(f.ate) - r.espacos + 1, pct: next.pct }; break; } }
  const hoje = new Date().toISOString();
  const hojeD = hoje.slice(0, 10);
  const tarefas = db.prepare(`SELECT id, titulo, prazo, criado_em FROM tarefas WHERE empresa_id=? AND responsavel_id=? AND origem LIKE 'trade%' AND status<>'concluido' ORDER BY (prazo IS NULL), prazo LIMIT 12`).all(emp, uid)
    .map(t => ({ id: t.id, titulo: t.titulo, prazo: t.prazo, atrasada: !!(t.prazo && t.prazo < hoje) }));
  // Cobranças de prospecção do funil (cards do usuário com próximo contato marcado) — alimentam a agenda/lembretes da lateral.
  const prosp = db.prepare(`SELECT id, fornecedor_nome, etapa, proximo_contato, gatilho_valor, origem FROM tmkt_prospeccao
    WHERE empresa_id=? AND responsavel_id=? AND etapa NOT IN ('ganho','perdido') AND proximo_contato IS NOT NULL
    ORDER BY proximo_contato LIMIT 20`).all(emp, uid)
    .map(p => ({ id: p.id, fornecedor: p.fornecedor_nome, etapa: p.etapa, data: String(p.proximo_contato).slice(0, 10), origem: p.origem,
      quando: String(p.proximo_contato).slice(0, 10) < hojeD ? 'vencido' : (String(p.proximo_contato).slice(0, 10) === hojeD ? 'hoje' : 'futuro') }));
  const cobrancas = prosp.filter(p => p.quando !== 'futuro');
  // Progresso das metas de atividade (prospecções no mês / contatos hoje / fechamentos no mês) do usuário.
  const [anoA, mesA] = ym.split('-').map(Number);
  const ef = metaEfetivaColab(emp, uid, anoA, mesA); // meta efetiva do mês (com carry-over: excedente abate o mês)
  const feitoProsp = db.prepare(`SELECT COUNT(*) n FROM tmkt_prospeccao WHERE empresa_id=? AND responsavel_id=? AND strftime('%Y-%m',criado_em)=?`).get(emp, uid, ym).n;
  const feitoContatos = db.prepare(`SELECT COUNT(*) n FROM tmkt_prospeccao_contato WHERE criado_por=? AND date(quando)=date('now')`).get(uid).n;
  const feitoFech = db.prepare(`SELECT COUNT(*) n FROM tmkt_prospeccao WHERE empresa_id=? AND responsavel_id=? AND etapa='ganho' AND strftime('%Y-%m',atualizado_em)=?`).get(emp, uid, ym).n;
  const atividade = {
    prospeccoes: { meta: ef.prospeccoes.efetiva, base: ef.prospeccoes.base, banco: ef.prospeccoes.banco, feito: feitoProsp },
    contatos: { meta: ef.contatos.meta, feito: feitoContatos },
    fechamentos: { meta: ef.fechamentos.efetiva, base: ef.fechamentos.base, banco: ef.fechamentos.banco, feito: feitoFech },
    origem: 'mensal' };
  res.json({ espacos: r.espacos, valor: r.valor, pct, premiacao, proxima, tarefas, atrasadas: tarefas.filter(t => t.atrasada).length,
    prospeccoes: prosp, cobrancas, cobrancas_n: cobrancas.length, atividade });
});
// Anotações pessoais do painel de trade (bloco de notas da lateral).
router.get('/anotacoes', (req, res) => {
  const itens = db.prepare("SELECT id, texto, feito, criado_em FROM tmkt_anotacao WHERE empresa_id=? AND usuario_id=? ORDER BY feito, criado_em DESC LIMIT 50").all(req.usuario.empresa_id, req.usuario.id);
  res.json({ itens: itens.map(i => ({ ...i, feito: !!i.feito })) });
});
router.post('/anotacoes', (req, res) => {
  const texto = String(req.body.texto || '').trim(); if (!texto) return res.status(400).json({ erro: 'Vazio.' });
  const id = uuid();
  db.prepare("INSERT INTO tmkt_anotacao (id,empresa_id,usuario_id,texto) VALUES (?,?,?,?)").run(id, req.usuario.empresa_id, req.usuario.id, texto);
  res.json({ ok: true, id });
});
router.put('/anotacoes/:id', (req, res) => {
  db.prepare("UPDATE tmkt_anotacao SET feito=? WHERE id=? AND usuario_id=?").run(req.body.feito ? 1 : 0, req.params.id, req.usuario.id);
  res.json({ ok: true });
});
router.delete('/anotacoes/:id', (req, res) => {
  db.prepare("DELETE FROM tmkt_anotacao WHERE id=? AND usuario_id=?").run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ── CRM / Lead de fornecedores: traz do Alpha 7 quem mais compramos + rastreio do relacionamento ──
const UNIS_GRUPO = '(70417,70418,70419,70420,70421,70422,70423,70424)'; // unidades do grupo no ERP
router.get('/leads', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const dias = Math.min(365, Math.max(30, Number(req.query.dias) || 90));
  let topo = [];
  if (habilitado()) {
    try {
      topo = await erpQuery(`SELECT f.id fornecedor_id, pe.nome fornecedor, COUNT(DISTINCT nf.id) notas,
          COALESCE(SUM(inf.quantidade*inf.valorunitario),0) compra
        FROM notafiscal nf JOIN fornecedor f ON f.id=nf.fornecedorid JOIN pessoa pe ON pe.id=f.pessoaid
        JOIN itemnotafiscal inf ON inf.notafiscalid=nf.id
        WHERE nf.unidadenegocioid IN ${UNIS_GRUPO} AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E') AND nf.fornecedorid IS NOT NULL
          AND nf.datahoraentrada >= now() - ($1 || ' days')::interval
        GROUP BY f.id, pe.nome ORDER BY compra DESC LIMIT 60`, [String(dias)]);
    } catch (e) { /* ERP fora do ar */ }
  }
  const leads = db.prepare('SELECT * FROM tmkt_lead_fornecedor WHERE empresa_id=?').all(emp);
  const byId = {}; leads.forEach(l => { byId[String(l.fornecedor_id)] = l; });
  const itens = topo.map(t => { const l = byId[String(t.fornecedor_id)] || {}; return {
    fornecedor_id: String(t.fornecedor_id), fornecedor: t.fornecedor, compra: Number(t.compra) || 0, notas: Number(t.notas) || 0,
    status: l.status || 'novo', periodicidade: l.periodicidade || '', proximo_contato: l.proximo_contato || '', responsavel: l.responsavel || '', contato: l.contato || '', obs: l.obs || '' }; });
  res.json({ dias, itens });
});
router.post('/leads/:fid', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  db.prepare(`INSERT INTO tmkt_lead_fornecedor (empresa_id, fornecedor_id, fornecedor_nome, status, periodicidade, proximo_contato, responsavel, contato, obs, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, fornecedor_id) DO UPDATE SET fornecedor_nome=excluded.fornecedor_nome, status=excluded.status, periodicidade=excluded.periodicidade,
      proximo_contato=excluded.proximo_contato, responsavel=excluded.responsavel, contato=excluded.contato, obs=excluded.obs, atualizado_em=datetime('now')`)
    .run(emp, String(req.params.fid), b.fornecedor_nome || null, b.status || 'novo', b.periodicidade || '', b.proximo_contato || null, b.responsavel || null, b.contato || null, b.obs || null);
  res.json({ ok: true });
});

// ── Funil de Prospecção (CRM): cards por etapa + histórico de contato + próximo contato ──
const PROSP_ETAPAS = ['novo', 'em_contato', 'negociando', 'ganho', 'perdido'];
function prospeccaoResumo(emp) {
  const hoje = new Date().toISOString().slice(0, 10);
  // Colunas explícitas: NÃO trazer proposta_arquivo (base64 grande) na listagem — só um flag.
  const cards = db.prepare(`SELECT p.id, p.empresa_id, p.fornecedor_id, p.fornecedor_nome, p.etapa, p.origem,
      p.gatilho_valor, p.responsavel_id, p.contato_nome, p.contato_fone, p.contato_email, p.proximo_contato,
      p.periodicidade, p.obs, p.proposta, p.proposta_nome, p.motivo_perda, p.reabordar_em, p.criado_em, p.atualizado_em,
      (p.proposta_arquivo IS NOT NULL) AS tem_proposta_arquivo,
      (SELECT COUNT(*) FROM tmkt_prospeccao_contato c WHERE c.prospeccao_id=p.id) contatos,
      (SELECT MAX(quando) FROM tmkt_prospeccao_contato c WHERE c.prospeccao_id=p.id) ultimo_contato,
      (SELECT nome FROM colaboradores WHERE id=p.responsavel_id) responsavel_nome
    FROM tmkt_prospeccao p WHERE p.empresa_id=? ORDER BY (p.proximo_contato IS NULL), p.proximo_contato, p.criado_em DESC`).all(emp);
  return cards.map(c => ({ ...c, tem_proposta_arquivo: !!c.tem_proposta_arquivo,
    vencido: !!(c.proximo_contato && String(c.proximo_contato).slice(0, 10) < hoje && !['ganho', 'perdido'].includes(c.etapa)),
    hoje: !!(c.proximo_contato && String(c.proximo_contato).slice(0, 10) === hoje),
    // perdida que já passou da data de "voltar a procurar" → reacender como lembrete
    reabordar_vencido: !!(c.etapa === 'perdido' && c.reabordar_em && String(c.reabordar_em).slice(0, 10) <= hoje) }));
}
router.get('/prospeccoes', (req, res) => {
  res.json({ etapas: PROSP_ETAPAS, itens: prospeccaoResumo(req.usuario.empresa_id) });
});
router.post('/prospeccoes', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  if (!b.fornecedor_nome && !b.fornecedor_id) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_prospeccao (id,empresa_id,fornecedor_id,fornecedor_nome,etapa,origem,responsavel_id,contato_nome,contato_fone,contato_email,proximo_contato,periodicidade,obs,proposta,criado_por)
    VALUES (?,?,?,?,?, 'manual', ?,?,?,?,?,?,?,?,?)`)
    .run(id, emp, String(b.fornecedor_id || ''), b.fornecedor_nome || null, PROSP_ETAPAS.includes(b.etapa) ? b.etapa : 'novo',
      b.responsavel_id || null, b.contato_nome || null, b.contato_fone || null, b.contato_email || null, b.proximo_contato || null, b.periodicidade || '', b.obs || null, b.proposta || null, req.usuario.id);
  res.json({ ok: true, id });
});
router.put('/prospeccoes/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Prospecção não encontrada.' });
  db.prepare(`UPDATE tmkt_prospeccao SET etapa=?, responsavel_id=?, contato_nome=?, contato_fone=?, contato_email=?, proximo_contato=?, periodicidade=?, obs=?, proposta=?, motivo_perda=?, reabordar_em=?, atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(PROSP_ETAPAS.includes(b.etapa) ? b.etapa : p.etapa, b.responsavel_id ?? p.responsavel_id,
      b.contato_nome ?? p.contato_nome, b.contato_fone ?? p.contato_fone, b.contato_email ?? p.contato_email,
      b.proximo_contato !== undefined ? (b.proximo_contato || null) : p.proximo_contato,
      b.periodicidade !== undefined ? (b.periodicidade || '') : p.periodicidade, b.obs ?? p.obs,
      b.proposta !== undefined ? (b.proposta || null) : p.proposta,
      b.motivo_perda !== undefined ? (b.motivo_perda || null) : p.motivo_perda,
      b.reabordar_em !== undefined ? (b.reabordar_em || null) : p.reabordar_em, p.id, emp);
  res.json({ ok: true });
});
router.delete('/prospeccoes/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_prospeccao_contato WHERE prospeccao_id=?').run(req.params.id);
  db.prepare('DELETE FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.get('/prospeccoes/:id/contatos', (req, res) => {
  // colunas explícitas: não devolver o base64 do arquivo da proposta (pesado) — só o flag
  const p = db.prepare(`SELECT id, empresa_id, fornecedor_id, fornecedor_nome, etapa, origem, gatilho_valor,
      responsavel_id, contato_nome, contato_fone, contato_email, proximo_contato, periodicidade, obs,
      proposta, proposta_nome, motivo_perda, reabordar_em, criado_em, atualizado_em,
      (proposta_arquivo IS NOT NULL) AS tem_proposta_arquivo
    FROM tmkt_prospeccao WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'não encontrada' });
  p.tem_proposta_arquivo = !!p.tem_proposta_arquivo;
  const contatos = db.prepare(`SELECT c.*, (SELECT nome FROM colaboradores WHERE id=c.criado_por) autor FROM tmkt_prospeccao_contato c WHERE c.prospeccao_id=? ORDER BY c.quando DESC`).all(p.id);
  res.json({ prospeccao: p, contatos });
});
// Arquivo da proposta/estudo (apresentação de oportunidades) — grava e serve base64, igual às artes do trade.
router.post('/prospeccoes/:id/proposta-arquivo', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT id FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'não encontrada' });
  if (b.arquivo === null || b.arquivo === '') { // remover
    db.prepare("UPDATE tmkt_prospeccao SET proposta_arquivo=NULL, proposta_mime=NULL, proposta_nome=NULL, atualizado_em=datetime('now') WHERE id=?").run(p.id);
    return res.json({ ok: true, removido: true });
  }
  if (!/^data:([^;]+);base64,/.test(String(b.arquivo || ''))) return res.status(400).json({ erro: 'Envie um arquivo (PDF, imagem ou apresentação).' });
  db.prepare("UPDATE tmkt_prospeccao SET proposta_arquivo=?, proposta_mime=?, proposta_nome=?, atualizado_em=datetime('now') WHERE id=?")
    .run(String(b.arquivo).slice(0, 12_000_000), b.mime || null, b.nome || null, p.id);
  res.json({ ok: true });
});
router.get('/prospeccoes/:id/proposta-arquivo', (req, res) => {
  const r = db.prepare('SELECT proposta_arquivo, proposta_mime, proposta_nome FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r || !r.proposta_arquivo) return res.status(404).send('sem arquivo');
  if (r.proposta_nome) res.set('Content-Disposition', `inline; filename="${String(r.proposta_nome).replace(/[^\w.\- ]/g, '_')}"`);
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.proposta_arquivo || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.proposta_mime || 'application/octet-stream');
  res.send(Buffer.from(String(r.proposta_arquivo).replace(/^data:[^,]+,/, ''), 'base64'));
});
// Marcar como perdida ("sem interesse") guardando o motivo e a data para voltar a procurar.
router.post('/prospeccoes/:id/perder', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT id FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'não encontrada' });
  db.prepare("UPDATE tmkt_prospeccao SET etapa='perdido', motivo_perda=?, reabordar_em=?, atualizado_em=datetime('now') WHERE id=?")
    .run(b.motivo_perda || null, b.reabordar_em || null, p.id);
  res.json({ ok: true });
});
// Reabrir uma prospecção perdida — volta pro funil e já sugere a próxima data de contato.
router.post('/prospeccoes/:id/reabrir', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'não encontrada' });
  const prox = b.proximo_contato || p.reabordar_em || new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE tmkt_prospeccao SET etapa='em_contato', proximo_contato=?, reabordar_em=NULL, atualizado_em=datetime('now') WHERE id=?")
    .run(prox, p.id);
  res.json({ ok: true });
});

// ── CALENDÁRIO / AGENDA DA EMPRESA ────────────────────────────────────────────
// Eventos "empresa" todo mundo vê; "pessoal" só o dono. Agendamentos de lead/prospecção/tarefa
// são DERIVADOS (não gravados) e sempre pessoais do responsável.
router.get('/agenda', (req, res) => {
  const emp = req.usuario.empresa_id, uid = req.usuario.id;
  const ini = String(req.query.ini || '').slice(0, 10) || '0000-01-01';
  const fim = String(req.query.fim || '').slice(0, 10) || '9999-12-31';
  const hoje = new Date().toISOString().slice(0, 10);
  // eventos manuais: empresa (todos) OU pessoais do próprio usuário, que cruzem o intervalo
  const manuais = db.prepare(`SELECT id, titulo, descricao, data, hora, fim, local, cor, visibilidade, dono_id, origem, ref_id, criado_por
      FROM agenda_evento WHERE empresa_id=? AND (visibilidade='empresa' OR dono_id=?)
        AND data<=? AND COALESCE(fim,data)>=? ORDER BY data, (hora IS NULL), hora`).all(emp, uid, fim, ini)
    .map(e => ({ ...e, meu: e.dono_id === uid, editavel: (e.visibilidade === 'pessoal' ? e.dono_id === uid : GESTAO.includes(req.usuario.funcao)) }));
  // DERIVADOS pessoais (só do usuário): próximo contato das prospecções abertas
  const prosp = db.prepare(`SELECT id, fornecedor_nome, proximo_contato FROM tmkt_prospeccao
      WHERE empresa_id=? AND responsavel_id=? AND etapa NOT IN ('ganho','perdido') AND proximo_contato IS NOT NULL
        AND date(substr(proximo_contato,1,10)) BETWEEN ? AND ?`).all(emp, uid, ini, fim)
    .map(p => ({ id: 'prosp-' + p.id, ref_id: p.id, titulo: '📞 Contato: ' + (p.fornecedor_nome || 'fornecedor'), data: String(p.proximo_contato).slice(0, 10),
      hora: null, fim: null, visibilidade: 'pessoal', meu: true, editavel: false, origem: 'prospeccao', aba: 'vendas', cor: '#6D4AA8' }));
  // DERIVADOS pessoais: perdidas com data de "voltar a procurar"
  const reab = db.prepare(`SELECT id, fornecedor_nome, reabordar_em FROM tmkt_prospeccao
      WHERE empresa_id=? AND responsavel_id=? AND etapa='perdido' AND reabordar_em IS NOT NULL
        AND date(substr(reabordar_em,1,10)) BETWEEN ? AND ?`).all(emp, uid, ini, fim)
    .map(p => ({ id: 'reab-' + p.id, ref_id: p.id, titulo: '🔁 Retomar: ' + (p.fornecedor_nome || 'fornecedor'), data: String(p.reabordar_em).slice(0, 10),
      hora: null, fim: null, visibilidade: 'pessoal', meu: true, editavel: false, origem: 'reabordar', aba: 'vendas', cor: '#B45309' }));
  // DERIVADOS pessoais: tarefas de trade do usuário com prazo
  const tarefas = db.prepare(`SELECT id, titulo, prazo FROM tarefas
      WHERE empresa_id=? AND responsavel_id=? AND origem LIKE 'trade%' AND status<>'concluido' AND prazo IS NOT NULL
        AND date(substr(prazo,1,10)) BETWEEN ? AND ?`).all(emp, uid, ini, fim)
    .map(t => ({ id: 'tar-' + t.id, ref_id: t.id, titulo: '✅ ' + t.titulo, data: String(t.prazo).slice(0, 10),
      hora: null, fim: null, visibilidade: 'pessoal', meu: true, editavel: false, origem: 'tarefa', cor: '#1E874B' }));
  const eventos = [...manuais, ...prosp, ...reab, ...tarefas]
    .map(e => ({ ...e, atrasado: !!(e.data && e.data < hoje && e.origem !== 'manual') }));
  res.json({ eventos });
});
router.post('/agenda', (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id, uid = req.usuario.id;
  if (!b.titulo || !String(b.titulo).trim()) return res.status(400).json({ erro: 'Informe o título.' });
  if (!b.data) return res.status(400).json({ erro: 'Informe a data.' });
  const vis = b.visibilidade === 'empresa' ? 'empresa' : 'pessoal';
  if (vis === 'empresa' && !GESTAO.includes(req.usuario.funcao)) return res.status(403).json({ erro: 'Só a gestão pode criar eventos para toda a empresa.' });
  const id = uuid();
  db.prepare(`INSERT INTO agenda_evento (id,empresa_id,titulo,descricao,data,hora,fim,local,cor,visibilidade,dono_id,origem,criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'manual', ?)`)
    .run(id, emp, String(b.titulo).trim(), b.descricao || null, String(b.data).slice(0, 10), b.hora || null,
      b.fim ? String(b.fim).slice(0, 10) : null, b.local || null, b.cor || null, vis, vis === 'pessoal' ? uid : null, uid);
  res.json({ ok: true, id });
});
router.put('/agenda/:id', (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id, uid = req.usuario.id;
  const e = db.prepare('SELECT * FROM agenda_evento WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!e) return res.status(404).json({ erro: 'não encontrado' });
  const podeEditar = e.visibilidade === 'pessoal' ? e.dono_id === uid : GESTAO.includes(req.usuario.funcao);
  if (!podeEditar) return res.status(403).json({ erro: 'Sem permissão para editar este evento.' });
  let vis = e.visibilidade, dono = e.dono_id;
  if (b.visibilidade && b.visibilidade !== e.visibilidade) {
    vis = b.visibilidade === 'empresa' ? 'empresa' : 'pessoal';
    if (vis === 'empresa' && !GESTAO.includes(req.usuario.funcao)) return res.status(403).json({ erro: 'Só a gestão pode tornar um evento da empresa.' });
    dono = vis === 'pessoal' ? uid : null;
  }
  db.prepare(`UPDATE agenda_evento SET titulo=?, descricao=?, data=?, hora=?, fim=?, local=?, cor=?, visibilidade=?, dono_id=? WHERE id=? AND empresa_id=?`)
    .run(b.titulo != null ? String(b.titulo).trim() : e.titulo, b.descricao !== undefined ? (b.descricao || null) : e.descricao,
      b.data ? String(b.data).slice(0, 10) : e.data, b.hora !== undefined ? (b.hora || null) : e.hora,
      b.fim !== undefined ? (b.fim ? String(b.fim).slice(0, 10) : null) : e.fim, b.local !== undefined ? (b.local || null) : e.local,
      b.cor !== undefined ? (b.cor || null) : e.cor, vis, dono, e.id, emp);
  res.json({ ok: true });
});
router.delete('/agenda/:id', (req, res) => {
  const emp = req.usuario.empresa_id, uid = req.usuario.id;
  const e = db.prepare('SELECT * FROM agenda_evento WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!e) return res.status(404).json({ erro: 'não encontrado' });
  const pode = e.visibilidade === 'pessoal' ? e.dono_id === uid : GESTAO.includes(req.usuario.funcao);
  if (!pode) return res.status(403).json({ erro: 'Sem permissão para excluir este evento.' });
  db.prepare('DELETE FROM agenda_evento WHERE id=? AND empresa_id=?').run(e.id, emp);
  res.json({ ok: true });
});
// Converte uma prospecção em negociação (entra como rascunho no Kanban, já com o fornecedor).
router.post('/prospeccoes/:id/converter', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Prospecção não encontrada.' });
  const vid = uuid();
  db.prepare(`INSERT INTO tmkt_vendas (id,empresa_id,codigo,origem,fornecedor_id,fornecedor_nome,valor,status,status_desde,observacao,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,datetime('now'))`)
    .run(vid, emp, proximoCodigo(emp), 'prospeccao', p.fornecedor_id || null, p.fornecedor_nome || null, 0, 'rascunho',
      p.obs ? ('Da prospecção: ' + p.obs) : null, req.usuario.id);
  db.prepare("UPDATE tmkt_prospeccao SET etapa='ganho', atualizado_em=datetime('now') WHERE id=?").run(p.id);
  try { db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE origem='trade-prospeccao' AND referencia_id=? AND status<>'concluido'").run(p.id); } catch {}
  res.json({ ok: true, venda_id: vid });
});
// Registra uma tentativa de contato. 'proximo' atualiza a data do próximo contato do card (reagendamento).
router.post('/prospeccoes/:id/contatos', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_prospeccao WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'não encontrada' });
  // próximo contato: usa o informado; se vazio e há cadência cadastrada, sugere pela cadência.
  const DIAS_CAD = { diario: 1, semanal: 7, quinzenal: 15, mensal: 30 };
  let proximo = b.proximo || null;
  if (!proximo && p.periodicidade && DIAS_CAD[p.periodicidade]) {
    proximo = new Date(Date.now() + DIAS_CAD[p.periodicidade] * 864e5).toISOString().slice(0, 10);
  }
  db.prepare(`INSERT INTO tmkt_prospeccao_contato (id,prospeccao_id,tipo,resultado,anotacao,proximo,criado_por) VALUES (?,?,?,?,?,?,?)`)
    .run(uuid(), p.id, b.tipo || 'outro', b.resultado || null, b.anotacao || null, proximo, req.usuario.id);
  // avança etapa 'novo' → 'em_contato' no primeiro contato; grava o próximo contato; fecha tarefa aberta
  const novaEtapa = (p.etapa === 'novo') ? 'em_contato' : p.etapa;
  db.prepare(`UPDATE tmkt_prospeccao SET etapa=?, proximo_contato=COALESCE(?, proximo_contato), atualizado_em=datetime('now') WHERE id=?`)
    .run(novaEtapa, proximo, p.id);
  try { db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE origem='trade-prospeccao' AND referencia_id=? AND status<>'concluido'").run(p.id); } catch {}
  res.json({ ok: true });
});

// Espaços por loja (quantidade + preço) — o "AreasEEspacosDaLoja" do TradeMkt.
// Vagas ocupadas por espaço-loja = venda_espacos de vendas ativas (não cancelada/encerrada).
const OCUPA_STATUS = "('pedido','rascunho','negociacao','confirmado','briefing','aguardando','vigente','comprovacao','vendido','concluido')";
router.get('/espaco-loja', (req, res) => {
  const rows = db.prepare(`SELECT el.id, el.empresa_id, el.loja_id, el.loja_nome, el.area, el.espaco, el.tamanho, el.descricao, el.cobranca, el.quantidade, el.preco_unit, el.criado_em,
      (el.foto IS NOT NULL) tem_foto, (
      SELECT COUNT(*) FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
      WHERE ve.espaco_id=el.id AND v.status IN ${OCUPA_STATUS} AND COALESCE(v.nao_ocupa,0)=0
    ) ocupados
    FROM tmkt_espaco_loja el WHERE el.empresa_id=? ORDER BY el.loja_nome, el.area, el.espaco`).all(req.usuario.empresa_id);
  res.json({ itens: rows.map(r => ({ ...r, tem_foto: !!r.tem_foto, ocupados: r.ocupados || 0, disponiveis: Math.max(0, (r.quantidade || 0) - (r.ocupados || 0)) })) });
});
// Foto do ponto (base64) — leitura e gravação separadas (a foto é grande, não vai na lista).
router.get('/espaco-loja/:id/foto', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  res.json({ foto: r?.foto || null });
});
router.put('/espaco-loja/:id/foto', exigePerfil(...GESTAO), (req, res) => {
  const foto = req.body.foto;
  if (foto && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(foto)) return res.status(400).json({ erro: 'Envie uma imagem.' });
  db.prepare('UPDATE tmkt_espaco_loja SET foto=? WHERE id=? AND empresa_id=?').run(foto || null, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.post('/espaco-loja', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body; if (!b.loja_nome || !b.espaco) return res.status(400).json({ erro: 'Informe loja e espaço.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_espaco_loja (id,empresa_id,loja_id,loja_nome,area,espaco,quantidade,preco_unit,criado_em) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.loja_id || null, b.loja_nome, b.area || null, b.espaco, Number(b.quantidade) || 1, Number(b.preco_unit) || 0);
  res.json({ ok: true, id });
});
router.put('/espaco-loja/:id', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body, emp = req.usuario.empresa_id;
  if (!db.prepare('SELECT 1 FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, emp)) return res.status(404).json({ erro: 'Não encontrado.' });
  const campos = { area: v => v || null, espaco: v => v || null, tamanho: v => v || null, descricao: v => v || null, cobranca: v => (['mensal', 'insercao', 'diario', 'unidade', 'hora'].includes(v) ? v : null), quantidade: v => Number(v) || 0, preco_unit: v => Number(v) || 0 };
  const sets = [], vals = [];
  for (const [k, norm] of Object.entries(campos)) if (k in b) { sets.push(`${k}=?`); vals.push(norm(b[k])); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_espaco_loja SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/espaco-loja/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Catálogo padrão de farmácia (áreas → espaços com valor de referência) + temas.
const SEED = {
  areas: [
    { nome: 'Frente de loja', espacos: [['Vitrine', 800], ['Tapete/entrada', 600]] },
    { nome: 'Frente de caixa', espacos: [['Balcão de caixa', 500], ['Display de caixa', 400], ['Clip strip caixa', 300]] },
    { nome: 'Ponta de gôndola', espacos: [['Ponta A', 1200], ['Ponta B', 1200], ['Ponta C', 1000]] },
    { nome: 'Ilhas', espacos: [['Ilha central', 1500], ['Ilha promocional', 1000]] },
    { nome: 'Gôndola', espacos: [['Prateleira nobre (altura dos olhos)', 700], ['Faixa de gôndola', 400]] },
    { nome: 'Perfumaria / Dermocosmético', espacos: [['Balcão de perfumaria', 700], ['Test de dermocosmético', 900]] },
    { nome: 'Área externa', espacos: [['Fachada / banner', 500]] },
  ],
  temas: ['Volta às Aulas', 'Dia das Mães', 'Namorados', 'Festa Junina', 'Dia dos Pais', 'Dia das Crianças', 'Black Friday', 'Natal', 'Verão / Proteção Solar', 'Campanha de Gripe', 'Setembro Amarelo', 'Outubro Rosa'],
};
function seedPadrao(emp) {
  const jaArea = db.prepare('SELECT COUNT(*) c FROM tmkt_areas WHERE empresa_id=?').get(emp).c;
  if (jaArea > 0) return { ok: true, jaExiste: true };
  const insA = db.prepare(`INSERT INTO tmkt_areas (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`);
  const insE = db.prepare(`INSERT INTO tmkt_espacos (id,empresa_id,area_id,descricao,valor_ref,criado_em) VALUES (?,?,?,?,?,datetime('now'))`);
  const insT = db.prepare(`INSERT INTO tmkt_temas (id,empresa_id,descricao,criado_em) VALUES (?,?,?,datetime('now'))`);
  let nA = 0, nE = 0, nT = 0;
  const tx = db.transaction(() => {
    for (const a of SEED.areas) { const aid = uuid(); insA.run(aid, emp, a.nome); nA++; for (const [nome, valor] of a.espacos) { insE.run(uuid(), emp, aid, nome, valor); nE++; } }
    for (const t of SEED.temas) { insT.run(uuid(), emp, t); nT++; }
  });
  tx();
  return { ok: true, areas: nA, espacos: nE, temas: nT };
}
router.post('/seed-padrao', exigePerfil(...GESTAO), (req, res) => res.json(seedPadrao(req.usuario.empresa_id)));

// ── Vendas de espaço (kanban) ────────────────────────────────────────────
function parcelasVenda(id) {
  return db.prepare(`SELECT id, numero, vencimento, valor, recebido, recebido_em, recebido_valor, forma,
      nf_numero, nf_data, nf_valor, informado_por, (comprovante_foto IS NOT NULL) AS tem_comprovante, comprovante_mime, comprovante_em
    FROM tmkt_parcelas WHERE venda_id=? ORDER BY numero`).all(id).map(p => ({ ...p, tem_comprovante: !!p.tem_comprovante }));
}
function resumoVenda(v) {
  const parc = parcelasVenda(v.id);
  const recebido = parc.reduce((a, p) => a + (p.recebido ? (p.recebido_valor || p.valor) : 0), 0);
  const aReceber = (v.valor || 0) - recebido;
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasado = parc.some(p => !p.recebido && p.vencimento && p.vencimento < hoje);
  return { recebido, aReceber, atrasado };
}
router.get('/vendas', (req, res) => {
  const emp = req.usuario.empresa_id;
  const cond = ['empresa_id=?']; const args = [emp];
  if (req.query.busca) { cond.push('(fornecedor_nome LIKE ? OR codigo LIKE ?)'); const b = `%${req.query.busca}%`; args.push(b, b); }
  const rows = db.prepare(`SELECT * FROM tmkt_vendas WHERE ${cond.join(' AND ')} ORDER BY criado_em DESC`).all(...args);
  const espCount = db.prepare('SELECT COUNT(*) n FROM tmkt_venda_espacos WHERE venda_id=?');
  const compCount = db.prepare("SELECT COUNT(*) n FROM tmkt_venda_briefing WHERE venda_id=? AND tipo='comprovacao'");
  res.json({ status: STATUS, vendas: rows.map(v => ({ ...v, espacos: espCount.get(v.id).n, tem_comprovacao: compCount.get(v.id).n > 0, ...resumoVenda(v) })) });
});
router.get('/vendas/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  v.espacos = db.prepare(`SELECT id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_id, loja_nome, slot,
      modo_venda, insercoes, agenda, criativo_tipo, criativo_texto, (arte_b64 IS NOT NULL) AS tem_arte, arte_mime,
      COALESCE(producao,0) AS producao, COALESCE(producao_custo,0) AS producao_custo, COALESCE(producao_isenta,0) AS producao_isenta,
      briefing, COALESCE(briefing_status,'rascunho') AS briefing_status, COALESCE(arte_status,'pendente') AS arte_status, arte_obs,
      (SELECT (el.foto IS NOT NULL AND el.foto<>'') FROM tmkt_espaco_loja el WHERE el.id=tmkt_venda_espacos.espaco_id) AS espaco_tem_foto,
      (SELECT COUNT(*) FROM tmkt_venda_briefing bb WHERE bb.venda_id=tmkt_venda_espacos.venda_id AND bb.tipo='comprovacao' AND bb.espaco_id=tmkt_venda_espacos.id) AS comprovacoes
    FROM tmkt_venda_espacos WHERE venda_id=?`).all(v.id)
    .map(e => ({ ...e, tem_arte: !!e.tem_arte, producao: !!e.producao, producao_isenta: !!e.producao_isenta, espaco_tem_foto: !!e.espaco_tem_foto, comprovacoes: e.comprovacoes || 0 }));
  v.parcelas = parcelasVenda(v.id);
  v.eans = v.eans_monitorados ? JSON.parse(v.eans_monitorados) : [];
  Object.assign(v, resumoVenda(v));
  res.json({ venda: v });
});
// Diretor exclui/inclui uma negociação da contagem de PREMIAÇÃO/META (ex.: vendas de campanha de fim
// de ano que não devem premiar). Só diretoria. A venda continua valendo financeiramente; só sai da meta.
router.post('/vendas/:id/nao-premia', exigePerfil('Diretor Geral', 'Gestor Geral'), (req, res) => {
  const b = req.body || {}, emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const fora = b.nao_premia ? 1 : 0;
  db.prepare("UPDATE tmkt_vendas SET nao_premia=?, nao_premia_motivo=?, nao_premia_por=?, nao_premia_em=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END, atualizado_em=datetime('now') WHERE id=?")
    .run(fora, fora ? (b.motivo || null) : null, fora ? req.usuario.id : null, fora, v.id);
  res.json({ ok: true, nao_premia: fora });
});
// Libera o CPF da pessoa de contato no Portal do fornecedor (acompanha a ação: sell-out + comprovação).
// O CNPJ do fornecedor já costuma passar pelo Alpha; aqui garantimos o CPF na allowlist.
function liberarAcessoContato(emp, cpf11, nome) {
  if (!cpf11 || cpf11.length !== 11) return;
  try {
    db.prepare(`INSERT INTO tmkt_acesso_liberado (empresa_id, documento, nome, observacao, ativo, criado_por, criado_em)
      VALUES (?,?,?,?,1,'trade',datetime('now'))
      ON CONFLICT(empresa_id, documento) DO UPDATE SET nome=COALESCE(excluded.nome, tmkt_acesso_liberado.nome), ativo=1`)
      .run(emp, cpf11, nome || null, 'contato de negociação de trade');
  } catch (e) { /* ignora */ }
}

router.post('/vendas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  if (!b.fornecedor_nome) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_vendas (id,empresa_id,codigo,origem,associacao_id,associacao_nome,fornecedor_id,fornecedor_nome,loja_id,forma_pagamento,tema_id,tema_desc,plano_id,plano_nome,nao_ocupa,contrato_url,vigencia_ini,vigencia_fim,valor,status,eans_monitorados,observacao,status_desde,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))`)
    .run(id, emp, proximoCodigo(emp), b.origem === 'associacao' ? 'associacao' : 'direto', b.associacao_id || null, b.associacao_nome || null,
      b.fornecedor_id || null, b.fornecedor_nome, b.loja_id || null, b.forma_pagamento || null,
      b.tema_id || null, b.tema_desc || null, b.plano_id || null, b.plano_nome || null, b.nao_ocupa ? 1 : 0, b.contrato_url || null, b.vigencia_ini || null, b.vigencia_fim || null,
      Number(b.valor) || 0, STATUS.includes(b.status) ? b.status : 'rascunho',
      b.eans ? JSON.stringify(b.eans) : null, b.observacao || null, req.usuario.id);
  const contatoCpf = String(b.contato_cpf || '').replace(/\D/g, '');
  if (contatoCpf || b.contato_nome) {
    db.prepare('UPDATE tmkt_vendas SET contato_cpf=?, contato_nome=? WHERE id=? AND empresa_id=?').run(contatoCpf || null, b.contato_nome || null, id, emp);
    liberarAcessoContato(emp, contatoCpf, b.contato_nome);
  }
  const lojasCsv = Array.isArray(b.lojas) ? b.lojas.filter(Boolean).join(',') : String(b.lojas || '');
  if (lojasCsv) db.prepare('UPDATE tmkt_vendas SET lojas=?, loja_id=? WHERE id=? AND empresa_id=?').run(lojasCsv, lojasCsv.split(',')[0] || null, id, emp);
  if (b.uso_interno) db.prepare('UPDATE tmkt_vendas SET uso_interno=1 WHERE id=? AND empresa_id=?').run(id, emp);
  res.json({ ok: true, id });
});

// ── Associações (ex.: Multmais): cadastro + ação (bonificação por expor a marca) ──────────────
router.get('/associacoes', exigePerfil(...GESTAO), (req, res) => {
  res.json({ associacoes: db.prepare('SELECT * FROM tmkt_associacao WHERE empresa_id=? AND ativo=1 ORDER BY nome').all(req.usuario.empresa_id) });
});
router.post('/associacoes', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  if (!b.nome) return res.status(400).json({ erro: 'Informe o nome da associação.' });
  const id = b.id || uuid();
  const existe = db.prepare('SELECT 1 FROM tmkt_associacao WHERE id=? AND empresa_id=?').get(id, emp);
  if (existe) db.prepare('UPDATE tmkt_associacao SET nome=?, cnpj=?, observacao=? WHERE id=? AND empresa_id=?').run(b.nome, b.cnpj || null, b.observacao || null, id, emp);
  else db.prepare("INSERT INTO tmkt_associacao (id,empresa_id,nome,cnpj,observacao,ativo,criado_em) VALUES (?,?,?,?,?,1,datetime('now'))").run(id, emp, b.nome, b.cnpj || null, b.observacao || null);
  res.json({ ok: true, id });
});
router.delete('/associacoes/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE tmkt_associacao SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// Cria a AÇÃO da associação: bonificação por expor a marca de um laboratório. modo='por_loja' gera
// UMA negociação por loja (cada R$ valor, sua comprovação e seu recebimento); modo='unico' gera uma.
router.post('/associacoes/acao', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  if (!b.associacao_nome) return res.status(400).json({ erro: 'Informe a associação.' });
  if (!b.laboratorio_nome) return res.status(400).json({ erro: 'Informe o laboratório/marca exposta.' });
  const valor = Number(b.valor) || 0;
  const espaco = (b.espaco_desc || '').trim() || 'Ponta de gôndola';
  const status = STATUS.includes(b.status) ? b.status : 'confirmado';
  const modo = b.modo === 'unico' ? 'unico' : 'por_loja';
  const lojas = modo === 'por_loja'
    ? (Array.isArray(b.lojas) ? b.lojas.filter(l => l && (l.id || l.nome)) : [])
    : [{ id: null, nome: null }];
  if (modo === 'por_loja' && !lojas.length) return res.status(400).json({ erro: 'Escolha ao menos uma loja que vai expor.' });
  const venc = b.vencimento || b.vigencia_fim || null;
  const insV = db.prepare(`INSERT INTO tmkt_vendas (id,empresa_id,codigo,origem,associacao_id,associacao_nome,fornecedor_id,fornecedor_nome,loja_id,tema_desc,vigencia_ini,vigencia_fim,valor,status,eans_monitorados,observacao,status_desde,criado_por,criado_em)
    VALUES (?,?,?,'associacao',?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))`);
  const insE = db.prepare('INSERT INTO tmkt_venda_espacos (id,empresa_id,venda_id,espaco_desc,valor,loja_id,loja_nome) VALUES (?,?,?,?,?,?,?)');
  const insP = db.prepare('INSERT INTO tmkt_parcelas (id,empresa_id,venda_id,numero,vencimento,valor,recebido) VALUES (?,?,?,1,?,?,0)');
  const ids = [];
  const tx = db.transaction(() => {
    for (const lj of lojas) {
      const id = uuid();
      insV.run(id, emp, proximoCodigo(emp), b.associacao_id || null, b.associacao_nome,
        b.laboratorio_id || null, b.laboratorio_nome, lj.id || null, espaco,
        b.vigencia_ini || null, b.vigencia_fim || null, valor, status,
        b.eans ? JSON.stringify(b.eans) : null, b.observacao || null, req.usuario.id);
      insE.run(uuid(), emp, id, espaco, valor, lj.id || null, lj.nome || null);
      if (valor > 0) insP.run(uuid(), emp, id, venc, valor);
      ids.push(id);
    }
  });
  tx();
  res.json({ ok: true, criadas: ids.length, ids });
});
router.put('/vendas/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  const campos = ['fornecedor_id', 'fornecedor_nome', 'loja_id', 'forma_pagamento', 'tema_id', 'tema_desc', 'plano_id', 'plano_nome', 'contrato_url', 'vigencia_ini', 'vigencia_fim', 'valor', 'status', 'observacao', 'origem', 'associacao_id', 'associacao_nome', 'motivo_perda'];
  const set = [], vals = [];
  campos.forEach(c => { if (c in b) { set.push(`${c}=?`); vals.push(b[c] === '' ? null : b[c]); } });
  if ('eans' in b) { set.push('eans_monitorados=?'); vals.push(b.eans ? JSON.stringify(b.eans) : null); }
  if ('nao_ocupa' in b) { set.push('nao_ocupa=?'); vals.push(b.nao_ocupa ? 1 : 0); }
  if ('contato_nome' in b) { set.push('contato_nome=?'); vals.push(b.contato_nome || null); }
  if ('contato_cpf' in b) { const c = String(b.contato_cpf || '').replace(/\D/g, ''); set.push('contato_cpf=?'); vals.push(c || null); if (c.length === 11) liberarAcessoContato(emp, c, b.contato_nome); }
  if ('lojas' in b) { const csv = Array.isArray(b.lojas) ? b.lojas.filter(Boolean).join(',') : String(b.lojas || ''); set.push('lojas=?'); vals.push(csv || null); set.push('loja_id=?'); vals.push(csv.split(',')[0] || null); }
  if ('uso_interno' in b) { set.push('uso_interno=?'); vals.push(b.uso_interno ? 1 : 0); }
  if (set.length) { set.push("atualizado_em=datetime('now')"); db.prepare(`UPDATE tmkt_vendas SET ${set.join(',')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp); }
  res.json({ ok: true });
});
// gera (ou devolve) o link de aprovação do fornecedor: ele abre, dá ciência e aprova → vai pra veiculação
router.post('/vendas/:id/gerar-link', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT id, token, token_curto FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Negociação não encontrada.' });
  let t = v.token;
  if (!t) { t = uuid().replace(/-/g, ''); db.prepare('UPDATE tmkt_vendas SET token=? WHERE id=?').run(t, v.id); }
  let curto = v.token_curto;
  if (!curto) { curto = uuid().replace(/-/g, '').slice(0, 8); db.prepare('UPDATE tmkt_vendas SET token_curto=? WHERE id=?').run(curto, v.id); }
  res.json({ ok: true, token: t, curto, link: `/t/${curto}` });
});
router.post('/vendas/:id/mover', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, novo = req.body.status;
  if (!STATUS.includes(novo)) return res.status(400).json({ erro: 'Status inválido.' });
  // Trava por data: só ENCERRA depois da data de fim da veiculação — antes disso permanece "em veiculação".
  if (novo === 'encerrado') {
    const v = db.prepare('SELECT vigencia_fim FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
    const hoje = new Date().toISOString().slice(0, 10);
    const fim = v && v.vigencia_fim ? String(v.vigencia_fim).slice(0, 10) : null;
    if (fim && fim > hoje) return res.status(400).json({ erro: `Só dá pra encerrar após a data de fim da veiculação (${fim.split('-').reverse().join('/')}). Até lá, a ação fica em veiculação.` });
  }
  db.prepare("UPDATE tmkt_vendas SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?").run(novo, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/vendas/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const temRecebido = db.prepare('SELECT 1 FROM tmkt_parcelas WHERE venda_id=? AND empresa_id=? AND recebido=1 LIMIT 1').get(req.params.id, emp);
  if (temRecebido) return res.status(400).json({ erro: 'Esta negociação já tem recebimento lançado — cancele (não exclua), para não perder o histórico financeiro.' });
  db.prepare('DELETE FROM tmkt_venda_espacos WHERE venda_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_parcelas WHERE venda_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_vendas WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});

// Espaços vendidos numa venda
router.post('/vendas/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  // Trava do slot: não deixa vender mais vagas do que o espaço-loja tem (quantidade).
  let slot = null;
  // Trade "não ocupa" (só comprovação/foto) não consome vaga — pula a trava e não vira slot.
  const vendaNaoOcupa = !!(db.prepare('SELECT COALESCE(nao_ocupa,0) n FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp) || {}).n;
  if (b.espaco_id && !vendaNaoOcupa) {
    const el = db.prepare('SELECT quantidade FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp);
    if (el) {
      const ocupados = db.prepare(`SELECT COUNT(*) n FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
        WHERE ve.espaco_id=? AND v.status IN ${OCUPA_STATUS} AND COALESCE(v.nao_ocupa,0)=0`).get(b.espaco_id).n;
      if (ocupados >= (el.quantidade || 0)) return res.status(400).json({ erro: `Espaço esgotado — ${ocupados}/${el.quantidade} vagas já ocupadas.` });
      slot = ocupados + 1;
    }
  }
  db.prepare('INSERT INTO tmkt_venda_espacos (id,empresa_id,venda_id,espaco_id,espaco_desc,area_desc,valor,loja_id,loja_nome,slot) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), emp, req.params.id, b.espaco_id || null, b.espaco_desc || null, b.area_desc || null, Number(b.valor) || 0, b.loja_id || null, b.loja_nome || null, slot);
  res.json({ ok: true, slot });
});
router.delete('/vendas/:id/espacos/:eid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_venda_espacos WHERE id=? AND venda_id=? AND empresa_id=?').run(req.params.eid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Parcelas + baixa (recebimento)
router.post('/vendas/:id/parcelas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  // gera N parcelas a partir de valor total / n, vencendo mensalmente a partir de data_ini
  const n = Math.max(1, Math.min(36, Number(b.parcelas) || 1));
  const total = Number(b.valor) || 0;
  const base = b.primeiro_venc ? new Date(b.primeiro_venc + 'T00:00:00') : new Date();
  const jaTem = db.prepare('SELECT COALESCE(MAX(numero),0) m FROM tmkt_parcelas WHERE venda_id=?').get(req.params.id).m || 0;
  const ins = db.prepare('INSERT INTO tmkt_parcelas (id,empresa_id,venda_id,numero,vencimento,valor,recebido) VALUES (?,?,?,?,?,?,0)');
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const d = new Date(base); d.setMonth(d.getMonth() + i);
      ins.run(uuid(), emp, req.params.id, jaTem + i + 1, d.toISOString().slice(0, 10), Math.round((total / n) * 100) / 100);
    }
  });
  tx();
  res.json({ ok: true, geradas: n });
});
router.post('/parcelas/:pid/baixa', exigePerfil(...GESTAO), (req, res) => {
  const p = db.prepare('SELECT * FROM tmkt_parcelas WHERE id=? AND empresa_id=?').get(req.params.pid, req.usuario.empresa_id);
  if (!p) return res.status(404).json({ erro: 'Parcela não encontrada.' });
  const receber = !p.recebido;
  db.prepare('UPDATE tmkt_parcelas SET recebido=?, recebido_em=?, recebido_valor=? WHERE id=?')
    .run(receber ? 1 : 0, receber ? new Date().toISOString().slice(0, 10) : null, receber ? (Number(req.body.valor) || p.valor) : 0, p.id);
  res.json({ ok: true });
});
router.delete('/parcelas/:pid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_parcelas WHERE id=? AND empresa_id=?').run(req.params.pid, req.usuario.empresa_id);
  res.json({ ok: true });
});
// editar a parcela: forma, vencimento, valor + NF da bonificação
router.put('/parcelas/:pid', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const sets = [], vals = [];
  if (b.forma !== undefined) { sets.push('forma=?'); vals.push(b.forma || null); }
  if (b.vencimento !== undefined) { sets.push('vencimento=?'); vals.push(b.vencimento || null); }
  if (b.valor !== undefined) { sets.push('valor=?'); vals.push(Number(b.valor) || 0); }
  if (b.nf_numero !== undefined) { sets.push('nf_numero=?'); vals.push(b.nf_numero || null); }
  if (b.nf_data !== undefined) { sets.push('nf_data=?'); vals.push(b.nf_data || null); }
  if (b.nf_valor !== undefined) { sets.push('nf_valor=?'); vals.push(b.nf_valor === '' ? null : Number(b.nf_valor) || 0); }
  if (!sets.length) return res.json({ ok: true });
  sets.push("informado_por='gestao'");
  db.prepare(`UPDATE tmkt_parcelas SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.pid, emp);
  res.json({ ok: true });
});
// anexo da parcela (comprovante de depósito / e-mail de autorização do abatimento)
router.post('/parcelas/:pid/comprovante', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}; if (!b.foto) return res.status(400).json({ erro: 'Anexe o arquivo.' });
  const r = db.prepare("UPDATE tmkt_parcelas SET comprovante_foto=?, comprovante_mime=?, comprovante_em=datetime('now'), informado_por='gestao' WHERE id=? AND empresa_id=?")
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.pid, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Parcela não encontrada.' });
  res.json({ ok: true });
});
router.get('/parcelas/:pid/comprovante', (req, res) => {
  const r = db.prepare('SELECT comprovante_foto, comprovante_mime FROM tmkt_parcelas WHERE id=? AND empresa_id=?').get(req.params.pid, req.usuario.empresa_id);
  if (!r || !r.comprovante_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.comprovante_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.comprovante_mime || 'application/octet-stream'); res.send(Buffer.from(String(r.comprovante_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// busca de NF do fornecedor no Alpha (p/ a bonificação) — best effort
router.get('/erp/notas', tradeCache, async (req, res) => {
  if (!habilitado()) return res.json({ ok: true, notas: [] });
  const fid = Number(req.query.fornecedor_id) || 0;
  if (!fid) return res.json({ ok: true, notas: [] });
  const num = String(req.query.q || '').replace(/\D/g, '');
  try {
    const sql = `SELECT nf.id, nf.numero, to_char(nf.datahoraentrada,'YYYY-MM-DD') data
      FROM notafiscal nf WHERE nf.fornecedorid=$1 ${num ? "AND nf.numero::text LIKE $2" : ''}
      ORDER BY nf.datahoraentrada DESC LIMIT 15`;
    const notas = await erpQuery(sql, num ? [fid, '%' + num + '%'] : [fid]);
    res.json({ ok: true, notas });
  } catch (e) { res.json({ ok: true, notas: [], erro: 'Busca de NF indisponível.' }); }
});

// ── Sell-out do ERP: vendas dos EANs monitorados no período do contrato × período anterior ──
router.get('/vendas/:id/sellout', tradeCache, async (req, res) => {
  const v = db.prepare('SELECT * FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const eans = v.eans_monitorados ? JSON.parse(v.eans_monitorados) : [];
  if (!eans.length || !v.vigencia_ini || !v.vigencia_fim) return res.json({ ok: false, motivo: 'Defina EANs monitorados e a vigência (início/fim).' });
  if (!habilitado()) return res.status(503).json({ erro: 'ERP indisponível.' });
  const ini = v.vigencia_ini, fim = v.vigencia_fim;
  const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 86400000));
  const antIni = new Date(new Date(ini).getTime() - dias * 86400000).toISOString().slice(0, 10);
  // filtro de loja: se a venda tem loja, usa a unidade do ERP
  const loja = v.loja_id ? db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(v.loja_id) : null;
  const uni = loja && loja.erp_unidadenegocio_id ? loja.erp_unidadenegocio_id : null;
  const sql = `SELECT e.codigobarras ean, sum(iv.quantidade) qt, sum(iv.valortotal) vl
    FROM itemvenda iv JOIN embalagem e ON e.id=iv.embalagemid JOIN venda v ON v.id=iv.vendaid
    WHERE e.codigobarras = ANY($1::text[]) AND v.status='F'
      AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)
      ${uni ? 'AND v.unidadenegocioid=$4' : ''} GROUP BY 1`;
  try {
    const pCon = [eans, ini, fim]; if (uni) pCon.push(uni);
    const pAnt = [eans, antIni, ini]; if (uni) pAnt.push(uni);
    const [con, ant] = await Promise.all([erpQuery(sql, pCon), erpQuery(sql, pAnt)]);
    const mapa = {};
    eans.forEach(x => mapa[x] = { ean: x, qtd_contrato: 0, valor_contrato: 0, qtd_anterior: 0, valor_anterior: 0 });
    con.forEach(r => { if (mapa[r.ean]) { mapa[r.ean].qtd_contrato = Number(r.qt) || 0; mapa[r.ean].valor_contrato = Number(r.vl) || 0; } });
    ant.forEach(r => { if (mapa[r.ean]) { mapa[r.ean].qtd_anterior = Number(r.qt) || 0; mapa[r.ean].valor_anterior = Number(r.vl) || 0; } });
    const itens = Object.values(mapa).map(m => ({ ...m, variacao: m.valor_anterior ? Math.round((m.valor_contrato - m.valor_anterior) / m.valor_anterior * 100) : null }));
    res.json({ ok: true, periodo: { ini, fim, dias, antIni }, loja: uni ? true : false, itens });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// ── ERP: fornecedor + produto (para EAN monitorado) + lojas ──────────────
router.get('/erp/fornecedores', tradeCache, async (req, res) => {
  if (!habilitado() || (req.query.q || '').length < 2) return res.json({ fornecedores: [] });
  try {
    const r = await erpQuery(`SELECT f.id, p.nome FROM fornecedor f JOIN pessoa p ON p.id=f.pessoaid WHERE f.status='A' AND p.nome ILIKE $1 ORDER BY p.nome LIMIT 20`, [`%${req.query.q}%`]);
    res.json({ fornecedores: r.map(x => ({ id: String(x.id), nome: x.nome })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
// busca pessoa no ERP (nome ou CPF) p/ vincular o contato da negociação
router.get('/erp/pessoas', tradeCache, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!habilitado() || q.length < 3) return res.json({ pessoas: [] });
  try {
    const dig = q.replace(/\D/g, '');
    const porCpf = dig.length >= 5;
    const r = await erpQuery(
      `SELECT id, nome, lpad(regexp_replace(COALESCE(cpf,''),'\\D','','g'),11,'0') cpf FROM pessoa
       WHERE tipo='F' AND (nome ILIKE $1${porCpf ? " OR regexp_replace(COALESCE(cpf,''),'\\D','','g') LIKE $2" : ''})
       ORDER BY nome LIMIT 20`,
      porCpf ? [`%${q}%`, `%${dig}%`] : [`%${q}%`]);
    res.json({ pessoas: r.map(x => ({ id: String(x.id), nome: x.nome, cpf: x.cpf, ean: x.cpf })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
router.get('/erp/produtos', tradeCache, async (req, res) => {
  if (!habilitado() || (req.query.q || '').length < 2) return res.json({ produtos: [] });
  try {
    const r = await erpQuery(`SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id
      WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 20`, [`%${req.query.q}%`]);
    res.json({ produtos: r.map(x => ({ id: String(x.id), nome: x.nome, ean: x.ean })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});
// escopo do Alpha p/ a ação do calendário (produto/fornecedor/laboratório/classificação/caderno/pessoa/grupos)
router.get('/erp/escopo', tradeCache, async (req, res) => {
  const tipo = req.query.tipo, q = (req.query.q || '').trim();
  if (!habilitado()) return res.json({ itens: [] });
  if (q.length < 2 && tipo !== 'caderno') return res.json({ itens: [] });
  const like = `%${q}%`;
  try {
    let rows = [];
    if (tipo === 'produto') rows = await erpQuery(`SELECT DISTINCT ON (p.id) p.id, p.descricao nome, e.codigobarras ean FROM produto p JOIN embalagem e ON e.produtoid=p.id WHERE p.descricao ILIKE $1 OR e.codigobarras ILIKE $1 ORDER BY p.id, length(e.codigobarras) DESC LIMIT 25`, [like]);
    else if (tipo === 'fornecedor') rows = await erpQuery(`SELECT f.id, pe.nome FROM fornecedor f JOIN pessoa pe ON pe.id=f.pessoaid WHERE f.status='A' AND pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'laboratorio') rows = await erpQuery(`SELECT f.id, pe.nome FROM fabricante f JOIN pessoa pe ON pe.id=f.pessoaid WHERE pe.nome ILIKE $1 ORDER BY pe.nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'classificacao') rows = await erpQuery(`SELECT id, nome FROM classificacao WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'caderno') rows = await erpQuery(`SELECT id, nome, to_char(datahorainicial,'DD/MM/YYYY') ini, to_char(datahorafinal,'DD/MM/YYYY') fim FROM cadernooferta WHERE nome ILIKE $1 ORDER BY datahorainicial DESC NULLS LAST LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'pessoa') rows = await erpQuery(`SELECT id, nome FROM pessoa WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'grupo_remarcacao') rows = await erpQuery(`SELECT id, nome FROM gruporemarcacao WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    else if (tipo === 'grupo_preco') rows = await erpQuery(`SELECT id, nome FROM grupopreco WHERE nome ILIKE $1 ORDER BY nome LIMIT 25`, [like]).catch(() => []);
    res.json({ itens: rows.map(x => ({ id: String(x.id), nome: x.nome + (x.ini ? ` (${x.ini}–${x.fim})` : ''), ean: x.ean || null })) });
  } catch (e) { res.json({ itens: [], erro: e.message }); }
});

// ── CRM PROATIVO DE TRADE (fase 1) — classificação do Alpha → MARCAS → contato da marca ──────────
// marcas (fabricantes) que têm produto naquela classificação + se já têm contato cadastrado no Mutti
router.get('/erp/classificacao/:id/marcas', tradeCache, async (req, res) => {
  const emp = req.usuario.empresa_id;
  if (!habilitado()) return res.json({ marcas: [] });
  let rows = [];
  try {
    rows = await erpQuery(`SELECT fab.id fabricante_id, COALESCE(pp.razaosocial, pp.nome) marca, COUNT(DISTINCT cp.produtoid) produtos
      FROM classificacaoproduto cp
      JOIN produto pr ON pr.id = cp.produtoid
      JOIN fabricante fab ON fab.id = pr.fabricanteid
      JOIN pessoa pp ON pp.id = fab.pessoaid
      WHERE cp.classificacaoid = $1
      GROUP BY fab.id, pp.razaosocial, pp.nome
      ORDER BY produtos DESC LIMIT 300`, [req.params.id]);
  } catch (e) { return res.json({ marcas: [], erro: e.message }); }
  const contatos = db.prepare('SELECT fabricante_id, email, whatsapp, responsavel FROM tmkt_marca_contato WHERE empresa_id=?').all(emp)
    .reduce((m, c) => (m[String(c.fabricante_id)] = c, m), {});
  res.json({
    marcas: rows.map(r => {
      const c = contatos[String(r.fabricante_id)];
      return { fabricante_id: String(r.fabricante_id), marca: r.marca, produtos: Number(r.produtos) || 0, email: (c && c.email) || null, whatsapp: (c && c.whatsapp) || null, responsavel: (c && c.responsavel) || null, tem_contato: !!(c && (c.email || c.whatsapp)) };
    })
  });
});
// cadastro do contato de TRADE da marca (o ERP não tem; a gente mantém)
router.get('/marcas/contatos', (req, res) => {
  res.json({ contatos: db.prepare('SELECT id, fabricante_id, marca_nome, email, whatsapp, responsavel, obs FROM tmkt_marca_contato WHERE empresa_id=? ORDER BY marca_nome').all(req.usuario.empresa_id) });
});
router.put('/marcas/contato/:fabId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const ex = db.prepare('SELECT id FROM tmkt_marca_contato WHERE empresa_id=? AND fabricante_id=?').get(emp, String(req.params.fabId));
  if (ex) db.prepare(`UPDATE tmkt_marca_contato SET marca_nome=?, email=?, whatsapp=?, responsavel=?, obs=?, atualizado_em=datetime('now') WHERE id=?`)
    .run(b.marca_nome || null, b.email || null, b.whatsapp || null, b.responsavel || null, b.obs || null, ex.id);
  else db.prepare(`INSERT INTO tmkt_marca_contato (id,empresa_id,fabricante_id,marca_nome,email,whatsapp,responsavel,obs,criado_em,atualizado_em) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .run(uuid(), emp, String(req.params.fabId), b.marca_nome || null, b.email || null, b.whatsapp || null, b.responsavel || null, b.obs || null);
  res.json({ ok: true });
});
// banco de frases de efeito (escolher a que vai no e-mail)
router.get('/crm/frases', (req, res) => {
  res.json({ frases: db.prepare('SELECT id, texto, sub, ativo, ordem FROM tmkt_crm_frase WHERE empresa_id=? ORDER BY ordem, criado_em').all(req.usuario.empresa_id) });
});
router.post('/crm/frases', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}; if (!b.texto) return res.status(400).json({ erro: 'Informe a frase.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_crm_frase (id,empresa_id,texto,sub,ordem,ativo,criado_em) VALUES (?,?,?,?,?,1,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.texto, b.sub || null, Number(b.ordem) || 99);
  res.json({ ok: true, id });
});
router.delete('/crm/frases/:id', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_crm_frase WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
// ── CRM proativo GENÉRICO: alvo = evento | plano | espaco ────────────────────
const CRM_TIPOS = ['evento', 'plano', 'espaco'];
const okTipo = t => CRM_TIPOS.includes(t);
// vínculo alvo ↔ classificação(ões) do Alpha (quem avisar)
router.get('/crm/:tipo/:id/classificacoes', (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  res.json({ classificacoes: db.prepare('SELECT classificacao_id, nome FROM tmkt_crm_vinculo WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').all(req.usuario.empresa_id, req.params.tipo, String(req.params.id)) });
});
router.put('/crm/:tipo/:id/classificacoes', exigePerfil(...GESTAO), (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  const emp = req.usuario.empresa_id, arr = Array.isArray((req.body || {}).classificacoes) ? req.body.classificacoes : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM tmkt_crm_vinculo WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').run(emp, req.params.tipo, String(req.params.id));
    const ins = db.prepare(`INSERT INTO tmkt_crm_vinculo (id,empresa_id,escopo_tipo,escopo_id,classificacao_id,nome,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`);
    arr.forEach(c => { if (c && c.classificacao_id) ins.run(uuid(), emp, req.params.tipo, String(req.params.id), String(c.classificacao_id), c.nome || null); });
  });
  tx();
  res.json({ ok: true });
});
router.get('/crm/:tipo/:id/outreach', async (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  const emp = req.usuario.empresa_id;
  const config = db.prepare('SELECT ativo, dias_antes, recorrente, assunto, mensagem, intervalo_dias, so_com_estoque, frase_id FROM tmkt_crm_outreach WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').get(emp, req.params.tipo, String(req.params.id))
    || { ativo: 0, dias_antes: 15, recorrente: 1, assunto: '', mensagem: '', intervalo_dias: 15, so_com_estoque: 1, frase_id: null };
  let alvos = [];
  try { alvos = await outreach.marcasAlvo(emp, req.params.tipo, req.params.id); } catch (e) { /* ERP off */ }
  const o = outreach.owner(emp, req.params.tipo, req.params.id);
  const frases = db.prepare('SELECT id, texto FROM tmkt_crm_frase WHERE empresa_id=? AND ativo=1 ORDER BY ordem, criado_em').all(emp);
  const extra = {};
  if (req.params.tipo === 'espaco') { try { extra.livres = outreach.livresDoEspaco(emp, req.params.id); } catch (e) { } }
  res.json({ ok: true, config, alvos, com_email: alvos.length, agendavel: !!(o && o.proxData), prox_data: o ? o.proxData : null, frases, ...extra });
});
// prévia (simulação) do e-mail que será enviado
router.get('/crm/:tipo/:id/outreach/preview', async (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  const base = '//' + req.get('host'); // domínio atual (protocol-relative) p/ as imagens carregarem na prévia
  let html = '';
  try { html = await outreach.previewHtml(req.usuario.empresa_id, req.params.tipo, req.params.id, base); } catch (e) { html = '<div style="padding:24px;font-family:Arial;color:#b91c1c">Erro ao gerar prévia.</div>'; }
  res.json({ ok: true, html });
});
router.put('/crm/:tipo/:id/outreach', exigePerfil(...GESTAO), (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  const emp = req.usuario.empresa_id, b = req.body || {};
  const ex = db.prepare('SELECT id FROM tmkt_crm_outreach WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=?').get(emp, req.params.tipo, String(req.params.id));
  const vals = [b.ativo ? 1 : 0, Math.max(1, Number(b.dias_antes) || 15), b.recorrente ? 1 : 0, b.assunto || null, b.mensagem || null, Math.max(1, Number(b.intervalo_dias) || 15), b.so_com_estoque === 0 || b.so_com_estoque === false ? 0 : 1, b.frase_id || null];
  if (ex) db.prepare(`UPDATE tmkt_crm_outreach SET ativo=?, dias_antes=?, recorrente=?, assunto=?, mensagem=?, intervalo_dias=?, so_com_estoque=?, frase_id=?, atualizado_em=datetime('now') WHERE id=?`).run(...vals, ex.id);
  else db.prepare(`INSERT INTO tmkt_crm_outreach (id,empresa_id,escopo_tipo,escopo_id,ativo,dias_antes,recorrente,assunto,mensagem,intervalo_dias,so_com_estoque,frase_id,criado_em,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(uuid(), emp, req.params.tipo, String(req.params.id), ...vals);
  res.json({ ok: true });
});
router.post('/crm/:tipo/:id/outreach/enviar', exigePerfil(...GESTAO), async (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  try { const r = await outreach.enviarOportunidade(req.usuario.empresa_id, req.params.tipo, req.params.id, { ocorrencia: (req.body || {}).ocorrencia, soPendentes: (req.body || {}).soPendentes !== false }); res.json(r); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
router.get('/crm/:tipo/:id/outreach/log', (req, res) => {
  if (!okTipo(req.params.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  res.json({ log: db.prepare(`SELECT ocorrencia, marca_nome, email, status, erro, enviado_em FROM tmkt_outreach_log WHERE empresa_id=? AND escopo_tipo=? AND escopo_id=? ORDER BY enviado_em DESC LIMIT 50`).all(req.usuario.empresa_id, req.params.tipo, String(req.params.id)) });
});

// ── Custos / prestação de contas (interno): resultado real do trade = valor − custos ────────────
router.get('/vendas/:id/custos', (req, res) => {
  const v = db.prepare('SELECT valor FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const custos = db.prepare(`SELECT id, descricao, categoria, valor, data, (comprovante_foto IS NOT NULL) AS tem_comprovante, criado_em FROM tmkt_custo WHERE empresa_id=? AND venda_id=? ORDER BY criado_em`).all(req.usuario.empresa_id, req.params.id);
  const totalCusto = custos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const recebido = db.prepare(`SELECT COALESCE(SUM(recebido_valor),0) r FROM tmkt_parcelas WHERE venda_id=? AND recebido=1`).get(req.params.id).r;
  res.json({ ok: true, valor: v.valor, recebido, custos, totalCusto, resultado: Math.round((Number(v.valor) - totalCusto) * 100) / 100 });
});
router.post('/vendas/:id/custos', exigePerfil(...GESTAO), (req, res) => {
  const v = db.prepare('SELECT id FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!v) return res.status(404).json({ erro: 'Venda não encontrada.' });
  const b = req.body || {};
  if (!(Number(b.valor) > 0)) return res.status(400).json({ erro: 'Informe o valor do custo.' });
  db.prepare(`INSERT INTO tmkt_custo (id, empresa_id, venda_id, descricao, categoria, valor, data, comprovante_foto, comprovante_mime, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), req.usuario.empresa_id, req.params.id, b.descricao || null, b.categoria || 'outro', Number(b.valor), b.data || null, b.comprovante || null, b.comprovante ? (b.mime || 'image/jpeg') : null, req.usuario.id);
  res.status(201).json({ ok: true });
});
router.delete('/custos/:cid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_custo WHERE id=? AND empresa_id=?').run(req.params.cid, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── COBRANÇA: parcelas a receber com alerta de vencido / a vencer ───────────────────────────────
router.get('/cobranca', (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT p.id, p.venda_id, p.numero, p.vencimento, p.valor, p.forma, p.recebido, p.recebido_valor,
      (p.comprovante_em IS NOT NULL) AS tem_comprovante, v.codigo, v.fornecedor_nome, v.contato_email, v.contato_nome, v.token, v.status AS venda_status
    FROM tmkt_parcelas p JOIN tmkt_vendas v ON v.id=p.venda_id
    WHERE p.empresa_id=? AND v.status<>'cancelado' ORDER BY p.vencimento NULLS LAST, v.codigo`).all(req.usuario.empresa_id);
  const parcelas = rows.map(p => {
    const situacao = p.recebido ? 'pago' : (p.vencimento && p.vencimento < hoje ? 'vencido' : 'a_vencer');
    const diasAtraso = (!p.recebido && p.vencimento && p.vencimento < hoje) ? Math.round((new Date(hoje) - new Date(p.vencimento)) / 864e5) : 0;
    return { ...p, tem_comprovante: !!p.tem_comprovante, situacao, dias_atraso: diasAtraso };
  });
  const aberto = parcelas.filter(p => !p.recebido);
  const resumo = {
    total_aberto: Math.round(aberto.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    vencido: aberto.filter(p => p.situacao === 'vencido').length,
    valor_vencido: Math.round(aberto.filter(p => p.situacao === 'vencido').reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100,
    com_comprovante_pendente: aberto.filter(p => p.tem_comprovante).length, // fornecedor anexou mas não demos baixa
  };
  res.json({ ok: true, parcelas, resumo, smtp: smtpOk() });
});
// dispara e-mail de cobrança ao fornecedor de uma negociação (parcelas em aberto)
router.post('/cobranca/email', exigePerfil(...GESTAO), async (req, res) => {
  try {
    const r = await cobrarVenda(req.usuario.empresa_id, req.body.venda_id, true);
    res.json({ ok: true, enviado_para: r.to });
  } catch (e) { res.status(/não encontrada|não tem|aberto|SMTP/i.test(e.message) ? 400 : 502).json({ erro: e.message }); }
});
// configuração da cobrança automática (opt-in por empresa): liga/desliga + janela de reenvio
router.get('/cobranca/config', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const g = c => (db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(emp, c) || {}).valor;
  res.json({ ok: true, auto: g('tmkt_cobranca_auto') === '1', dias: Number(g('tmkt_cobranca_dias')) || 3, smtp: smtpOk() });
});
router.post('/cobranca/config', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const set = (c, v) => db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(emp, c, String(v));
  set('tmkt_cobranca_auto', req.body.auto ? '1' : '0');
  const dias = Math.max(1, Math.min(60, Number(req.body.dias) || 3));
  set('tmkt_cobranca_dias', dias);
  res.json({ ok: true, auto: !!req.body.auto, dias });
});

// ── COMPROMISSO DE COMPRA: quanto a empresa JÁ COMPROU do fornecedor × o combinado (alerta) ─────
function periodoCompromisso(periodicidade, iniFixo, fimFixo) {
  const d = x => x.toISOString().slice(0, 10); if (iniFixo && fimFixo) return { ini: iniFixo, fim: fimFixo };
  const n = new Date();
  if (periodicidade === 'trimestral') { const q = Math.floor(n.getMonth() / 3); return { ini: d(new Date(n.getFullYear(), q * 3, 1)), fim: d(new Date(n.getFullYear(), q * 3 + 3, 0)) }; }
  if (periodicidade === 'semestral') { const h = n.getMonth() < 6 ? 0 : 6; return { ini: d(new Date(n.getFullYear(), h, 1)), fim: d(new Date(n.getFullYear(), h + 6, 0)) }; }
  return { ini: d(new Date(n.getFullYear(), n.getMonth(), 1)), fim: d(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
}
async function comprasPorEscopo(tipo, refs, ini, fim) {
  if (!habilitado() || !Array.isArray(refs) || !refs.length) return 0;
  const base = `FROM itemnotafiscal it JOIN notafiscal nf ON nf.id=it.notafiscalid`;
  const per = `nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + 1)`;
  let sql, params;
  try {
    if (tipo === 'produto') { const e = refs.map(r => r.ean).filter(Boolean); if (!e.length) return 0; sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE it.codigobarras = ANY($1::text[]) AND ${per}`; params = [e, ini, fim]; }
    else if (tipo === 'fornecedor') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} WHERE nf.fornecedorid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'laboratorio') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN produto pr ON pr.id=e.produtoid WHERE pr.fabricanteid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'classificacao' || tipo === 'grupo') { sql = `SELECT COALESCE(SUM(it.valortotal),0) v ${base} JOIN embalagem e ON e.codigobarras=it.codigobarras JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid WHERE cp.classificacaoid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else return 0;
    const r = await erpQuery(sql, params); return Number(r[0].v) || 0;
  } catch { return 0; }
}
router.get('/compromissos', async (req, res) => {
  const vendas = db.prepare(`SELECT id, codigo, fornecedor_nome, meta_compra_valor, meta_escopo_tipo, meta_escopo_ref, meta_periodicidade, meta_periodo_ini, meta_periodo_fim, status
    FROM tmkt_vendas WHERE empresa_id=? AND meta_compra_valor>0 AND status<>'cancelado' ORDER BY codigo`).all(req.usuario.empresa_id);
  const hoje = new Date();
  const out = [];
  for (const v of vendas) {
    const refs = v.meta_escopo_ref ? (() => { try { return JSON.parse(v.meta_escopo_ref); } catch { return []; } })() : [];
    const per = periodoCompromisso(v.meta_periodicidade, v.meta_periodo_ini, v.meta_periodo_fim);
    const comprado = await comprasPorEscopo(v.meta_escopo_tipo, refs, per.ini, per.fim);
    const pct = v.meta_compra_valor ? Math.round(comprado / v.meta_compra_valor * 100) : 0;
    const diasRestantes = Math.max(0, Math.round((new Date(per.fim) - hoje) / 864e5));
    const falta = Math.max(0, Math.round((v.meta_compra_valor - comprado) * 100) / 100);
    // alerta: ainda falta comprar e resta pouco tempo (≤10 dias) ou já venceu o período
    const alerta = falta > 0 && (diasRestantes <= 10);
    out.push({ id: v.id, codigo: v.codigo, fornecedor: v.fornecedor_nome, periodicidade: v.meta_periodicidade || 'mensal',
      periodo: per, meta: v.meta_compra_valor, comprado: Math.round(comprado * 100) / 100, pct, falta, dias_restantes: diasRestantes, alerta, escopo_tipo: v.meta_escopo_tipo, refs });
  }
  res.json({ ok: true, compromissos: out, resumo: { total: out.length, em_alerta: out.filter(x => x.alerta).length } });
});

// ════════════ PORTAL DO FORNECEDOR — gestão (Fase 2) ════════════
const soDig = s => String(s || '').replace(/\D/g, '');
const padCnpj = d => { d = soDig(d); return (d && d.length < 14) ? d.padStart(14, '0') : d; };

// pedidos vindos do portal (pendentes de aprovação) + os já aprovados
router.get('/portal/pedidos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const status = req.query.status || 'pedido';
  const vendas = db.prepare(`SELECT id, codigo, fornecedor_nome, fornecedor_cnpj, contato_nome, contato_email, contato_fone,
      valor, status, origem, forma_pagamento, vigencia_ini, vigencia_fim, escopo_tipo, escopo_ref, observacao, criado_em
    FROM tmkt_vendas WHERE empresa_id=? AND origem IN ('portal','recompra') AND status=? ORDER BY criado_em DESC`).all(emp, status);
  const espSt = db.prepare(`SELECT id, espaco_id, espaco_desc, area_desc, valor, quantidade, loja_nome,
      modo_venda, insercoes, agenda, criativo_tipo, criativo_texto, (arte_b64 IS NOT NULL) AS tem_arte, arte_mime,
      COALESCE(producao,0) AS producao, COALESCE(producao_custo,0) AS producao_custo, COALESCE(producao_isenta,0) AS producao_isenta,
      briefing, COALESCE(briefing_status,'rascunho') AS briefing_status, COALESCE(arte_status,'pendente') AS arte_status, arte_obs
    FROM tmkt_venda_espacos WHERE empresa_id=? AND venda_id=?`);
  res.json({
    ok: true,
    pedidos: vendas.map(v => ({
      ...v,
      espacos: espSt.all(emp, v.id).map(e => ({ ...e, tem_arte: !!e.tem_arte, producao: !!e.producao, producao_isenta: !!e.producao_isenta })),
      escopo: v.escopo_ref ? (() => { try { return JSON.parse(v.escopo_ref); } catch { return []; } })() : []
    }))
  });
});
// ── APROVAÇÃO DE MATERIAL (arte fechada) ──────────────────────────────────
// serve a arte anexada de um item (preview p/ a gestão)
router.get('/portal/item/:id/arte', (req, res) => {
  const emp = req.usuario.empresa_id;
  const r = db.prepare('SELECT arte_b64, arte_mime FROM tmkt_venda_espacos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!r || !r.arte_b64) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.arte_b64 || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.arte_mime || 'image/jpeg'); res.send(Buffer.from(String(r.arte_b64).replace(/^data:[^,]+,/, ''), 'base64'));
});
// gestão aprova a arte do item
router.post('/portal/item/:id/arte-aprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_status='aprovada', arte_obs=NULL WHERE id=? AND empresa_id=?`).run(req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão reprova a arte do item (com motivo → fornecedor reenvia)
router.post('/portal/item/:id/arte-reprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const motivo = String((req.body || {}).motivo || '').slice(0, 1000) || 'Ajuste necessário.';
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_status='reprovada', arte_obs=? WHERE id=? AND empresa_id=?`).run(motivo, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão sobe a arte produzida pela Mutti (itens de produção) → entra como "enviada" p/ aprovação
router.post('/portal/item/:id/arte', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.arte) return res.status(400).json({ erro: 'Anexe a arte.' });
  const r = db.prepare(`UPDATE tmkt_venda_espacos SET arte_b64=?, arte_mime=?, criativo_tipo='anexo', arte_status='enviada', arte_obs=NULL WHERE id=? AND empresa_id=?`)
    .run(String(b.arte).slice(0, 8_000_000), b.mime || null, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});
// gestão isenta (ou volta a cobrar) o custo da produção de arte (+R$150) — ajusta o valor do item e da venda
router.post('/portal/item/:id/isentar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const it = db.prepare('SELECT id, venda_id, valor, producao, COALESCE(producao_custo,0) producao_custo, COALESCE(producao_isenta,0) producao_isenta FROM tmkt_venda_espacos WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (!it.producao) return res.status(400).json({ erro: 'Este item não tem produção de arte.' });
  const isenta = (req.body || {}).isenta === false ? 0 : 1; // default: isentar
  if (isenta === it.producao_isenta) return res.json({ ok: true, isenta: !!isenta }); // nada muda
  const custo = it.producao_custo || 150;
  const delta = isenta ? -custo : custo; // isentar tira o custo; voltar a cobrar soma
  const tx = db.transaction(() => {
    db.prepare('UPDATE tmkt_venda_espacos SET producao_isenta=?, valor=? WHERE id=?').run(isenta, Math.max(0, (it.valor || 0) + delta), it.id);
    db.prepare(`UPDATE tmkt_vendas SET valor=MAX(0, COALESCE(valor,0)+?), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(delta, it.venda_id, emp);
  });
  tx();
  res.json({ ok: true, isenta: !!isenta });
});
// aprovar pedido do portal (vira ação vigente)
router.post('/portal/pedido/:id/aprovar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const v = db.prepare('SELECT id, status FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!v) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const novo = req.body.status === 'vendido' ? 'vendido' : 'vigente';
  db.prepare(`UPDATE tmkt_vendas SET status=?, status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(novo, req.params.id, emp);
  res.json({ ok: true, status: novo });
});
router.post('/portal/pedido/:id/recusar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare(`UPDATE tmkt_vendas SET status='recusado', status_desde=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(req.params.id, emp);
  res.json({ ok: true });
});

// fornecedores LIBERADOS (allowlist de acesso ao portal)
router.get('/portal/liberados', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare('SELECT documento, nome, observacao, ativo, criado_em FROM tmkt_acesso_liberado WHERE empresa_id=? ORDER BY criado_em DESC').all(emp);
  res.json({ ok: true, liberados: rows });
});
router.post('/portal/liberados', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const doc = padCnpj(req.body.documento);
  if (doc.length !== 14) return res.status(400).json({ erro: 'Informe um CNPJ válido (14 dígitos).' });
  db.prepare(`INSERT INTO tmkt_acesso_liberado (empresa_id, documento, nome, observacao, ativo, criado_por)
      VALUES (?,?,?,?,1,?) ON CONFLICT(empresa_id,documento) DO UPDATE SET nome=excluded.nome, observacao=excluded.observacao, ativo=1`)
    .run(emp, doc, req.body.nome || null, req.body.observacao || null, req.usuario.nome || req.usuario.id || null);
  res.json({ ok: true });
});
router.delete('/portal/liberados/:doc', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_acesso_liberado WHERE empresa_id=? AND documento=?').run(req.usuario.empresa_id, padCnpj(req.params.doc));
  res.json({ ok: true });
});
// interessados (bloqueados na porta de entrada) + liberar com 1 clique
router.get('/portal/interesse', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare('SELECT id, cnpj, cpf, nome, telefone, email, motivo, liberado, criado_em FROM tmkt_interesse WHERE empresa_id=? ORDER BY liberado, criado_em DESC').all(emp);
  res.json({ ok: true, interessados: rows });
});
router.post('/portal/interesse/:id/liberar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const it = db.prepare('SELECT * FROM tmkt_interesse WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!it) return res.status(404).json({ erro: 'Interessado não encontrado.' });
  const doc = padCnpj(it.cnpj);
  if (doc.length === 14) {
    db.prepare(`INSERT INTO tmkt_acesso_liberado (empresa_id, documento, nome, observacao, ativo, criado_por)
        VALUES (?,?,?,?,1,?) ON CONFLICT(empresa_id,documento) DO UPDATE SET ativo=1`)
      .run(emp, doc, it.nome || null, 'Liberado da lista de interessados', req.usuario.nome || null);
  }
  db.prepare('UPDATE tmkt_interesse SET liberado=1 WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});

// definir/editar a POSIÇÃO à venda (quantidade de vagas, preço, disponível, destaque)
router.patch('/portal/espaco/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const e = db.prepare('SELECT id FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!e) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  const sets = [], vals = [];
  if (b.quantidade != null) { sets.push('quantidade=?'); vals.push(Math.max(1, Number(b.quantidade) || 1)); }
  if (b.preco_unit != null) { sets.push('preco_unit=?'); vals.push(Number(b.preco_unit) || 0); }
  if (b.preco_min !== undefined) { sets.push('preco_min=?'); vals.push((b.preco_min === '' || b.preco_min == null) ? null : (Number(b.preco_min) || null)); }
  if (b.disponivel != null) { sets.push('disponivel=?'); vals.push(b.disponivel ? 1 : 0); }
  if (b.destaque != null) { sets.push('destaque=?'); vals.push(b.destaque ? 1 : 0); }
  if (b.midia != null) { sets.push('midia=?'); vals.push(['off', 'on', 'ambos'].includes(b.midia) ? b.midia : 'off'); }
  if (b.unidade != null) { sets.push('unidade=?'); vals.push(['mes', 'dia', 'semana', 'edicao', 'periodo'].includes(b.unidade) ? b.unidade : 'mes'); }
  if (b.modo_venda != null) { sets.push('modo_venda=?'); vals.push(b.modo_venda === 'insercao' ? 'insercao' : 'periodo'); }
  if (b.limite_dia != null) { sets.push('limite_dia=?'); vals.push(b.limite_dia === '' ? null : Math.max(0, Number(b.limite_dia) || 0)); }
  if (b.limite_mes != null) { sets.push('limite_mes=?'); vals.push(b.limite_mes === '' ? null : Math.max(0, Number(b.limite_mes) || 0)); }
  if (b.area != null) { sets.push('area=?'); vals.push(String(b.area).trim() || null); }
  if (b.espaco != null) { const nome = String(b.espaco).trim(); if (nome) { sets.push('espaco=?'); vals.push(nome); } }
  if (b.tamanho != null) { sets.push('tamanho=?'); vals.push(String(b.tamanho).trim() || null); }
  if (b.descricao != null) { sets.push('descricao=?'); vals.push(String(b.descricao).trim() || null); }
  if (b.foto != null) { sets.push('foto=?'); vals.push((b.foto && /^data:image\//.test(b.foto)) ? String(b.foto).slice(0, 8_000_000) : null); }
  if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
  vals.push(req.params.id, emp);
  db.prepare(`UPDATE tmkt_espaco_loja SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals);
  res.json({ ok: true });
});

// replicar os valores de UMA posição p/ todas as lojas que têm uma posição com o mesmo nome (mesmo segmento)
// — atende "preencher por loja ou todas de uma vez" sem recadastrar loja por loja.
router.delete('/portal/espaco/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const info = db.prepare('DELETE FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  if (!info.changes) return res.status(404).json({ erro: 'Espaço não encontrado.' });
  res.json({ ok: true });
});
router.post('/portal/espaco/:id/replicar', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const base = db.prepare('SELECT * FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!base) return res.status(404).json({ erro: 'Posição não encontrada.' });
  const upd = db.prepare(`UPDATE tmkt_espaco_loja SET preco_unit=?, quantidade=?, midia=?, modo_venda=?, unidade=?, disponivel=?
     WHERE empresa_id=? AND segmento=? AND espaco=? AND id<>?`);
  const r = upd.run(base.preco_unit, base.quantidade, base.midia, base.modo_venda, base.unidade, base.disponivel,
    emp, base.segmento, base.espaco, base.id);
  res.json({ ok: true, atualizadas: r.changes });
});

// criar uma nova posição comercializável
// token de acesso de PRÉVIA — a gestão embute o portal (/trade.html?edit=1) num iframe p/ o editor
// visual; este token persistente abre o catálogo sem precisar do portão de identificação.
router.get('/portal/preview-token', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const token = 'preview-gestao-' + emp;
  try {
    if (!db.prepare('SELECT token FROM tmkt_acesso_sessao WHERE token=?').get(token))
      db.prepare(`INSERT INTO tmkt_acesso_sessao (token, empresa_id, cnpj, cpf, nome, via, criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`).run(token, emp, '', '', 'Prévia da gestão (editor)', 'gestao');
  } catch (e) { return res.status(500).json({ erro: e.message }); }
  res.json({ ok: true, token });
});
router.post('/portal/espaco', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const seg = String(b.segmento || '').trim();
  const SEGS = ['off', 'allline', 'digital', 'encarte', 'ecommerce', 'crm', 'social', 'radio', 'endomarketing'];
  if (!SEGS.includes(seg)) return res.status(400).json({ erro: 'Módulo inválido.' });
  const espaco = String(b.espaco || '').trim();
  if (!espaco) return res.status(400).json({ erro: 'Dê um nome à posição.' });
  const REDE = ['encarte', 'ecommerce', 'crm', 'social', 'endomarketing'];
  // local: rede = ESCRITÓRIO; rádio interna = ESCRITÓRIO; demais = loja/cidade informada
  let loja_nome = String(b.loja_nome || '').trim();
  if (REDE.includes(seg)) loja_nome = loja_nome || 'ESCRITÓRIO'; // rede toda (ESCRITÓRIO) OU por bandeira
  else if (!loja_nome) loja_nome = seg === 'radio' ? 'Esplanada' : 'ESCRITÓRIO';
  const id = require('crypto').randomUUID();
  const fisico = ['off', 'allline', 'digital'].includes(seg);
  const midia = fisico ? (['off', 'on', 'ambos'].includes(b.midia) ? b.midia : 'ambos') : null;
  const modo_venda = b.modo_venda === 'insercao' ? 'insercao' : (['social', 'radio'].includes(seg) ? 'insercao' : 'periodo');
  const unidade = ['mes', 'dia', 'semana', 'edicao', 'periodo'].includes(b.unidade) ? b.unidade
    : (seg === 'encarte' ? 'edicao' : fisico ? 'periodo' : 'mes');
  const foto = (b.foto && /^data:image\//.test(b.foto)) ? String(b.foto).slice(0, 8_000_000) : null;
  const precoMin = (b.preco_min === '' || b.preco_min == null) ? null : (Number(b.preco_min) || null);
  db.prepare(`INSERT INTO tmkt_espaco_loja (id, empresa_id, segmento, area, espaco, tamanho, descricao, loja_nome, loja_id, preco_unit, preco_min, quantidade, midia, modo_venda, unidade, foto, disponivel, destaque)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`)
    .run(id, emp, seg, String(b.area || '').trim() || null, espaco, String(b.tamanho || '').trim() || null,
      String(b.descricao || '').trim() || null, loja_nome, b.loja_id || null,
      Number(b.preco_unit) || 0, precoMin, Math.max(1, Number(b.quantidade) || 1), midia, modo_venda, unidade, foto);
  res.json({ ok: true, id });
});
// lista TUDO que é comercializável p/ a gestão configurar + disponibilidade
// (e-commerce/rádio/CRM/tabloide = PADRÃO DA REDE; espaços físicos = POR LOJA)
router.get('/portal/posicoes', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT id, segmento, area, espaco, tamanho, descricao, loja_id, loja_nome, preco_unit, preco_min, quantidade, COALESCE(modo_venda,'periodo') modo_venda, midia, COALESCE(unidade,'mes') unidade, limite_dia, limite_mes, (foto IS NOT NULL AND foto<>'') AS tem_foto, COALESCE(disponivel,1) disponivel, COALESCE(destaque,0) destaque
    FROM tmkt_espaco_loja WHERE empresa_id=?
    ORDER BY segmento, loja_nome, area, espaco`).all(emp);
  // ocupação atual (vagas já reservadas em vendas ativas, independentemente do período)
  const OCUPA = ['pedido', 'rascunho', 'negociacao', 'vendido', 'vigente', 'concluido'];
  const ph = OCUPA.map(() => '?').join(',');
  const ocup = db.prepare(`SELECT ve.espaco_id, COALESCE(SUM(ve.quantidade),0) q
    FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
    WHERE ve.empresa_id=? AND v.status IN (${ph}) GROUP BY ve.espaco_id`).all(emp, ...OCUPA);
  const ocupMap = {}; ocup.forEach(o => { ocupMap[o.espaco_id] = o.q; });
  // comprometido com PLANO publicado (cota-weighted) — p/ só oferecer estoque livre não vinculado a plano
  let planoMap = {};
  try {
    const pl = db.prepare(`SELECT pe.espaco_id, SUM(pe.quantidade * COALESCE(
        (SELECT c.quantidade FROM tmkt_plano_cotas c WHERE c.id=pe.cota_id),
        (SELECT SUM(c2.quantidade) FROM tmkt_plano_cotas c2 WHERE c2.plano_id=p.id),
        p.cota_qtd, 1)) q
      FROM tmkt_plano_espacos pe JOIN tmkt_plano p ON p.id=pe.plano_id
      WHERE pe.empresa_id=? AND p.status IN ('publicado','vigente') GROUP BY pe.espaco_id`).all(emp);
    pl.forEach(x => { planoMap[x.espaco_id] = x.q; });
  } catch (e) { planoMap = {}; }
  const REDE = ['encarte', 'ecommerce', 'crm', 'social', 'endomarketing'];
  res.json({
    ok: true,
    posicoes: rows.map(r => {
      // rádio externa = por CIDADE (local = cidade); rádio interna + demais rede = ESCRITÓRIO; físicos = por loja
      const radioInterna = r.segmento === 'radio' && /interna/i.test(r.area || '');
      const rede = REDE.includes(r.segmento) || radioInterna;
      const radioExterna = r.segmento === 'radio' && !radioInterna;
      return {
        ...r,
        tem_foto: !!r.tem_foto,
        escopo: rede ? 'rede' : radioExterna ? 'cidade' : 'loja',
        local: rede ? (r.loja_nome || 'ESCRITÓRIO') : (r.loja_nome || '—'),
        ocupadas: ocupMap[r.id] || 0,
        comprometido_plano: planoMap[r.id] || 0,
        livres: Math.max(0, (Number(r.quantidade) || 1) - (ocupMap[r.id] || 0)),
        livre_real: Math.max(0, (Number(r.quantidade) || 1) - (ocupMap[r.id] || 0) - (planoMap[r.id] || 0))
      };
    })
  });
});

// ── MONITOR DE CAPACIDADE (gestão) ─────────────────────────────────────────
// Ocupação por MÊS das posições que têm teto (limite_dia/limite_mes): a capacidade
// se constrói na base diária (limite_dia × dias do mês), com limite_mes como teto opcional.
router.get('/portal/capacidade', (req, res) => {
  const emp = req.usuario.empresa_id;
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
  const [ano, m] = mes.split('-').map(Number);
  const diasMes = new Date(ano, m, 0).getDate();
  const ini = `${mes}-01`, fim = `${mes}-${String(diasMes).padStart(2, '0')}`;
  const ov = (ai, af, bi, bf) => (!!ai && !!af && !!bi && !!bf && ai <= bf && bi <= af); // YYYY-MM-DD comparam lexicograficamente
  const pos = db.prepare(`SELECT id, area, espaco, segmento, loja_nome, quantidade, limite_dia, limite_mes, COALESCE(disponivel,1) disponivel
    FROM tmkt_espaco_loja WHERE empresa_id=? AND ((limite_dia IS NOT NULL AND limite_dia>0) OR (limite_mes IS NOT NULL AND limite_mes>0))
    ORDER BY loja_nome, area, espaco`).all(emp);
  if (!pos.length) return res.json({ ok: true, mes, dias_mes: diasMes, itens: [] });
  // comprometido por vendas ativas que cruzam o mês
  const OCUPA = ['pedido', 'rascunho', 'negociacao', 'confirmado', 'briefing', 'aguardando', 'vigente', 'vendido', 'concluido'];
  const ph = OCUPA.map(() => '?').join(',');
  const comp = {};
  db.prepare(`SELECT ve.espaco_id eid, ve.quantidade q, v.vigencia_ini vi, v.vigencia_fim vf
      FROM tmkt_venda_espacos ve JOIN tmkt_vendas v ON v.id=ve.venda_id
      WHERE ve.empresa_id=? AND v.status IN (${ph})`).all(emp, ...OCUPA)
    .forEach(r => { if (ov(ini, fim, r.vi, r.vf)) comp[r.eid] = (comp[r.eid] || 0) + (Number(r.q) || 1); });
  // comprometido por plano publicado cujo período de veiculação cruza o mês (cota-weighted)
  try {
    db.prepare(`SELECT pe.espaco_id eid, pe.quantidade q, p.veic_ini vi, p.veic_fim vf,
        COALESCE((SELECT c.quantidade FROM tmkt_plano_cotas c WHERE c.id=pe.cota_id),
                 (SELECT SUM(c2.quantidade) FROM tmkt_plano_cotas c2 WHERE c2.plano_id=p.id), p.cota_qtd, 1) cotas
        FROM tmkt_plano_espacos pe JOIN tmkt_plano p ON p.id=pe.plano_id
        WHERE pe.empresa_id=? AND p.status IN ('publicado','vigente')`).all(emp)
      .forEach(r => { if (ov(ini, fim, r.vi, r.vf)) comp[r.eid] = (comp[r.eid] || 0) + (Number(r.q) || 1) * (Number(r.cotas) || 1); });
  } catch (e) { /* bases antigas */ }
  const itens = pos.map(p => {
    const capDia = (p.limite_dia != null && p.limite_dia > 0) ? p.limite_dia : null;
    const capMes = (p.limite_mes != null && p.limite_mes > 0) ? p.limite_mes : (capDia ? capDia * diasMes : (Number(p.quantidade) || 0));
    const usado = comp[p.id] || 0;
    return {
      id: p.id, area: p.area, espaco: p.espaco, segmento: p.segmento,
      local: (['encarte', 'ecommerce', 'crm', 'social', 'endomarketing'].includes(p.segmento)) ? (p.loja_nome || 'ESCRITÓRIO') : (p.loja_nome || '—'),
      disponivel: !!p.disponivel, cap_dia: capDia, cap_mes: capMes, usado,
      livres: Math.max(0, capMes - usado), pct: capMes ? Math.round(usado / capMes * 100) : 0,
    };
  }).sort((a, b) => b.pct - a.pct);
  res.json({ ok: true, mes, dias_mes: diasMes, itens });
});

// ── PLANOS COMERCIAIS (gestão) ────────────────────────────────────────────
// campos de texto/numéricos editáveis direto
const PLANO_CAMPOS = ['nome', 'tema', 'ano', 'chamada', 'contexto', 'mercado', 'periodo', 'pracas', 'frequencia', 'formato',
  'cota_tipo', 'cota_qtd', 'cota_prazo', 'investimento', 'investimento_obs', 'observacoes', 'destaque', 'status', 'ordem',
  'veic_ini', 'veic_fim', 'por_que', 'o_que_mostrar', 'publico', 'produtos_foco', 'sellout_potencial',
  'oportunidades', 'conteudo_redes', 'midias_on', 'midias_off', 'midias_online', 'capa_pos'];
const PLANO_JSON = ['provas_json', 'formatos_json', 'lojas_json', 'faq_json']; // aceitam array no body ou string json
function planoBody(b) {
  const sets = [], vals = [];
  PLANO_CAMPOS.forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(k === 'destaque' ? (b[k] ? 1 : 0) : (b[k] === '' ? null : b[k])); } });
  // aceita formatos/lojas/provas/faq como array OU string json
  [['formatos', 'formatos_json'], ['lojas', 'lojas_json'], ['provas', 'provas_json'], ['faq', 'faq_json']].forEach(([a, col]) => {
    if (b[a] !== undefined) { sets.push(`${col}=?`); vals.push(b[a] == null ? null : JSON.stringify(b[a]).slice(0, 8000)); }
    else if (b[col] !== undefined) { sets.push(`${col}=?`); vals.push(b[col] || null); }
  });
  return { sets, vals };
}
const parseJ = s => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

router.get('/portal/planos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const planos = db.prepare(`SELECT id, nome, tema, ano, periodo, chamada, investimento, destaque, status, ordem, capa_pos,
      (capa_foto IS NOT NULL AND capa_foto<>'') AS tem_capa FROM tmkt_plano WHERE empresa_id=? ORDER BY ordem, criado_em DESC`).all(emp);
  const nLink = db.prepare('SELECT plano_id, COUNT(*) n, COALESCE(SUM(quantidade),0) q FROM tmkt_plano_espacos WHERE empresa_id=? GROUP BY plano_id').all(emp);
  const map = {}; nLink.forEach(x => { map[x.plano_id] = x; });
  res.json({ ok: true, planos: planos.map(p => ({ ...p, tem_capa: !!p.tem_capa, posicoes: map[p.id] ? map[p.id].n : 0, vagas: map[p.id] ? map[p.id].q : 0 })) });
});
router.get('/portal/plano/:id', (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT * FROM tmkt_plano WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Plano não encontrado.' });
  const espacos = db.prepare(`SELECT pe.id, pe.espaco_id, pe.quantidade, pe.cota_id, el.espaco, el.loja_nome, el.segmento, el.preco_unit, el.modo_venda
      FROM tmkt_plano_espacos pe LEFT JOIN tmkt_espaco_loja el ON el.id=pe.espaco_id
      WHERE pe.empresa_id=? AND pe.plano_id=?`).all(emp, req.params.id);
  const cotas = db.prepare('SELECT id, nome, preco, quantidade, cor, ordem FROM tmkt_plano_cotas WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(emp, req.params.id);
  const fotos = db.prepare('SELECT id, legenda, secao, ordem FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=? ORDER BY ordem, criado_em').all(emp, req.params.id);
  res.json({ ok: true, plano: { ...p, tem_capa: !!(p.capa_foto && p.capa_foto !== ''), formatos: parseJ(p.formatos_json), provas: parseJ(p.provas_json), lojas: parseJ(p.lojas_json), faq: parseJ(p.faq_json) }, espacos, cotas, fotos });
});
// galeria de fotos do plano
router.get('/portal/plano/:id/foto/:fid', (req, res) => {
  const r = db.prepare('SELECT foto FROM tmkt_plano_fotos WHERE id=? AND plano_id=? AND empresa_id=?').get(req.params.fid, req.params.id, req.usuario.empresa_id);
  if (!r || !r.foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', 'image/jpeg'); res.send(Buffer.from(String(r.foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
router.post('/portal/plano/:id/foto', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a imagem.' });
  const secao = b.secao ? String(b.secao).slice(0, 40) : null;
  // banner de bloco é 1 por seção → substitui o anterior; galeria geral (sem seção) acumula
  if (secao) db.prepare('DELETE FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=? AND secao=?').run(emp, req.params.id, secao);
  const n = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_plano_fotos WHERE empresa_id=? AND plano_id=?').get(emp, req.params.id).m;
  const id = uuid();
  db.prepare('INSERT INTO tmkt_plano_fotos (id, empresa_id, plano_id, foto, legenda, secao, ordem, criado_em) VALUES (?,?,?,?,?,?,?, datetime(\'now\'))')
    .run(id, emp, req.params.id, String(b.foto).slice(0, 8_000_000), b.legenda || null, secao, n + 1);
  res.json({ ok: true, id });
});
router.delete('/portal/plano/:id/foto/:fid', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_plano_fotos WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.fid, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.post('/portal/plano', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome ao plano.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_plano (id, empresa_id, nome, status, ano, destaque, ordem, criado_em)
     VALUES (?,?,?,?,?,?,?, datetime('now'))`).run(id, emp, b.nome, b.status || 'rascunho', b.ano || new Date().getFullYear() + 1, b.destaque ? 1 : 0, Number(b.ordem) || 0);
  const { sets, vals } = planoBody(b);
  if (sets.length) db.prepare(`UPDATE tmkt_plano SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, id, emp);
  res.json({ ok: true, id });
});
router.put('/portal/plano/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare('SELECT id FROM tmkt_plano WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!p) return res.status(404).json({ erro: 'Plano não encontrado.' });
  const { sets, vals } = planoBody(req.body || {});
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_plano SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.post('/portal/plano/:id/capa', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a imagem da capa.' });
  const r = db.prepare('UPDATE tmkt_plano SET capa_foto=? WHERE id=? AND empresa_id=?').run(String(b.foto).slice(0, 8_000_000), req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Plano não encontrado.' });
  res.json({ ok: true });
});
router.delete('/portal/plano/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE plano_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_plano WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
// amarrar / desamarrar posições reais ao plano (trava o estoque quando o plano é comprado)
router.post('/portal/plano/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.espaco_id) return res.status(400).json({ erro: 'Escolha a posição.' });
  const ok = db.prepare('SELECT 1 FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp);
  if (!ok) return res.status(400).json({ erro: 'Posição inválida.' });
  db.prepare('INSERT INTO tmkt_plano_espacos (id, empresa_id, plano_id, espaco_id, quantidade, cota_id, criado_em) VALUES (?,?,?,?,?,?, datetime(\'now\'))')
    .run(uuid(), emp, req.params.id, b.espaco_id, Math.max(1, Number(b.quantidade) || 1), b.cota_id || null);
  res.json({ ok: true });
});
// cotas do plano (Ouro/Prata/Bronze) — cada uma com valor, quantidade e posições próprias
router.post('/portal/plano/:id/cotas', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome à cota (ex.: Ouro).' });
  const id = uuid();
  const n = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM tmkt_plano_cotas WHERE empresa_id=? AND plano_id=?').get(emp, req.params.id).m;
  db.prepare('INSERT INTO tmkt_plano_cotas (id, empresa_id, plano_id, nome, preco, quantidade, cor, ordem, criado_em) VALUES (?,?,?,?,?,?,?,?, datetime(\'now\'))')
    .run(id, emp, req.params.id, b.nome, Number(b.preco) || 0, Math.max(1, Number(b.quantidade) || 1), b.cor || null, n + 1);
  res.json({ ok: true, id });
});
router.put('/portal/plano/:id/cotas/:cotaId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  const sets = [], vals = [];
  ['nome', 'cor'].forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(b[k] || null); } });
  if (b.preco !== undefined) { sets.push('preco=?'); vals.push(Number(b.preco) || 0); }
  if (b.quantidade !== undefined) { sets.push('quantidade=?'); vals.push(Math.max(1, Number(b.quantidade) || 1)); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE tmkt_plano_cotas SET ${sets.join(', ')} WHERE id=? AND plano_id=? AND empresa_id=?`).run(...vals, req.params.cotaId, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/plano/:id/cotas/:cotaId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE cota_id=? AND plano_id=? AND empresa_id=?').run(req.params.cotaId, req.params.id, emp);
  db.prepare('DELETE FROM tmkt_plano_cotas WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.cotaId, req.params.id, emp);
  res.json({ ok: true });
});
router.put('/portal/plano/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('UPDATE tmkt_plano_espacos SET quantidade=? WHERE id=? AND plano_id=? AND empresa_id=?')
    .run(Math.max(1, Number((req.body || {}).quantidade) || 1), req.params.linkId, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/plano/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_plano_espacos WHERE id=? AND plano_id=? AND empresa_id=?').run(req.params.linkId, req.params.id, emp);
  res.json({ ok: true });
});

// ── CALENDÁRIO DE TRADE (gestão) ──────────────────────────────────────────
const CAL_CAMPOS = ['nome', 'tipo', 'categoria', 'recorrencia', 'dia_semana', 'dia_mes', 'data', 'data_ini', 'data_fim',
  'descricao', 'cor', 'patrocinavel', 'no_trade', 'preco', 'plano_id', 'patrocinador_nome', 'patrocinador_cnpj', 'venda_id', 'status', 'ordem', 'escopo_tipo'];
function calBody(b) {
  const sets = [], vals = [], bool = ['patrocinavel', 'no_trade'];
  CAL_CAMPOS.forEach(k => { if (b[k] !== undefined) { sets.push(`${k}=?`); vals.push(bool.includes(k) ? (b[k] ? 1 : 0) : (b[k] === '' ? null : b[k])); } });
  if (b.escopo_ref !== undefined) { sets.push('escopo_ref=?'); vals.push(b.escopo_ref == null ? null : JSON.stringify(b.escopo_ref).slice(0, 8000)); }
  return { sets, vals };
}
router.get('/portal/calendario', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT id, nome, tipo, categoria, recorrencia, dia_semana, dia_mes, data, data_ini, data_fim,
      descricao, cor, COALESCE(patrocinavel,1) patrocinavel, COALESCE(no_trade,0) no_trade, preco, plano_id, patrocinador_nome, venda_id,
      escopo_tipo, escopo_ref, (comprov_foto IS NOT NULL) AS tem_comprov, (slogan_foto IS NOT NULL) AS tem_slogan, comprov_em, status, ordem
    FROM tmkt_calendario WHERE empresa_id=? ORDER BY COALESCE(data, data_ini), ordem, nome`).all(emp);
  res.json({ ok: true, eventos: rows.map(e => ({ ...e, patrocinavel: !!e.patrocinavel, no_trade: !!e.no_trade, tem_comprov: !!e.tem_comprov, tem_slogan: !!e.tem_slogan, escopo_ref: (() => { try { return JSON.parse(e.escopo_ref || '[]'); } catch { return []; } })() })) });
});
router.post('/portal/calendario', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.nome) return res.status(400).json({ erro: 'Dê um nome ao evento.' });
  const id = uuid();
  db.prepare(`INSERT INTO tmkt_calendario (id, empresa_id, nome, tipo, recorrencia, status, criado_em)
     VALUES (?,?,?,?,?,?, datetime('now'))`).run(id, emp, b.nome, b.tipo || 'acao', b.recorrencia || 'unico', b.status || 'ativo');
  const { sets, vals } = calBody(b);
  if (sets.length) db.prepare(`UPDATE tmkt_calendario SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, id, emp);
  res.json({ ok: true, id });
});
router.put('/portal/calendario/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  const ok = db.prepare('SELECT id FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!ok) return res.status(404).json({ erro: 'Evento não encontrado.' });
  const { sets, vals } = calBody(req.body || {});
  if (sets.length) db.prepare(`UPDATE tmkt_calendario SET ${sets.join(', ')} WHERE id=? AND empresa_id=?`).run(...vals, req.params.id, emp);
  res.json({ ok: true });
});
router.delete('/portal/calendario/:id', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id;
  db.prepare('DELETE FROM tmkt_calendario_fotos WHERE evento_id=? AND empresa_id=?').run(req.params.id, emp);
  db.prepare('DELETE FROM tmkt_calendario WHERE id=? AND empresa_id=?').run(req.params.id, emp);
  res.json({ ok: true });
});
// comprovação da ação (foto principal)
router.post('/portal/calendario/:id/comprovacao', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.foto) return res.status(400).json({ erro: 'Anexe a foto da ação.' });
  const r = db.prepare(`UPDATE tmkt_calendario SET comprov_foto=?, comprov_mime=?, comprov_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.id, emp);
  if (!r.changes) return res.status(404).json({ erro: 'Evento não encontrado.' });
  res.json({ ok: true });
});
router.get('/portal/calendario/:id/comprovacao', (req, res) => {
  const r = db.prepare('SELECT comprov_foto, comprov_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r || !r.comprov_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.comprov_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.comprov_mime || 'image/jpeg'); res.send(Buffer.from(String(r.comprov_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// foto do slogan/arte da ação
router.post('/portal/calendario/:id/slogan', exigePerfil(...GESTAO), (req, res) => {
  const b = req.body || {}; if (!b.foto) return res.status(400).json({ erro: 'Anexe a arte.' });
  const r = db.prepare('UPDATE tmkt_calendario SET slogan_foto=?, slogan_mime=? WHERE id=? AND empresa_id=?')
    .run(String(b.foto).slice(0, 8_000_000), b.mime || null, req.params.id, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Evento não encontrado.' });
  res.json({ ok: true });
});
router.get('/portal/calendario/:id/slogan', (req, res) => {
  const r = db.prepare('SELECT slogan_foto, slogan_mime FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!r || !r.slogan_foto) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.slogan_foto || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.slogan_mime || 'image/jpeg'); res.send(Buffer.from(String(r.slogan_foto).replace(/^data:[^,]+,/, ''), 'base64'));
});
// posições vinculadas ao evento (o que é comercializável nessa ação)
router.get('/portal/calendario/:id/espacos', (req, res) => {
  const emp = req.usuario.empresa_id;
  const rows = db.prepare(`SELECT ce.id, ce.espaco_id, ce.quantidade, el.espaco, el.loja_nome, el.segmento, el.area, el.preco_unit, el.modo_venda
      FROM tmkt_calendario_espacos ce LEFT JOIN tmkt_espaco_loja el ON el.id=ce.espaco_id
      WHERE ce.empresa_id=? AND ce.evento_id=?`).all(emp, req.params.id);
  res.json({ ok: true, espacos: rows });
});
router.post('/portal/calendario/:id/espacos', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.espaco_id) return res.status(400).json({ erro: 'Escolha a posição.' });
  if (!db.prepare('SELECT 1 FROM tmkt_espaco_loja WHERE id=? AND empresa_id=?').get(b.espaco_id, emp)) return res.status(400).json({ erro: 'Posição inválida.' });
  db.prepare('INSERT INTO tmkt_calendario_espacos (id, empresa_id, evento_id, espaco_id, quantidade, criado_em) VALUES (?,?,?,?,?, datetime(\'now\'))')
    .run(uuid(), emp, req.params.id, b.espaco_id, Math.max(1, Number(b.quantidade) || 1));
  res.json({ ok: true });
});
router.put('/portal/calendario/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE tmkt_calendario_espacos SET quantidade=? WHERE id=? AND evento_id=? AND empresa_id=?')
    .run(Math.max(1, Number((req.body || {}).quantidade) || 1), req.params.linkId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});
router.delete('/portal/calendario/:id/espacos/:linkId', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('DELETE FROM tmkt_calendario_espacos WHERE id=? AND evento_id=? AND empresa_id=?').run(req.params.linkId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── BRIEFING da negociação (chat + anexos + comprovação) ──────────────────
function briefingLista(emp, vendaId) {
  return db.prepare(`SELECT b.id, b.autor, b.autor_nome, COALESCE(b.tipo,'msg') tipo, b.texto, (b.anexo_b64 IS NOT NULL) AS tem_anexo, b.anexo_mime, b.anexo_nome, b.espaco_id, b.criado_em,
      ve.espaco_desc, ve.loja_nome AS espaco_loja
    FROM tmkt_venda_briefing b LEFT JOIN tmkt_venda_espacos ve ON ve.id=b.espaco_id
    WHERE b.empresa_id=? AND b.venda_id=? ORDER BY b.criado_em`).all(emp, vendaId)
    .map(m => ({ ...m, tem_anexo: !!m.tem_anexo }));
}
router.get('/portal/venda/:id/briefing', (req, res) => {
  res.json({ ok: true, mensagens: briefingLista(req.usuario.empresa_id, req.params.id) });
});
router.post('/portal/venda/:id/briefing', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body || {};
  if (!b.texto && !b.anexo) return res.status(400).json({ erro: 'Escreva algo ou anexe um arquivo.' });
  if (!db.prepare('SELECT 1 FROM tmkt_vendas WHERE id=? AND empresa_id=?').get(req.params.id, emp)) return res.status(404).json({ erro: 'Negociação não encontrada.' });
  db.prepare(`INSERT INTO tmkt_venda_briefing (id, empresa_id, venda_id, autor, autor_nome, tipo, texto, anexo_b64, anexo_mime, anexo_nome, espaco_id, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`)
    .run(uuid(), emp, req.params.id, 'gestao', req.usuario.nome || null, b.tipo === 'comprovacao' ? 'comprovacao' : 'msg',
      b.texto ? String(b.texto).slice(0, 4000) : null, b.anexo ? String(b.anexo).slice(0, 8_000_000) : null, b.mime || null, b.nome || null, b.espaco_id || null);
  res.json({ ok: true });
});
router.get('/portal/briefing/:bid/anexo', (req, res) => {
  const r = db.prepare('SELECT anexo_b64, anexo_mime FROM tmkt_venda_briefing WHERE id=? AND empresa_id=?').get(req.params.bid, req.usuario.empresa_id);
  if (!r || !r.anexo_b64) return res.status(404).end();
  const m = /^data:([^;]+);base64,(.+)$/.exec(r.anexo_b64 || '');
  if (m) { res.set('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
  res.set('Content-Type', r.anexo_mime || 'application/octet-stream'); res.send(Buffer.from(String(r.anexo_b64).replace(/^data:[^,]+,/, ''), 'base64'));
});

// sell-out (vendas ao consumidor) por escopo, no período da ação
async function vendasPorEscopo(tipo, refs, ini, fim) {
  if (!habilitado() || !Array.isArray(refs) || !refs.length) return { qtd: 0, valor: 0 };
  const base = `FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem e ON e.id=iv.embalagemid`;
  const per = `v.status='F' AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)`;
  let sql, params;
  try {
    if (tipo === 'produto') { const eans = refs.map(r => r.ean).filter(Boolean); if (!eans.length) return { qtd: 0, valor: 0 }; sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} WHERE e.codigobarras = ANY($1::text[]) AND ${per}`; params = [eans, ini, fim]; }
    else if (tipo === 'laboratorio') { sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} JOIN produto pr ON pr.id=e.produtoid WHERE pr.fabricanteid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else if (tipo === 'classificacao') { sql = `SELECT COALESCE(SUM(iv.quantidade),0) q, COALESCE(SUM(iv.valortotal),0) v ${base} JOIN classificacaoproduto cp ON cp.produtoid=e.produtoid WHERE cp.classificacaoid = ANY($1::bigint[]) AND ${per}`; params = [refs.map(r => Number(r.id)).filter(Boolean), ini, fim]; }
    else return { qtd: 0, valor: 0 };
    const r = await erpQuery(sql, params); return { qtd: Number(r[0].q) || 0, valor: Number(r[0].v) || 0 };
  } catch { return { qtd: 0, valor: 0 }; }
}
router.get('/portal/calendario/:id/sellout', async (req, res) => {
  const emp = req.usuario.empresa_id;
  const ev = db.prepare('SELECT escopo_tipo, escopo_ref, data, data_ini, data_fim FROM tmkt_calendario WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!ev) return res.status(404).json({ erro: 'Evento não encontrado.' });
  if (!ev.escopo_tipo) return res.json({ ok: true, semEscopo: true });
  if (!['produto', 'laboratorio', 'classificacao'].includes(ev.escopo_tipo)) return res.json({ ok: true, naoSuportado: ev.escopo_tipo });
  let refs = []; try { refs = JSON.parse(ev.escopo_ref || '[]'); } catch { }
  const hoje = new Date().toISOString().slice(0, 10);
  let ini, fim;
  if (ev.data) { ini = ev.data; fim = ev.data; }
  else if (ev.data_ini) { ini = ev.data_ini; fim = ev.data_fim || hoje; }
  else { const n = new Date(); ini = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); fim = new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10); }
  if (fim > hoje) fim = hoje;
  const dias = Math.max(1, Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1);
  const antFim = new Date(new Date(ini).getTime() - 864e5).toISOString().slice(0, 10);
  const antIni = new Date(new Date(antFim).getTime() - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const atual = await vendasPorEscopo(ev.escopo_tipo, refs, ini, fim);
  const antes = await vendasPorEscopo(ev.escopo_tipo, refs, antIni, antFim);
  const variacao = antes.valor ? Math.round((atual.valor - antes.valor) / antes.valor * 100) : null;
  res.json({ ok: true, periodo: { ini, fim }, anterior: { ini: antIni, fim: antFim }, atual, antes, variacao, escopo_tipo: ev.escopo_tipo });
});

// Sincroniza o funil de prospecção com o volume de compra ACUMULADO (lifetime) do Alpha 7.
// SEED: todo fornecedor com compra acumulada ≥ R$100 mil que ainda NÃO tem nenhum card entra na
// coluna Prospecção (1 card). Depois, a CADA novo marco de R$100 mil acumulado, volta pra prospecção
// (empilha outro card mesmo se já houver um aberto — escolha do Joe 2026-11-11). A virada p/ lifetime
// fixa um baseline (migr 347) p/ não despejar os marcos históricos de uma vez. ERP só leitura.
const PROSP_PASSO = 100000;
async function sincronizarProspeccoes() {
  if (!habilitado()) return { ok: false, motivo: 'ERP indisponível' };
  let rows = [];
  try {
    // Compra LIFETIME (acumulado de toda a vida do fornecedor) — sem janela de 365 dias.
    rows = await erpQuery(`SELECT f.id fornecedor_id, pe.nome fornecedor, COALESCE(SUM(inf.quantidade*inf.valorunitario),0) compra
        FROM notafiscal nf JOIN fornecedor f ON f.id=nf.fornecedorid JOIN pessoa pe ON pe.id=f.pessoaid
        JOIN itemnotafiscal inf ON inf.notafiscalid=nf.id
        WHERE nf.unidadenegocioid IN ${UNIS_GRUPO} AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E') AND nf.fornecedorid IS NOT NULL
        GROUP BY f.id, pe.nome HAVING COALESCE(SUM(inf.quantidade*inf.valorunitario),0) >= ${PROSP_PASSO}
        ORDER BY compra DESC LIMIT 300`, []);
  } catch (e) { return { ok: false, motivo: 'ERP indisponível' }; }
  const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
  let criadas = 0;
  empresas.forEach(eid => {
    rows.forEach(r => {
      try {
        const fid = String(r.fornecedor_id), compra = Number(r.compra) || 0;
        const marcos = Math.floor(compra / PROSP_PASSO); // nº de 100k acumulados na vida
        if (marcos < 1) return;
        const temCard = db.prepare('SELECT COUNT(*) n FROM tmkt_prospeccao WHERE empresa_id=? AND fornecedor_id=?').get(eid, fid).n;
        const marcoRow = db.prepare('SELECT marcos_processados, lifetime_base FROM tmkt_prospeccao_marco WHERE empresa_id=? AND fornecedor_id=?').get(eid, fid);
        const criar = (nivel) => {
          db.prepare(`INSERT INTO tmkt_prospeccao (id,empresa_id,fornecedor_id,fornecedor_nome,etapa,origem,gatilho_valor,obs)
            VALUES (?,?,?,?, 'novo','automatica',?,?)`)
            .run(uuid(), eid, fid, r.fornecedor || null, nivel * PROSP_PASSO,
              `Fornecedor com R$ ${(nivel * PROSP_PASSO).toLocaleString('pt-BR')}+ comprados (acumulado) — cruzou mais um marco de R$100 mil, vale procurar para trade.`);
          criadas++;
        };
        if (!marcoRow || !marcoRow.lifetime_base) {
          // VIRADA p/ lifetime: fixa o baseline SEM despejar os marcos históricos. Seed só se nunca teve card.
          if (!temCard) criar(marcos);
        } else if (marcos > marcoRow.marcos_processados) {
          // Cada novo 100k acumulado volta pra prospecção (empilha mesmo com card aberto). Cap de segurança: 5/sync.
          const novos = Math.min(marcos - marcoRow.marcos_processados, 5);
          for (let k = 1; k <= novos; k++) criar(marcoRow.marcos_processados + k);
        }
        db.prepare(`INSERT INTO tmkt_prospeccao_marco (empresa_id,fornecedor_id,marcos_processados,lifetime_base,atualizado_em) VALUES (?,?,?,1,datetime('now'))
          ON CONFLICT(empresa_id,fornecedor_id) DO UPDATE SET marcos_processados=excluded.marcos_processados, lifetime_base=1, atualizado_em=datetime('now')`).run(eid, fid, marcos);
      } catch { /* por fornecedor */ }
    });
  });
  return { ok: true, criadas };
}
router.sincronizarProspeccoes = sincronizarProspeccoes;
router.post('/prospeccoes/sincronizar', exigePerfil(...GESTAO), async (req, res) => {
  const r = await sincronizarProspeccoes();
  res.json(r);
});

module.exports = router;
