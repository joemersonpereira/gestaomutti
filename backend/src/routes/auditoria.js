const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

// GET /auditoria?loja_id=
router.get('/', (req, res) => {
  let q = `
    SELECT a.*, l.nome as loja_nome, s.nome as supervisor_nome
    FROM auditorias a
    JOIN lojas l ON l.id = a.loja_id
    JOIN colaboradores s ON s.id = a.supervisor_id
    WHERE a.empresa_id = ?
  `;
  const params = [req.usuario.empresa_id];
  if (req.query.loja_id) { q += ' AND a.loja_id = ?'; params.push(req.query.loja_id); }
  else if (req.usuario.funcao_nome === 'Gerente') { q += ' AND a.loja_id = ?'; params.push(req.usuario.loja_id); }
  const auds = db.prepare(q + ' ORDER BY a.data DESC LIMIT 40').all(...params);
  auds.forEach(a => { a.itens = db.prepare('SELECT * FROM auditoria_itens WHERE auditoria_id = ?').all(a.id); });
  res.json({ auditorias: auds });
});

// POST /auditoria — supervisor registra visita
// body: { loja_id, data, observacoes, itens: [{categoria, texto, peso, resultado}] }
router.post('/', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { loja_id, data, observacoes, itens = [] } = req.body;
  if (!loja_id || !itens.length) return res.status(400).json({ erro: 'Loja e itens obrigatórios.' });

  const ESCALA = { bom: 1.0, regular: 0.5, ruim: 0.0 };
  let pesoObtido = 0, pesoTotal = 0;
  const naoConformes = [];
  itens.forEach(it => {
    const p = it.peso || Math.round(100 / itens.length);
    pesoTotal += p;
    pesoObtido += p * (ESCALA[it.resultado] ?? 0);
    if (it.resultado === 'ruim') naoConformes.push(it.texto);
  });
  const nota = pesoTotal ? Math.round((pesoObtido / pesoTotal) * 100) : 100;

  const id = uuidv4();
  db.prepare(`INSERT INTO auditorias (id,empresa_id,loja_id,supervisor_id,data,nota,observacoes) VALUES (?,?,?,?,?,?,?)`)
    .run(id, req.usuario.empresa_id, loja_id, req.usuario.id, data || new Date().toISOString().slice(0, 10), nota, observacoes || '');
  const ins = db.prepare(`INSERT INTO auditoria_itens (id,auditoria_id,categoria,texto,peso,resultado,observacao) VALUES (?,?,?,?,?,?,?)`);
  itens.forEach(it => ins.run(uuidv4(), id, it.categoria || '', it.texto, it.peso || Math.round(100 / itens.length), it.resultado, it.observacao || null));

  // Regra universal: não conformidades geram tarefa para o gerente
  let tarefa_gerada = false;
  if (naoConformes.length) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, loja_id);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id, tipo: 'tarefa', origem: 'auditoria',
        titulo: `Correção — Auditoria ${data || ''} (nota ${nota})`,
        descricao: `Itens avaliados como Ruim: ${naoConformes.join('; ')}.`,
        responsavel_id: gerente.id, urgente: nota < 95 ? 1 : 0, sla_horas: 72, criado_por: req.usuario.id,
      });
      tarefa_gerada = true;
    }
  }
  res.status(201).json({ mensagem: 'Auditoria registrada.', id, nota, nao_conformes: naoConformes.length, tarefa_gerada });
});

// ── Modelo do Checklist de Supervisão (itens cadastráveis) ──
// GET /auditoria/modelo — lista de itens (para preencher a auditoria e para o cadastro)
router.get('/modelo', (req, res) => {
  const itens = db.prepare(`SELECT id, texto, ordem, ativo FROM auditoria_modelo_itens WHERE empresa_id=? ORDER BY ordem, texto`).all(req.usuario.empresa_id);
  res.json({ itens });
});

router.post('/modelo', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const texto = (req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Texto do item é obrigatório.' });
  const eid = req.usuario.empresa_id;
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM auditoria_modelo_itens WHERE empresa_id=?`).get(eid)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO auditoria_modelo_itens (id,empresa_id,texto,ordem,ativo) VALUES (?,?,?,?,1)`).run(id, eid, texto, ordem);
  res.status(201).json({ id, mensagem: 'Item criado.' });
});

router.patch('/modelo/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const it = db.prepare(`SELECT * FROM auditoria_modelo_itens WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const { texto, ativo } = req.body;
  db.prepare(`UPDATE auditoria_modelo_itens SET texto=?, ativo=? WHERE id=?`).run(texto ?? it.texto, ativo != null ? (ativo ? 1 : 0) : it.ativo, it.id);
  res.json({ mensagem: 'Item atualizado.' });
});

module.exports = router;
