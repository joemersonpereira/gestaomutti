const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { estaAfastado } = require('../lib/afastamento');

router.use(auth);

// Garante a tabela de atuação do dia mesmo em bancos já existentes.
db.exec(`CREATE TABLE IF NOT EXISTS atuacao_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, funcao_atuada TEXT NOT NULL,
  UNIQUE(empresa_id, loja_id, data, colaborador_id, funcao_atuada)
);`);

// Funções delegadas: quem avalia cada uma (chefe do setor daquela função)
const DELEGADAS = [
  { funcaoAvaliada: 'func-caixa', chefeFuncao: 'func-tesouraria', label: 'Caixas' },
  { funcaoAvaliada: 'func-conferente', chefeFuncao: 'func-suporte', label: 'Conferentes' },
];

// Dispara as avaliações administrativas com base em QUEM o gerente informou que atuou
// como caixa/conferente no dia (tabela atuacao_dia). opts.fallbackFuncao=true usa a função
// cadastrada (usado em feriado, quando não há gerente para informar).
function dispatchAvaliacaoAdmin(empresaId, lojaId, data, criadoPor, opts = {}) {
  const fallbackFuncao = !!opts.fallbackFuncao;
  const semChefe = [];
  for (const d of DELEGADAS) {
    const pessoas = fallbackFuncao
      ? db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id=? AND ativo=1`).all(empresaId, lojaId, d.funcaoAvaliada)
      : db.prepare(`SELECT colaborador_id AS id FROM atuacao_dia WHERE empresa_id=? AND loja_id=? AND data=? AND funcao_atuada=?`).all(empresaId, lojaId, data, d.funcaoAvaliada);
    if (!pessoas.length) continue;
    const chefe = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id=? AND chefe_setor=1 AND ativo=1 LIMIT 1`).get(empresaId, d.chefeFuncao);
    if (!chefe) { semChefe.push(d.label); continue; } // sem chefe do setor definido: não dispara (não trava o gerente)
    let criou = 0;
    pessoas.forEach(p => {
      if (estaAfastado(empresaId, p.id, data)) return; // afastado/férias: não avalia
      const ja = db.prepare(`SELECT 1 FROM avaliacao_admin WHERE empresa_id=? AND loja_id=? AND data=? AND avaliado_id=?`).get(empresaId, lojaId, data, p.id);
      if (ja) return;
      db.prepare(`INSERT INTO avaliacao_admin (id,empresa_id,loja_id,data,funcao_id,avaliado_id,chefe_id) VALUES (?,?,?,?,?,?,?)`)
        .run(uuidv4(), empresaId, lojaId, data, d.funcaoAvaliada, p.id, chefe?.id || null);
      criou++;
    });
    if (criou && chefe) {
      const ref = `${lojaId}:${data}:${d.funcaoAvaliada}`;
      const jaTarefa = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='avaliacao_admin' AND referencia_id=?`).get(empresaId, ref);
      if (!jaTarefa) {
        const loja = db.prepare(`SELECT nome FROM lojas WHERE id=?`).get(lojaId);
        gerarTarefa({
          empresa_id: empresaId, loja_id: lojaId, tipo: 'tarefa', origem: 'avaliacao_admin', referencia_id: ref,
          titulo: `Avaliar ${d.label} — ${loja?.nome || ''}`,
          descricao: `Avalie ${criou} colaborador(es) de ${d.label.toLowerCase()} do dia ${data}. Faça em "Avaliações do setor".`,
          responsavel_id: chefe.id, urgente: 0, sla_horas: 24, criado_por: criadoPor,
        });
      }
    }
  }
  return { semChefe };
}

// Quantas avaliações administrativas ainda estão pendentes para uma loja/dia (trava o fechamento)
function pendentesDoDia(empresaId, lojaId, data) {
  return db.prepare(`SELECT COUNT(*) c FROM avaliacao_admin WHERE empresa_id=? AND loja_id=? AND data=? AND status='pendente'`).get(empresaId, lojaId, data).c;
}

// GET /avaliacao-admin?data= — fila do chefe; gestão vê todas (para não travar o fechamento)
router.get('/', (req, res) => {
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  let where = `a.empresa_id=? AND a.data=?`;
  const params = [req.usuario.empresa_id, data];
  if (!ehGestao) { where += ` AND a.chefe_id=?`; params.push(req.usuario.id); }
  const rows = db.prepare(`
    SELECT a.id, a.data, a.nota, a.nota_pct, a.status, a.funcao_id, a.reanalise_motivo, a.avaliado_id, a.loja_id, c.nome as avaliado_nome, l.nome as loja_nome, f.nome as funcao_nome, ch.nome as chefe_nome
    FROM avaliacao_admin a
    JOIN colaboradores c ON c.id=a.avaliado_id
    JOIN lojas l ON l.id=a.loja_id
    LEFT JOIN funcoes f ON f.id=a.funcao_id
    LEFT JOIN colaboradores ch ON ch.id=a.chefe_id
    WHERE ${where}
    ORDER BY (a.status='contestada') DESC, (a.status='pendente') DESC, l.nome, c.nome
  `).all(...params);
  res.json({ avaliacoes: rows, gestao: ehGestao });
});

// GET /avaliacao-admin/minhas?data= — o avaliado vê as próprias avaliações (e pode contestar 1x)
router.get('/minhas', (req, res) => {
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT a.id, a.data, a.nota, a.status, a.reanalisada, a.reanalise_motivo, ch.nome as chefe_nome, f.nome as funcao_nome
    FROM avaliacao_admin a
    LEFT JOIN colaboradores ch ON ch.id=a.chefe_id
    LEFT JOIN funcoes f ON f.id=a.funcao_id
    WHERE a.empresa_id=? AND a.avaliado_id=? AND a.data=?
    ORDER BY a.data DESC
  `).all(req.usuario.empresa_id, req.usuario.id, data);
  res.json({ avaliacoes: rows });
});

// POST /avaliacao-admin/:id/contestar — o avaliado contesta a nota (apenas 1 vez)
router.post('/:id/contestar', (req, res) => {
  const a = db.prepare(`SELECT * FROM avaliacao_admin WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  if (a.avaliado_id !== req.usuario.id) return res.status(403).json({ erro: 'Você só pode contestar a sua avaliação.' });
  if (a.status !== 'avaliada') return res.status(400).json({ erro: 'Só dá para contestar depois de avaliada.' });
  if (a.reanalisada) return res.status(400).json({ erro: 'Esta avaliação já foi contestada uma vez.' });
  const motivo = (req.body.motivo || '').trim();
  if (!motivo) return res.status(400).json({ erro: 'Escreva o motivo da contestação.' });
  db.prepare(`UPDATE avaliacao_admin SET status='contestada', reanalisada=1, reanalise_motivo=? WHERE id=?`).run(motivo, a.id);
  // avisa o chefe para reavaliar
  if (a.chefe_id) {
    const av = db.prepare(`SELECT nome FROM colaboradores WHERE id=?`).get(a.avaliado_id);
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: a.loja_id, tipo: 'tarefa', origem: 'avaliacao_admin',
      referencia_id: `contesta:${a.id}`,
      titulo: `Reavaliar ${av?.nome || 'colaborador'} (contestou a nota)`,
      descricao: `Motivo: ${motivo}. Reveja em "Avaliações do setor".`,
      responsavel_id: a.chefe_id, urgente: 0, sla_horas: 24, criado_por: req.usuario.id,
    });
  }
  res.json({ mensagem: 'Contestação enviada. O chefe do setor vai reavaliar.' });
});

// GET /avaliacao-admin/modelo?funcao_id= — itens de conduta (para avaliar e para o cadastro)
router.get('/modelo', (req, res) => {
  const fid = req.query.funcao_id;
  let q = `SELECT id, funcao_id, texto, ordem, ativo FROM avaliacao_conduta_modelo WHERE empresa_id=?`;
  const p = [req.usuario.empresa_id];
  if (fid) { q += ` AND funcao_id=?`; p.push(fid); }
  q += ` ORDER BY funcao_id, ordem, texto`;
  res.json({ itens: db.prepare(q).all(...p) });
});

router.post('/modelo', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const texto = (req.body.texto || '').trim();
  const fid = req.body.funcao_id;
  if (!texto || !fid) return res.status(400).json({ erro: 'Função e texto são obrigatórios.' });
  const eid = req.usuario.empresa_id;
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM avaliacao_conduta_modelo WHERE empresa_id=? AND funcao_id=?`).get(eid, fid)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO avaliacao_conduta_modelo (id,empresa_id,funcao_id,texto,ordem,ativo) VALUES (?,?,?,?,?,1)`).run(id, eid, fid, texto, ordem);
  res.status(201).json({ id, mensagem: 'Item criado.' });
});

router.patch('/modelo/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const it = db.prepare(`SELECT * FROM avaliacao_conduta_modelo WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const { texto, ativo } = req.body;
  db.prepare(`UPDATE avaliacao_conduta_modelo SET texto=?, ativo=? WHERE id=?`).run(texto ?? it.texto, ativo != null ? (ativo ? 1 : 0) : it.ativo, it.id);
  res.json({ mensagem: 'Item atualizado.' });
});

// GET /avaliacao-admin/:id/itens — itens de conduta da pessoa (modelo + nota já dada)
router.get('/:id/itens', (req, res) => {
  const a = db.prepare(`SELECT * FROM avaliacao_admin WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  const salvos = db.prepare(`SELECT texto, nota FROM avaliacao_admin_itens WHERE avaliacao_id=?`).all(a.id);
  const mapaSalvo = {}; salvos.forEach(s => { mapaSalvo[s.texto] = s.nota; });
  const modelo = db.prepare(`SELECT texto FROM avaliacao_conduta_modelo WHERE empresa_id=? AND funcao_id=? AND ativo=1 ORDER BY ordem, texto`).all(req.usuario.empresa_id, a.funcao_id);
  const itens = (modelo.length ? modelo.map(m => m.texto) : salvos.map(s => s.texto)).map(t => ({ texto: t, nota: mapaSalvo[t] || null }));
  res.json({ itens, status: a.status, nota_pct: a.nota_pct });
});

const MAPA_NOTA = { bom: 100, regular: 50, ruim: 0 };

// POST /avaliacao-admin/:id — chefe avalia a conduta (checklist de itens bom/regular/ruim)
router.post('/:id', (req, res) => {
  const a = db.prepare(`SELECT * FROM avaliacao_admin WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (a.chefe_id !== req.usuario.id && !ehGestao) return res.status(403).json({ erro: 'Só o chefe do setor (ou a gestão) avalia.' });
  const itens = Array.isArray(req.body.itens) ? req.body.itens : null;
  if (!itens || !itens.length) return res.status(400).json({ erro: 'Avalie os itens de conduta.' });
  if (itens.some(i => !['bom', 'regular', 'ruim', 'np'].includes(i.nota))) return res.status(400).json({ erro: 'Cada item deve ser bom, regular, ruim ou N/P.' });
  const avaliaveis = itens.filter(i => i.nota !== 'np'); // N/P (não se aplica) fica fora do cálculo
  const pct = avaliaveis.length ? Math.round(avaliaveis.reduce((s, i) => s + MAPA_NOTA[i.nota], 0) / avaliaveis.length) : 100;
  const notaGeral = pct >= 75 ? 'bom' : pct >= 40 ? 'regular' : 'ruim';
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM avaliacao_admin_itens WHERE avaliacao_id=?`).run(a.id);
    const ins = db.prepare(`INSERT INTO avaliacao_admin_itens (id,avaliacao_id,texto,nota) VALUES (?,?,?,?)`);
    itens.forEach(i => ins.run(uuidv4(), a.id, i.texto, i.nota));
    db.prepare(`UPDATE avaliacao_admin SET nota=?, nota_pct=?, status='avaliada' WHERE id=?`).run(notaGeral, pct, a.id);
  });
  tx();
  res.json({ mensagem: 'Avaliação registrada.', nota_pct: pct });
});

module.exports = router;
module.exports.dispatchAvaliacaoAdmin = dispatchAvaliacaoAdmin;
module.exports.pendentesDoDia = pendentesDoDia;
