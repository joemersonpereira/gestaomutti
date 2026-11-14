// Observações do "Meu Setor" — anotações que a equipe acumula dentro do painel de metas.
// Genérico por `setor` (tesouraria, retail, …). Qualquer rota chama list/add/remover.
const db = require('./../db/connection');
const { randomUUID } = require('crypto');

function list(empresaId, setor, { limite = 100 } = {}) {
  const itens = db.prepare(`SELECT id, usuario_id, autor_nome, texto, criado_em
    FROM setor_observacao WHERE empresa_id=? AND setor=? ORDER BY criado_em DESC LIMIT ?`).all(empresaId, setor, limite);
  return { itens };
}
function add(empresaId, setor, { texto, usuario } = {}) {
  const t = String(texto || '').trim();
  if (!t) throw new Error('Escreva a observação.');
  const id = randomUUID();
  db.prepare(`INSERT INTO setor_observacao (id, empresa_id, setor, usuario_id, autor_nome, texto)
    VALUES (?,?,?,?,?,?)`).run(id, empresaId, setor, usuario?.id || null, usuario?.nome || null, t);
  return { ok: true, id };
}
function remover(empresaId, setor, id, { usuario } = {}) {
  // autor remove a própria; gestão/liderança remove qualquer uma.
  const row = db.prepare('SELECT usuario_id FROM setor_observacao WHERE id=? AND empresa_id=? AND setor=?').get(id, empresaId, setor);
  if (!row) return { ok: true };
  const podeTudo = usuario?.lideranca || ['Diretor Geral', 'Gestor Geral', 'Controladoria'].includes(usuario?.funcao_nome);
  if (!podeTudo && row.usuario_id && row.usuario_id !== usuario?.id) throw new Error('Só o autor (ou a gestão) pode apagar.');
  db.prepare('DELETE FROM setor_observacao WHERE id=? AND empresa_id=? AND setor=?').run(id, empresaId, setor);
  return { ok: true };
}
module.exports = { list, add, remover };
