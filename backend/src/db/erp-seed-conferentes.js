// erp-seed-conferentes.js — Sincroniza os CONFERENTES do ERP como colaboradores do Mutti.
// Cada usuário que fez recebimento físico nos últimos N dias (>= MIN recebimentos) vira/
// atualiza um colaborador, lotado na loja onde MAIS recebeu, com:
//   - erp_usuario_id (usuario.id) → alimenta os indicadores do conferente (erros de entrada,
//     recepção de transporte) via recebimentoErp.
//   - erp_pessoa_id (usuario.pessoaid) → alimenta a comissão sobre as vendas dele.
// Regras de segurança:
//   - Se a pessoa JÁ existe como colaborador (vendedor/gerente/etc., casando por pessoaid ou
//     cpf), apenas VINCULA o erp_usuario_id (NÃO troca a função — não quebra o ranking dele).
//   - Só cria como func-conferente quem ainda não existe no Mutti.
// Idempotente: reexecutar não duplica (casa por erp_usuario_id → pessoaid → cpf).
//
// Uso (na pasta backend):  node src/db/erp-seed-conferentes.js [dias] [min]
const db = require('./connection');
const { erpQuery } = require('./erp');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DIAS = parseInt(process.argv[2] || '120', 10);
const MIN = parseInt(process.argv[3] || '50', 10);
const EMPRESA_ID = 'empresa-mutti-001';
const FUNCAO_CONFERENTE = 'func-conferente';

const limpaNome = n => String(n || '').replace(/#+\s*$/, '').trim();
const soDigitos = s => String(s || '').replace(/\D/g, '');

async function main() {
  const lojas = db.prepare('SELECT id, nome, erp_unidadenegocio_id FROM lojas WHERE erp_unidadenegocio_id IS NOT NULL').all();
  const lojaPorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.id]));
  const unis = lojas.map(l => Number(l.erp_unidadenegocio_id));
  if (!unis.length) { console.error('Nenhuma loja mapeada ao ERP.'); process.exit(1); }

  console.log(`▶ Buscando conferentes do ERP (últimos ${DIAS} dias, ≥ ${MIN} recebimentos)...`);
  const rows = await erpQuery(`
    WITH ativ AS (
      SELECT rf.usuarioid, rf.unidadenegocioid AS uni, COUNT(*) AS n
      FROM recebimentofisico rf
      WHERE rf.datahora >= (CURRENT_DATE - ($1 || ' days')::interval) AND rf.unidadenegocioid = ANY($2::bigint[])
      GROUP BY rf.usuarioid, rf.unidadenegocioid
    ), tot AS (SELECT usuarioid, SUM(n) total FROM ativ GROUP BY usuarioid)
    SELECT DISTINCT ON (a.usuarioid)
      a.usuarioid, u.pessoaid, u.apelido AS nome, u.login, pe.cpf, a.uni AS loja_erp, t.total
    FROM ativ a JOIN tot t ON t.usuarioid = a.usuarioid
    JOIN usuario u ON u.id = a.usuarioid LEFT JOIN pessoa pe ON pe.id = u.pessoaid
    WHERE t.total >= $3
    ORDER BY a.usuarioid, a.n DESC`, [DIAS, unis, MIN]);
  console.log(`  ${rows.length} conferente(s) encontrado(s).`);

  const senhaHash = bcrypt.hashSync(uuidv4(), 8); // aleatória (não logam)
  const porUsuario = db.prepare('SELECT id, funcao_id FROM colaboradores WHERE erp_usuario_id = ?');
  const porPessoa = db.prepare('SELECT id, funcao_id FROM colaboradores WHERE erp_pessoa_id = ?');
  const porCpf = db.prepare("SELECT id, funcao_id FROM colaboradores WHERE cpf = ? AND cpf <> ''");
  const insert = db.prepare(`
    INSERT INTO colaboradores
      (id, empresa_id, loja_id, funcao_id, departamento, situacao, nome, cpf, email,
       salario, senha_hash, senha_provisoria, ativo, admissao, erp_pessoa_id, erp_usuario_id, conferente, origem_erp, criado_em)
    VALUES (?, ?, ?, ?, 'Recebimento', 'ativo', ?, ?, ?, 0, ?, 1, 1, '2020-01-01', ?, ?, 1, 1, datetime('now'))`);
  // Vincula o usuario (e pessoa, se faltando) e MARCA como conferente, sem trocar a função de quem já existe.
  const vincula = db.prepare(`UPDATE colaboradores SET erp_usuario_id = ?, loja_id = COALESCE(loja_id, ?),
    erp_pessoa_id = COALESCE(erp_pessoa_id, ?), conferente = 1, origem_erp = 1 WHERE id = ?`);

  let criados = 0, vinculados = 0, semLoja = 0;
  const detalhe = [];
  const tx = db.transaction(() => {
    for (const r of rows) {
      const lojaId = lojaPorUni.get(Number(r.loja_erp));
      if (!lojaId) { semLoja++; continue; }
      const nome = limpaNome(r.nome) || `Conferente ${r.usuarioid}`;
      const cpf = soDigitos(r.cpf) || null;
      const pessoa = r.pessoaid || null;

      let alvo = porUsuario.get(r.usuarioid);
      if (!alvo && pessoa) alvo = porPessoa.get(pessoa);
      if (!alvo && cpf) alvo = porCpf.get(cpf);

      if (alvo) {
        vincula.run(r.usuarioid, lojaId, pessoa, alvo.id);
        vinculados++;
        detalhe.push(`  ↪ vinculado: ${nome} (${alvo.funcao_id})`);
      } else {
        const email = `erp-u${r.usuarioid}@grupomutti.local`;
        insert.run(uuidv4(), EMPRESA_ID, lojaId, FUNCAO_CONFERENTE, nome, cpf, email, senhaHash, pessoa, r.usuarioid);
        criados++;
        detalhe.push(`  ✚ criado: ${nome}${pessoa ? '' : ' (sem pessoa → sem comissão)'}`);
      }
    }
  });
  tx();
  detalhe.forEach(d => console.log(d));
  console.log(`✓ Conferentes: ${criados} criado(s), ${vinculados} vinculado(s)` + (semLoja ? `, ${semLoja} fora do mapa` : '') + '.');
  process.exit(0);
}

main().catch(e => { console.error('✗ Erro:', e.message); process.exit(1); });
