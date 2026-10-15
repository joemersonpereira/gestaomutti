// painelRh.js — Painel de Gente & Gestão: headcount, celebrações, pendências de cadastro
// e indicadores de desligamento (turnover/eNPS) numa visão única para o RH/gestão.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);

router.get('/', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor'), (req, res) => {
  const emp = req.usuario.empresa_id;
  const hoje = new Date();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0'), yy = String(hoje.getFullYear());
  const q1 = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch { return {}; } };
  const qa = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch { return []; } };

  // Headcount
  const ativos = q1(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1`, emp).n || 0;
  const porLoja = qa(`SELECT l.nome loja, COUNT(*) n FROM colaboradores c JOIN lojas l ON l.id=c.loja_id WHERE c.empresa_id=? AND c.ativo=1 GROUP BY l.nome ORDER BY n DESC`, emp);
  const porFuncao = qa(`SELECT f.nome funcao, COUNT(*) n FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.ativo=1 GROUP BY f.nome ORDER BY n DESC LIMIT 8`, emp);

  // Pendências de cadastro (dados que faltam completar)
  const pend = {
    sem_cpf: q1(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 AND (cpf IS NULL OR cpf='')`, emp).n || 0,
    sem_lgpd: q1(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 AND (lgpd_consentido IS NULL OR lgpd_consentido=0)`, emp).n || 0,
    sem_foto: q1(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 AND foto IS NULL`, emp).n || 0,
    sem_tamanhos: q1(`SELECT COUNT(*) n FROM colaboradores WHERE empresa_id=? AND ativo=1 AND num_calcado IS NULL AND tam_blusa IS NULL AND tam_calca IS NULL`, emp).n || 0,
  };
  pend.lista_sem_cpf = qa(`SELECT nome FROM colaboradores WHERE empresa_id=? AND ativo=1 AND (cpf IS NULL OR cpf='') ORDER BY nome LIMIT 12`, emp).map(r => r.nome);

  // Celebrações / movimento
  const base = `FROM colaboradores c WHERE c.empresa_id=? AND c.ativo=1`;
  const lojaNome = `(SELECT nome FROM lojas WHERE id=c.loja_id)`;
  const aniversariantes = qa(`SELECT c.nome, ${lojaNome} loja, strftime('%d', c.nascimento) dia ${base}
    AND c.nascimento IS NOT NULL AND strftime('%m', c.nascimento)=? ORDER BY strftime('%d', c.nascimento)`, emp, mm);
  const novos = qa(`SELECT c.nome, ${lojaNome} loja, c.admissao ${base} AND c.admissao IS NOT NULL AND c.admissao >= date('now','-30 days','localtime') ORDER BY c.admissao DESC`, emp);
  const inicioProx = qa(`SELECT c.nome, ${lojaNome} loja, c.inicio_loja ${base} AND c.inicio_loja IS NOT NULL
    AND date(c.inicio_loja) >= date('now','localtime') AND date(c.inicio_loja) <= date('now','+7 days','localtime') ORDER BY c.inicio_loja`, emp);
  const folgasHoje = qa(`SELECT c.nome, (SELECT nome FROM lojas WHERE id=f.loja_id) loja FROM folgas f JOIN colaboradores c ON c.id=f.colaborador_id
    WHERE f.empresa_id=? AND c.ativo=1 AND f.status='aprovada' AND date(f.data)=date('now','localtime') ORDER BY c.nome`, emp);
  let feriasHoje = [];
  try {
    feriasHoje = qa(`SELECT c.nome, (SELECT nome FROM lojas WHERE id=c.loja_id) loja, a.data_fim FROM afastamentos a JOIN colaboradores c ON c.id=a.colaborador_id
      WHERE a.empresa_id=? AND c.ativo=1 AND a.tipo='ferias' AND date(a.data_inicio)<=date('now','localtime') AND (a.data_fim IS NULL OR date(a.data_fim)>=date('now','localtime')) ORDER BY c.nome`, emp);
  } catch { feriasHoje = []; }

  // Desligamentos (turnover) + eNPS de saída
  let deslig = { total: 0, mes: 0, ano: 0, pendentes: 0, enps: null, por_tipo: {}, motivo_top: null };
  try {
    const all = qa(`SELECT * FROM desligamentos WHERE empresa_id=?`, emp);
    deslig.total = all.length;
    deslig.mes = all.filter(d => (d.data_desligamento || d.criado_em || '').slice(0, 7) === `${yy}-${mm}`).length;
    deslig.ano = all.filter(d => (d.data_desligamento || d.criado_em || '').slice(0, 4) === yy).length;
    deslig.pendentes = all.filter(d => d.pesquisa_status !== 'respondida').length;
    all.forEach(d => { const k = d.tipo || 'outro'; deslig.por_tipo[k] = (deslig.por_tipo[k] || 0) + 1; });
    const enpsVals = all.map(d => d.enps).filter(n => n != null);
    if (enpsVals.length) { const pro = enpsVals.filter(n => n >= 9).length, det = enpsVals.filter(n => n <= 6).length; deslig.enps = Math.round((pro - det) / enpsVals.length * 100); }
    const mot = {}; all.forEach(d => { if (d.motivo_saida) mot[d.motivo_saida] = (mot[d.motivo_saida] || 0) + 1; });
    const top = Object.entries(mot).sort((a, b) => b[1] - a[1])[0];
    deslig.motivo_top = top ? { motivo: top[0], n: top[1] } : null;
  } catch { /* sem tabela */ }

  res.json({
    headcount: { ativos, por_loja: porLoja, por_funcao: porFuncao },
    pendencias: pend,
    celebracoes: { aniversariantes, novos, inicio_proximos: inicioProx, folgas_hoje: folgasHoje, ferias_hoje: feriasHoje },
    desligamentos: deslig,
  });
});

module.exports = router;
