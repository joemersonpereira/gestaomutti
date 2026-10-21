// 305_estagio_backfill_fichas.js — cria a ficha de estágio pra todo colaborador marcado "é estagiário"
// (is_estagiario=1) que ainda NÃO tem ficha. Conserta quem foi marcado em lote/import sem passar pelo
// syncEstagiario (a marca existia, mas a ficha não — então não aparecia na visão de Estágio).
// Idempotente: só insere quando não existe ficha vinculada ao colaborador.
const db = require('../connection');
const { randomUUID } = require('crypto');

const marcados = db.prepare(`
  SELECT c.id, c.empresa_id, c.nome, c.cpf, c.loja_id
  FROM colaboradores c
  WHERE c.is_estagiario = 1
    AND NOT EXISTS (SELECT 1 FROM estagio_ficha f WHERE f.colaborador_id = c.id)
`).all();

const ins = db.prepare(`INSERT INTO estagio_ficha (id,empresa_id,nome,cpf,loja,status,origem,colaborador_id,criado_em,atualizado_em)
  VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`);

let n = 0;
for (const c of marcados) { ins.run(randomUUID(), c.empresa_id, c.nome, c.cpf || '', c.loja_id, 'ativo', 'colaborador', c.id); n++; }

console.log('✅ migration 305: backfill de ' + n + ' ficha(s) de estágio (colaboradores marcados sem ficha)');
