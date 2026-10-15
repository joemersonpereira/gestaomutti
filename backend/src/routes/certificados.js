const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');

router.use(auth);

const TIPOS = ['conquista', 'reconhecimento', 'desenvolvimento'];

// GET /certificados?colaborador_id=
router.get('/', (req, res) => {
  let q = `SELECT c.*, col.nome as colaborador_nome FROM certificados c JOIN colaboradores col ON col.id=c.colaborador_id WHERE c.empresa_id=?`;
  const params = [req.usuario.empresa_id];
  if (req.query.colaborador_id) { q += ' AND c.colaborador_id=?'; params.push(req.query.colaborador_id); }
  else if (req.usuario.funcao_nome === 'Vendedor') { q += ' AND c.colaborador_id=?'; params.push(req.usuario.id); }
  res.json({ certificados: db.prepare(q + ' ORDER BY c.criado_em DESC').all(...params) });
});

// POST /certificados — gestão emite (validação do Diretor exigida)
// body: { colaborador_id, tipo, titulo, descricao, pontos }
router.post('/', exigePerfil('Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { colaborador_id, tipo, titulo, descricao, pontos } = req.body;
  const fonte = req.body.fonte || 'manual';
  if (!colaborador_id || !tipo || !titulo) return res.status(400).json({ erro: 'Colaborador, tipo e título obrigatórios.' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });

  const colab = db.prepare('SELECT nome, loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(colaborador_id, req.usuario.empresa_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });

  // Diretor emite já validado; demais ficam pendentes de validação
  const ehDiretor = req.usuario.funcao_nome === 'Diretor Geral';
  const validado = ehDiretor ? 1 : 0;
  const id = uuidv4();
  db.prepare(`INSERT INTO certificados (id,empresa_id,colaborador_id,tipo,titulo,descricao,emitido_por,pontos,fonte,validado,criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, colaborador_id, tipo, titulo, descricao || '', req.usuario.id, pontos || 0, fonte, validado);

  if (!validado) {
    const diretor = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-diretor' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id);
    if (diretor) gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: colab.loja_id, tipo: 'tarefa', origem: 'certificado',
      titulo: `Validar certificado — ${colab.nome}`,
      descricao: `${tipo}: ${titulo}. Valide na fila de aprovações.`,
      responsavel_id: diretor.id, sla_horas: 48, criado_por: req.usuario.id,
    });
  }
  res.status(201).json({ mensagem: validado ? 'Certificado emitido.' : 'Certificado enviado para validação do Diretor.', id, validado });
});

// POST /certificados/auto/caixa-sem-erro { mes, ano, pontos? } — conquista automática (outra fonte além de certificado)
router.post('/auto/caixa-sem-erro', exigePerfil('Tesouraria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.body.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.body.ano) || hoje.getFullYear();
  const pontos = req.body.pontos != null ? Number(req.body.pontos) : 10;
  const periodo = `${String(mes).padStart(2, '0')}/${ano}`;
  const titulo = `Caixa sem erros — ${periodo}`;

  const caixas = db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND funcao_id='func-caixa' AND ativo=1`).all(req.usuario.empresa_id);
  let concedidas = 0; const nomes = [];
  for (const cx of caixas) {
    const dias = db.prepare(`SELECT diferenca FROM lancamentos_caixa WHERE colaborador_id=? AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?`).all(cx.id, mes, ano);
    if (!dias.length) continue; // sem fechamentos: não qualifica
    const semErro = dias.every(d => Number(d.diferenca) === 0);
    if (!semErro) continue;
    const ja = db.prepare(`SELECT 1 FROM certificados WHERE empresa_id=? AND colaborador_id=? AND fonte='caixa_sem_erro' AND titulo=?`).get(req.usuario.empresa_id, cx.id, titulo);
    if (ja) continue;
    db.prepare(`INSERT INTO certificados (id,empresa_id,colaborador_id,tipo,titulo,descricao,emitido_por,pontos,fonte,validado,criado_em) VALUES (?,?,?,'conquista',?,?,?,?,'caixa_sem_erro',1,datetime('now'))`)
      .run(uuidv4(), req.usuario.empresa_id, cx.id, titulo, `${dias.length} fechamentos no mês, todos sem diferença.`, req.usuario.id, pontos);
    concedidas++; nomes.push(cx.nome);
  }
  res.json({ mensagem: concedidas ? `${concedidas} conquista(s) concedida(s): ${nomes.join(', ')}.` : 'Nenhum caixa qualificou (precisa ter fechamentos no mês, todos sem diferença).', concedidas, periodo });
});

// GET /certificados/minha-posicao?mes=&ano= — posição do PRÓPRIO colaborador no mês (não expõe os demais)
router.get('/minha-posicao', (req, res) => {
  const hoje = new Date();
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const mes = parseInt(req.query.mes) || (hoje.getMonth() + 1);
  const empresa_id = req.usuario.empresa_id;

  const colabs = db.prepare(`SELECT c.id FROM colaboradores c WHERE c.empresa_id=? AND c.ativo=1`).all(empresa_id);
  const ranking = colabs.map(c => {
    const certs = db.prepare(`SELECT COALESCE(SUM(pontos),0) p, COUNT(*) n FROM certificados WHERE colaborador_id=? AND validado=1`).get(c.id);
    const ocorr = db.prepare(`SELECT COALESCE(SUM(pontos_deduzidos),0) p FROM ocorrencias WHERE colaborador_id=? AND CAST(strftime('%m',data_ocorrencia) AS INTEGER)=? AND CAST(strftime('%Y',data_ocorrencia) AS INTEGER)=?`).get(c.id, mes, ano);
    const ind = db.prepare(`SELECT avaliacao FROM indicadores_vendedor WHERE colaborador_id=? AND mes=? AND ano=?`).all(c.id, mes, ano);
    const notaInd = ind.length ? Math.round(ind.reduce((a, r) => a + ({ bom: 100, regular: 50, ruim: 0 }[r.avaliacao] ?? 0), 0) / ind.length) : 0;
    const pontuacao = certs.p * 10 + notaInd - ocorr.p;
    return { colaborador_id: c.id, pontuacao, certificados: certs.n };
  }).filter(r => r.pontuacao !== 0 || r.certificados > 0);
  ranking.sort((a, b) => b.pontuacao - a.pontuacao);

  const idx = ranking.findIndex(r => r.colaborador_id === req.usuario.id);
  res.json({ mes, ano, total: ranking.length, posicao: idx >= 0 ? idx + 1 : null });
});

// GET /certificados/ranking?trimestre=&ano=&loja_id=
router.get('/ranking', (req, res) => {
  const hoje = new Date();
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const trimestre = parseInt(req.query.trimestre) || Math.floor(hoje.getMonth() / 3) + 1;
  const meses = [trimestre * 3 - 2, trimestre * 3 - 1, trimestre * 3];
  const empresa_id = req.usuario.empresa_id;

  let lojaFiltro = '';
  const params0 = [empresa_id];
  if (req.query.loja_id) { lojaFiltro = ' AND c.loja_id=?'; params0.push(req.query.loja_id); }

  const colabs = db.prepare(`SELECT c.id, c.nome, c.funcao_id, l.nome as loja_nome FROM colaboradores c JOIN lojas l ON l.id=c.loja_id WHERE c.empresa_id=? AND c.ativo=1${lojaFiltro}`).all(...params0);

  const ranking = colabs.map(c => {
    const certs = db.prepare(`SELECT COALESCE(SUM(pontos),0) p, COUNT(*) n FROM certificados WHERE colaborador_id=? AND validado=1`).get(c.id);
    const ocorr = db.prepare(`SELECT COALESCE(SUM(pontos_deduzidos),0) p FROM ocorrencias WHERE colaborador_id=? AND CAST(strftime('%m',data_ocorrencia) AS INTEGER) IN (${meses.join(',')}) AND CAST(strftime('%Y',data_ocorrencia) AS INTEGER)=?`).get(c.id, ano);
    // nota média de indicadores do trimestre (vendedor) — bom=100/regular=50/ruim=0
    const ind = db.prepare(`SELECT avaliacao FROM indicadores_vendedor WHERE colaborador_id=? AND mes IN (${meses.join(',')}) AND ano=?`).all(c.id, ano);
    const notaInd = ind.length ? Math.round(ind.reduce((a, r) => a + ({ bom: 100, regular: 50, ruim: 0 }[r.avaliacao] ?? 0), 0) / ind.length) : 0;
    const pontuacao = certs.p * 10 + notaInd - ocorr.p;
    return { colaborador_id: c.id, nome: c.nome, loja: c.loja_nome, funcao: c.funcao_id, certificados: certs.n, nota_indicadores: notaInd, pontos_perdidos: ocorr.p, pontuacao };
  }).filter(r => r.pontuacao !== 0 || r.certificados > 0);

  ranking.sort((a, b) => b.pontuacao - a.pontuacao);
  res.json({ ano, trimestre, meses, ranking });
});

module.exports = router;
