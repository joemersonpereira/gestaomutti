// lib/avaliacaoTrimestral.js — abertura AUTOMÁTICA da avaliação trimestral.
// No início de cada trimestre (a partir do dia configurado), abre uma tarefa para o
// GERENTE e o SUBGERENTE de cada loja avaliarem a equipe. Idempotente por trimestre/avaliador.
const db = require('../db/connection');
const { gerarTarefa } = require('../routes/tarefas');

const DEF = { ativo: 1, dia: 5 }; // por padrão abre no dia 5 do 1º mês do trimestre
function getConfig(emp) {
  const r = ch => db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(emp, ch);
  const a = r('td_aval_ativa'), d = r('td_aval_dia');
  return { ativo: a ? Number(a.valor) : DEF.ativo, dia: d ? Number(d.valor) : DEF.dia };
}
function setConfig(emp, cfg) {
  const up = (ch, v) => db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(emp, ch, String(v));
  if (cfg.ativo != null) up('td_aval_ativa', cfg.ativo ? 1 : 0);
  if (cfg.dia != null) up('td_aval_dia', Math.max(1, Math.min(28, Number(cfg.dia) || DEF.dia)));
  return getConfig(emp);
}

const triDe = mes => Math.floor((mes - 1) / 3) + 1;

// Cria (idempotente) a tarefa de avaliar a equipe p/ gerente e subgerente de cada loja.
// force=true ignora a checagem de dia (usado no "abrir agora").
function abrirTrimestre(emp, force = false) {
  const cfg = getConfig(emp);
  if (!cfg.ativo && !force) return { ok: false, motivo: 'desativado' };
  const hoje = new Date();
  const mes = hoje.getMonth() + 1, ano = hoje.getFullYear(), tri = triDe(mes);
  const mesInicioTri = (tri - 1) * 3 + 1;
  // só abre no 1º mês do trimestre e a partir do dia configurado (a não ser que force)
  if (!force && !(mes === mesInicioTri && hoje.getDate() >= cfg.dia)) return { ok: false, motivo: 'fora da janela' };

  const lojas = db.prepare('SELECT id, nome, gerente_id, subgerente_id FROM lojas WHERE empresa_id=? AND ativa=1').all(emp);
  let criadas = 0;
  for (const loja of lojas) {
    const equipe = db.prepare('SELECT COUNT(*) c FROM colaboradores WHERE empresa_id=? AND loja_id=? AND ativo=1').get(emp, loja.id).c;
    for (const [papel, colabId] of [['gerente', loja.gerente_id], ['subgerente', loja.subgerente_id]]) {
      if (!colabId) continue;
      const ref = `avtd:${loja.id}:${colabId}:${tri}-${ano}`;
      const existe = db.prepare("SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='avaliacao_td' AND referencia_id=?").get(emp, ref);
      if (existe) continue;
      gerarTarefa({
        empresa_id: emp, loja_id: loja.id, tipo: 'tarefa', origem: 'avaliacao_td', referencia_id: ref,
        titulo: `Avaliar sua equipe — ${tri}º trimestre/${ano}`,
        descricao: `Avalie os ${equipe} colaboradores da loja ${loja.nome} (${papel}) na tela Capacitação → Avaliação & PDI. Cada líder faz a sua avaliação.`,
        responsavel_id: colabId, criado_por: 'sistema',
      });
      criadas++;
    }
  }
  return { ok: true, trimestre: tri, ano, criadas };
}

const { v4: uuid } = require('uuid');
// Prêmio (pontos) por faixa de nota da avaliação trimestral consolidada. Configurável.
const PREMIO_DEF = [{ min: 4.5, pontos: 100 }, { min: 4, pontos: 60 }, { min: 3, pontos: 30 }, { min: 0, pontos: 0 }];
function getPremio(emp) {
  const r = db.prepare("SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='td_aval_premio'").get(emp);
  if (!r) return PREMIO_DEF;
  try { const v = JSON.parse(r.valor); return Array.isArray(v) && v.length ? v : PREMIO_DEF; } catch { return PREMIO_DEF; }
}
function setPremio(emp, faixas) {
  const v = (Array.isArray(faixas) ? faixas : []).map(f => ({ min: Number(f.min) || 0, pontos: Number(f.pontos) || 0 })).sort((a, b) => b.min - a.min);
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,?,?) ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(emp, 'td_aval_premio', JSON.stringify(v.length ? v : PREMIO_DEF));
  return getPremio(emp);
}
// Média consolidada (todas as visões concluídas) de um colaborador num trimestre.
function mediaConsolidada(emp, colabId, tri, ano) {
  const rows = db.prepare("SELECT id FROM td_avaliacao WHERE empresa_id=? AND colaborador_id=? AND trimestre=? AND ano=? AND status='concluida'").all(emp, colabId, tri, ano);
  const notas = [];
  for (const r of rows) db.prepare('SELECT nota FROM td_avaliacao_item WHERE avaliacao_id=? AND nota IS NOT NULL').all(r.id).forEach(i => notas.push(i.nota));
  return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
}
// Credita (idempotente) os pontos do prêmio da avaliação trimestral consolidada.
function premiarAvaliacao(emp, colabId, tri, ano) {
  const media = mediaConsolidada(emp, colabId, tri, ano);
  const ref = `avaltd:${colabId}:${tri}-${ano}`;
  db.prepare('DELETE FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').run(emp, ref);
  if (media == null) return { ok: false };
  const faixa = getPremio(emp).find(f => media >= f.min) || { pontos: 0 };
  if (faixa.pontos > 0) {
    const colab = db.prepare('SELECT nome FROM colaboradores WHERE id=?').get(colabId) || {};
    db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,tipo,descricao,pontos,competencia,origem,ref,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(uuid(), emp, colabId, colab.nome || null, 'avaliacao', `Avaliação ${tri}º tri/${ano} (média ${media.toFixed(1)})`, Math.round(faixa.pontos), `${ano}-Q${tri}`, 'automatico', ref);
  }
  return { ok: true, media, pontos: faixa.pontos };
}

module.exports = { getConfig, setConfig, abrirTrimestre, getPremio, setPremio, premiarAvaliacao, mediaConsolidada };
