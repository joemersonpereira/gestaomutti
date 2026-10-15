const jwt = require('jsonwebtoken');
const db = require('../db/connection');

// Presença online: grava last_seen no máximo 1x/min por usuário (evita escrita a cada request).
const _presenca = new Map();
function marcarPresenca(colabId) {
  const agora = Date.now();
  if (agora - (_presenca.get(colabId) || 0) < 60 * 1000) return;
  _presenca.set(colabId, agora);
  try { db.prepare(`UPDATE colaboradores SET last_seen=datetime('now') WHERE id=?`).run(colabId); } catch { /* ignora */ }
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não informado.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Busca colaborador ativo
    const colab = db.prepare(`
      SELECT c.*, f.nome as funcao_nome, f.escritorio as escritorio, l.nome as loja_nome
      FROM colaboradores c
      JOIN funcoes f ON f.id = c.funcao_id
      JOIN lojas l ON l.id = c.loja_id
      WHERE c.id = ? AND c.ativo = 1
    `).get(payload.id);
    if (!colab) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado.' });
    req.usuario = colab;
    marcarPresenca(colab.id); // presença online (throttled)
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

function exigePerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario.funcao_nome)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }
    next();
  };
}

// Igual ao exigePerfil, mas também libera quem está marcado como Liderança no cadastro
// (usado para o substituto cobrir o checklist do gerente quando gerente e subgerente folgam).
function exigePerfilOuLideranca(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario.funcao_nome) && !req.usuario.lideranca) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }
    next();
  };
}

module.exports = { auth, exigePerfil, exigePerfilOuLideranca };
