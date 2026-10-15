// Cálculo de indicadores impactados por ocorrências e pela avaliação de atendimento.
const db = require('../db/connection');

// Indicador impactado por ocorrências: começa em 100 e cada ocorrência ativa deduz.
// Se alguma ocorrência "zera", o indicador vai a 0. Sem ocorrências → 100.
function scorePorOcorrencias(empresaId, colaboradorId, indicadorAlvo, mes, ano) {
  const occ = db.prepare(`SELECT deducao, zera FROM ocorrencias
    WHERE empresa_id=? AND colaborador_id=? AND indicador_alvo=? AND status IN ('ativa','reanalise')
      AND CAST(strftime('%m', data) AS INTEGER)=? AND CAST(strftime('%Y', data) AS INTEGER)=?`)
    .all(empresaId, colaboradorId, indicadorAlvo, mes, ano);
  if (occ.some(o => o.zera)) return 0;
  const total = occ.reduce((a, o) => a + (o.deducao || 0), 0);
  return Math.max(0, Math.round(100 - total));
}

// Média das avaliações de atendimento recebidas (1-5) convertida em 0-100. Sem avaliação → null.
function scoreAtendimento(empresaId, colaboradorId, mes, ano) {
  const rows = db.prepare(`SELECT a.nota FROM avaliacoes_tarefa a JOIN tarefas t ON t.id=a.tarefa_id
    WHERE t.empresa_id=? AND a.avaliado_id=? AND a.tipo='atendimento'
      AND (a.status IS NULL OR a.status='ativa')
      AND CAST(strftime('%m', a.criado_em) AS INTEGER)=? AND CAST(strftime('%Y', a.criado_em) AS INTEGER)=?`)
    .all(empresaId, colaboradorId, mes, ano);
  if (!rows.length) return null;
  const media = rows.reduce((a, r) => a + r.nota, 0) / rows.length;
  return Math.round(media * 20); // 5★ = 100
}

module.exports = { scorePorOcorrencias, scoreAtendimento };
