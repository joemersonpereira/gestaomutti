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
  escola: { t: 'estagio_escola', campos: ['nome', 'cidade', 'contato', 'telefone', 'cnpj', 'endereco', 'representante', 'ativo'] },
  empresa: { t: 'estagio_empresa', campos: ['nome', 'cnpj', 'tipo', 'endereco', 'ativo'] },
  seguro: { t: 'estagio_seguro', campos: ['seguradora', 'apolice', 'vigencia_ini', 'vigencia_fim', 'valor', 'cobertura', 'ativo'] },
  ficha: { t: 'estagio_ficha', campos: ['nome', 'cpf', 'rg', 'nascimento', 'endereco', 'telefone', 'email', 'escola_id', 'curso', 'serie', 'empresa_registro_id', 'empresa_atuacao_id', 'assinante_empresa_id', 'supervisor_id', 'loja', 'horario', 'horas_dia', 'horas_semana', 'valor_bolsa', 'vale_transporte', 'beneficios', 'seguro_id', 'resp_nome', 'resp_cpf', 'resp_telefone', 'resp_parentesco', 'data_inicio', 'data_fim', 'status', 'origem', 'banco', 'agencia', 'conta', 'tipo_conta', 'pix'] },
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

// ── Controle de assinatura do contrato (onde o documento está) ──
const DOC_STATUS = ['pendente', 'enviado_loja', 'com_estagiario', 'assinado'];
router.put('/ficha/:id/doc-status', exigePerfil(...PERFIS), (req, res) => {
  const st = DOC_STATUS.includes(req.body?.status) ? req.body.status : 'pendente';
  db.prepare(`UPDATE estagio_ficha SET doc_status=?, doc_status_em=datetime('now'), doc_obs=? WHERE id=? AND empresa_id=?`)
    .run(st, req.body?.obs || null, req.params.id, emp(req));
  res.json({ ok: true, status: st });
});

// ── Endereço do estagiário vindo do ERP (quando o cadastro local não tem) ──
// A ficha → colaborador_id → colaboradores.erp_pessoa_id (ou casa por CPF em pessoa) → endereço do ERP.
router.get('/ficha/:id/endereco-erp', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const { erpQuery, habilitado } = require('../db/erp');
    if (!habilitado || !habilitado()) return res.json({ endereco: '', cep: '' });
    const f = db.prepare('SELECT colaborador_id, cpf FROM estagio_ficha WHERE id=? AND empresa_id=?').get(req.params.id, emp(req));
    if (!f) return res.status(404).json({ erro: 'Ficha não encontrada.' });
    let pessoaId = null;
    if (f.colaborador_id) {
      const c = db.prepare('SELECT erp_pessoa_id, cpf FROM colaboradores WHERE id=?').get(f.colaborador_id);
      if (c && c.erp_pessoa_id) pessoaId = c.erp_pessoa_id;
    }
    const cpf = String((f.cpf || '')).replace(/\D/g, '');
    let rows = [];
    const SQL = `SELECT lg.nome logradouro, e.numero, e.complemento, lg.cep, b.nome bairro, cid.nome cidade, est.sigla uf
      FROM endereco e
      JOIN logradouro lg ON lg.id = e.logradouroid
      LEFT JOIN bairro b ON b.id = lg.bairroid
      LEFT JOIN cidade cid ON cid.id = b.cidadeid
      LEFT JOIN estado est ON est.id = cid.estadoid`;
    if (pessoaId) rows = await erpQuery(SQL + ' WHERE e.pessoaid = $1 ORDER BY e.principal DESC NULLS LAST LIMIT 1', [pessoaId]);
    else if (cpf) rows = await erpQuery(SQL + ` JOIN pessoa pf ON pf.id = e.pessoaid WHERE regexp_replace(pf.cpf,'[^0-9]','','g') = $1 ORDER BY e.principal DESC NULLS LAST LIMIT 1`, [cpf]);
    const r = rows[0];
    if (!r) return res.json({ endereco: '', cep: '' });
    const cep = r.cep ? String(r.cep).replace(/(\d{5})(\d{3})/, '$1-$2') : '';
    const endereco = [
      [r.logradouro, r.numero].filter(Boolean).join(', '),
      r.complemento, r.bairro,
      [r.cidade, r.uf].filter(Boolean).join('/'),
      cep && ('CEP ' + cep),
    ].filter(Boolean).join(', ');
    res.json({ endereco, cep });
  } catch (e) { res.json({ endereco: '', cep: '', erro: e.message }); }
});

// pagamentos de UMA ficha (todas as competências) — pro recibo de pagamento sair com os valores reais do mês
router.get('/ficha/:id/pagamentos', exigePerfil(...PERFIS), (req, res) => {
  res.json(db.prepare(`SELECT * FROM estagio_pagamento WHERE empresa_id=? AND ficha_id=? ORDER BY competencia DESC`).all(emp(req), req.params.id));
});

// ── Export p/ SEGURADORA: "Relação de Titulares" das VIDAS ATIVAS (mensal) ──
// Lista os estagiários ativos, puxa sexo/nascimento do ERP (por CPF) e tira quem está INATIVO no ERP.
// Formato pedido pela seguradora: Nome, CPF (11 díg), Sexo, Nascimento, Plano 01, Opção 1, Capital.
router.get('/seguro/vidas-ativas.xlsx', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const e = emp(req);
    const dig = s => String(s || '').replace(/\D/g, '');
    const fmtBR = iso => { const s = String(iso || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; };
    const fichas = db.prepare(`SELECT nome, cpf, nascimento, sexo FROM estagio_ficha WHERE empresa_id=? AND status='ativo' ORDER BY nome`).all(e)
      .filter(f => dig(f.cpf)); // precisa de CPF (o seguro exige)
    // ERP: sexo, nascimento e status (ativo) por CPF
    const erpByCpf = {};
    try {
      const { erpQuery, habilitado } = require('../db/erp');
      if (habilitado && habilitado()) {
        const cpfs = [...new Set(fichas.map(f => dig(f.cpf)))];
        const rows = await erpQuery(`SELECT regexp_replace(pf.cpf,'[^0-9]','','g') cpf,
            to_char(pf.datanascimento,'DD/MM/YYYY') nasc, pf.sexo,
            max(CASE WHEN u.status='A' THEN 1 ELSE 0 END) ativo
          FROM pessoa pf LEFT JOIN usuario u ON u.pessoaid=pf.id
          WHERE regexp_replace(pf.cpf,'[^0-9]','','g') = ANY($1) GROUP BY 1,2,3`, [cpfs]);
        rows.forEach(r => { if (r.cpf) erpByCpf[r.cpf] = r; });
      }
    } catch (err) { /* sem ERP: exporta só com o que tem */ }
    // tira quem o ERP diz INATIVO (mantém quem é ativo ou não tem registro no ERP)
    const vidas = fichas.filter(f => { const x = erpByCpf[dig(f.cpf)]; return !x || x.ativo === 1 || x.ativo === '1'; });
    const XLSX = require('xlsx');
    const H = [
      ['Relação de Titulares de Seguro de Acidentes Pessoais Coletivos'],
      [],
      ['Observação: CPF completo com 11 dígitos (Sem pontos e traços)'],
      ['Nome Estagiário', 'CPF', 'Sexo', 'Data de Nascimento', 'Plano', 'Opção', 'Capital Segurado'],
    ];
    const linhas = vidas.map(f => {
      const x = erpByCpf[dig(f.cpf)] || {};
      // ERP primeiro; se não tiver, usa o que o RH preencheu na ficha (pela planilha da seguradora)
      let sexo = (x.sexo === 'M' || x.sexo === 'F') ? x.sexo : (f.sexo === 'M' || f.sexo === 'F' ? f.sexo : '');
      const nasc = x.nasc || fmtBR(f.nascimento);
      return [f.nome, dig(f.cpf).padStart(11, '0'), sexo, nasc, '01', 1, 10000];
    });
    const ws = XLSX.utils.aoa_to_sheet([...H, ...linhas]);
    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 6 }, { wch: 16 }, { wch: 7 }, { wch: 7 }, { wch: 16 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const hoje = new Date().toISOString().slice(0, 7);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="seguro-vidas-ativas-${hoje}.xlsx"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});
// Atualiza as fichas com os dados da "Relação de Titulares" preenchida (casa por CPF): nascimento + sexo.
// É o "sobe a planilha e o sistema se atualiza" — cobre os que o ERP não tem. Reporta quem não está no sistema.
router.post('/seguro/importar-titulares', exigePerfil(...PERFIS), (req, res) => {
  try {
    const e = emp(req); const { conteudo } = req.body || {};
    if (!conteudo) return res.status(400).json({ erro: 'Anexe a planilha preenchida.' });
    const XLSX = require('xlsx');
    const wb = XLSX.read(Buffer.from(conteudo, 'base64'), { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    const h = rows.findIndex(r => String(r[0]).trim().toLowerCase().startsWith('nome'));
    const iso = v => { if (v instanceof Date) { const z = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); } const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.split('/').reverse().join('-') : ''); };
    const dig = s => String(s || '').replace(/\D/g, '');
    const itens = rows.slice(h + 1).filter(r => String(r[0] || '').trim()).map(r => ({ nome: String(r[0]).trim(), cpf: dig(r[1]), sexo: String(r[2] || '').trim().toUpperCase(), nasc: iso(r[3]) }));
    const fichas = db.prepare(`SELECT id, cpf, colaborador_id FROM estagio_ficha WHERE empresa_id=?`).all(e);
    const byCpf = {}; fichas.forEach(f => { const c = dig(f.cpf); if (c) byCpf[c] = f; });
    const updF = db.prepare(`UPDATE estagio_ficha SET nascimento=COALESCE(NULLIF(?,''), nascimento), sexo=COALESCE(NULLIF(?,''), sexo) WHERE id=?`);
    const updC = db.prepare(`UPDATE colaboradores SET nascimento=COALESCE(NULLIF(?,''), nascimento) WHERE id=?`);
    let atualizados = 0; const naoEncontrados = [];
    const tx = db.transaction(() => {
      for (const it of itens) {
        const f = it.cpf && byCpf[it.cpf];
        if (!f) { naoEncontrados.push(it.nome); continue; }
        const sexo = (it.sexo === 'M' || it.sexo === 'F') ? it.sexo : '';
        updF.run(it.nasc || '', sexo, f.id);
        if (f.colaborador_id && it.nasc) updC.run(it.nasc, f.colaborador_id);
        atualizados++;
      }
    });
    tx();
    res.json({ ok: true, atualizados, naoEncontrados });
  } catch (e) { res.status(400).json({ erro: 'Não consegui ler a planilha: ' + e.message }); }
});
// prévia (contagem) das vidas ativas, pro botão mostrar quantas vão
router.get('/seguro/vidas-ativas', exigePerfil(...PERFIS), async (req, res) => {
  try {
    const e = emp(req); const dig = s => String(s || '').replace(/\D/g, '');
    const fichas = db.prepare(`SELECT nome, cpf FROM estagio_ficha WHERE empresa_id=? AND status='ativo'`).all(e).filter(f => dig(f.cpf));
    let inativosErp = 0, semCpf = db.prepare(`SELECT COUNT(*) n FROM estagio_ficha WHERE empresa_id=? AND status='ativo' AND (cpf IS NULL OR cpf='')`).get(e).n;
    try {
      const { erpQuery, habilitado } = require('../db/erp');
      if (habilitado && habilitado()) {
        const cpfs = [...new Set(fichas.map(f => dig(f.cpf)))];
        const rows = await erpQuery(`SELECT regexp_replace(pf.cpf,'[^0-9]','','g') cpf, max(CASE WHEN u.status='A' THEN 1 ELSE 0 END) ativo FROM pessoa pf LEFT JOIN usuario u ON u.pessoaid=pf.id WHERE regexp_replace(pf.cpf,'[^0-9]','','g') = ANY($1) GROUP BY 1`, [cpfs]);
        const st = {}; rows.forEach(r => st[r.cpf] = r.ativo === 1 || r.ativo === '1');
        inativosErp = fichas.filter(f => (dig(f.cpf) in st) && !st[dig(f.cpf)]).length;
      }
    } catch (err) { /* ignora */ }
    res.json({ ok: true, vidas: fichas.length - inativosErp, ativosFicha: fichas.length, inativosErp, semCpf });
  } catch (e) { res.status(500).json({ erro: e.message }); }
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
  const pi = req.body?.periodo_inicio || null, pf = req.body?.periodo_fim || null; // novo período do estágio
  const { v4: uuid } = require('uuid');
  const existe = db.prepare(`SELECT id FROM estagio_renovacao WHERE empresa_id=? AND ficha_id=?`).get(e, fid);
  if (existe) db.prepare(`UPDATE estagio_renovacao SET indice=?, status=?, periodo_inicio=?, periodo_fim=? WHERE id=?`).run(indice, status, pi, pf, existe.id);
  else db.prepare(`INSERT INTO estagio_renovacao (id,empresa_id,ficha_id,indice,status,periodo_inicio,periodo_fim) VALUES (?,?,?,?,?,?,?)`).run(uuid(), e, fid, indice, status, pi, pf);
  res.json({ ok: true, indice, status });
});
// edita o novo período da renovação (enquanto não foi decidida)
router.put('/renovacao/:id/periodo', exigePerfil(...PERFIS), (req, res) => {
  db.prepare(`UPDATE estagio_renovacao SET periodo_inicio=?, periodo_fim=? WHERE id=? AND empresa_id=?`)
    .run(req.body?.periodo_inicio || null, req.body?.periodo_fim || null, req.params.id, emp(req));
  res.json({ ok: true });
});
router.post('/renovacao/:id/rh', exigePerfil(...PERFIS), (req, res) => {
  db.prepare(`UPDATE estagio_renovacao SET rh_parecer=?, status='pendente_gerente' WHERE id=? AND empresa_id=?`).run(req.body?.parecer || '', req.params.id, emp(req));
  res.json({ ok: true });
});
router.post('/renovacao/:id/decidir', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req);
  const st = req.body?.status; if (!['aprovada', 'recusada'].includes(st)) return res.status(400).json({ erro: 'Status inválido.' });
  const r = db.prepare(`SELECT * FROM estagio_renovacao WHERE id=? AND empresa_id=?`).get(req.params.id, e);
  if (!r) return res.status(404).json({ erro: 'Renovação não encontrada.' });
  // pra aprovar, o novo período precisa estar definido (é o que vai pro Termo Aditivo)
  if (st === 'aprovada' && !r.periodo_fim) return res.status(400).json({ erro: 'Defina o novo período (início e fim) antes de aprovar — é o que sai no Termo Aditivo.' });
  db.prepare(`UPDATE estagio_renovacao SET status=?, decidido_por=?, decidido_em=datetime('now') WHERE id=? AND empresa_id=?`).run(st, req.usuario.nome || null, req.params.id, e);
  // renovação aprovada: a vigência da ficha passa a ser o novo período, pra o Termo Aditivo
  // gerado na ficha do colaborador sair com as datas renovadas.
  if (st === 'aprovada' && r.periodo_inicio && r.periodo_fim) {
    db.prepare(`UPDATE estagio_ficha SET data_inicio=?, data_fim=?, atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
      .run(r.periodo_inicio, r.periodo_fim, r.ficha_id, e);
  }
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
// ── Diferença de caixa → desconto automático (sobe a planilha, casa por nome, aplica no pagamento) ──
const _norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function _parseDiferencaCaixa(buf, aba) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const abas = wb.SheetNames;
  const sheet = (aba && wb.Sheets[aba]) ? aba : abas[abas.length - 1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: '' });
  const itens = [];
  for (const r of rows) {
    const nome = String(r[0] || '').trim();
    if (/caixa destaque/i.test(r.join(' '))) break; // começou a parte do ranking — para
    if (!nome || nome === '-' || /diferen[çc]a de caixa|^nomes$/i.test(nome)) continue;
    const v = Number(r[3]); // coluna D = valor (negativo = falta)
    if (!isFinite(v) || v === 0) continue;
    itens.push({ nome, valor: Math.round(Math.abs(v) * 100) / 100 });
  }
  return { abas, aba: sheet, itens };
}
// casa cada nome da planilha com uma ficha de estágio (por 1º nome), opcionalmente dentro de uma loja.
function _casarDifCaixa(empresaId, itens, loja) {
  const fichas = db.prepare(`SELECT id, nome, loja, empresa_atuacao_id, empresa_registro_id, status FROM estagio_ficha WHERE empresa_id=?`).all(empresaId);
  const noEscopo = f => !loja || f.loja === loja || f.empresa_atuacao_id === loja || f.empresa_registro_id === loja;
  return itens.map(it => {
    const alvo = _norm(it.nome);
    let cands = fichas.filter(f => noEscopo(f) && (_norm(f.nome).split(' ')[0] === alvo || _norm(f.nome).startsWith(alvo + ' ') || _norm(f.nome) === alvo));
    if (!cands.length && loja) cands = fichas.filter(f => _norm(f.nome).split(' ')[0] === alvo || _norm(f.nome).startsWith(alvo + ' ')); // tenta fora da loja
    const ativos = cands.filter(f => f.status === 'ativo');
    const esc = ativos.length ? ativos : cands;
    return { nome: it.nome, valor: it.valor, ficha_id: esc.length === 1 ? esc[0].id : null, ficha_nome: esc.length === 1 ? esc[0].nome : null, ambiguo: esc.length > 1, candidatos: esc.map(f => ({ id: f.id, nome: f.nome })) };
  });
}
// prévia: sobe a planilha e mostra o que casou (sem aplicar)
router.post('/pagamento/diferenca-caixa/preview', exigePerfil(...PERFIS), (req, res) => {
  try {
    const { conteudo, aba, loja } = req.body || {};
    if (!conteudo) return res.status(400).json({ erro: 'Anexe a planilha de diferença de caixa.' });
    const buf = Buffer.from(conteudo, 'base64');
    const { abas, aba: usada, itens } = _parseDiferencaCaixa(buf, aba);
    const casados = _casarDifCaixa(emp(req), itens, loja || null);
    res.json({ ok: true, abas, aba: usada, itens: casados });
  } catch (e) { res.status(400).json({ erro: 'Não consegui ler a planilha: ' + e.message }); }
});
// aplica os descontos escolhidos no pagamento da competência (desconto = diferença de caixa)
router.post('/pagamento/diferenca-caixa/aplicar', exigePerfil(...PERFIS), (req, res) => {
  const e = emp(req); const { competencia, aba, descontos } = req.body || {};
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) return res.status(400).json({ erro: 'Informe a competência (AAAA-MM).' });
  if (!Array.isArray(descontos) || !descontos.length) return res.status(400).json({ erro: 'Nada a aplicar.' });
  const obs = 'Diferença de caixa' + (aba ? ' (' + aba + ')' : '');
  let aplicados = 0; const semFolha = [], travados = [];
  const tx = db.transaction(() => {
    for (const d of descontos) {
      if (!d.ficha_id) continue;
      const p = db.prepare(`SELECT * FROM estagio_pagamento WHERE empresa_id=? AND ficha_id=? AND competencia=?`).get(e, d.ficha_id, competencia);
      if (!p) { semFolha.push(d.ficha_id); continue; }
      if (p.tes_ok) { travados.push(d.ficha_id); continue; } // desconto só até a Tesouraria validar
      const desconto = Math.round((Number(d.valor) || 0) * 100) / 100;
      const liquido = Math.round(((p.bolsa || 0) + (p.vt || 0) - desconto) * 100) / 100;
      db.prepare(`UPDATE estagio_pagamento SET desconto=?, desconto_obs=?, liquido=? WHERE id=? AND empresa_id=?`).run(desconto, obs, liquido, p.id, e);
      aplicados++;
    }
  });
  tx();
  res.json({ ok: true, aplicados, semFolha: semFolha.length, travados: travados.length });
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
