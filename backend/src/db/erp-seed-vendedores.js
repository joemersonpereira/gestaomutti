// erp-seed-vendedores.js — Sincroniza os VENDEDORES do ERP como colaboradores do Mutti.
// Cada pessoa que vendeu nos últimos N dias vira um colaborador (função Vendedor),
// lotado na loja onde MAIS vendeu, com o vínculo erp_pessoa_id preenchido.
// Idempotente: reexecutar atualiza (não duplica), casando por erp_pessoa_id.
//
// Uso (na pasta backend):  node src/db/erp-seed-vendedores.js [dias]
const db = require('./connection');
const { erpQuery } = require('./erp');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DIAS = parseInt(process.argv[2] || '120', 10);
const EMPRESA_ID = 'empresa-mutti-001';
const FUNCAO_VENDEDOR = 'func-vendedor';

function limpaNome(n) {
  return String(n || '').replace(/#+\s*$/, '').trim(); // '#' no fim marca inativo no ERP
}
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

async function main() {
  // Lojas do Mutti que têm vínculo com o ERP.
  const lojas = db.prepare(
    'SELECT id, nome, erp_unidadenegocio_id FROM lojas WHERE erp_unidadenegocio_id IS NOT NULL'
  ).all();
  const lojaPorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.id]));
  const unis = lojas.map(l => Number(l.erp_unidadenegocio_id));
  if (!unis.length) { console.error('Nenhuma loja mapeada ao ERP. Rode a migração 069 primeiro.'); process.exit(1); }

  console.log(`▶ Buscando vendedores do ERP (últimos ${DIAS} dias)...`);
  const rows = await erpQuery(`
    WITH vp AS (
      SELECT u.pessoaid, v.unidadenegocioid AS uni, SUM(v.valortotal) AS tot
      FROM venda v
      LEFT JOIN orcamento o ON o.id=v.orcamentoid JOIN usuario u ON u.id = COALESCE(o.usuarioid,v.usuarioid)
      WHERE v.status IN ('F','D')
        AND v.datahorafechamento >= (CURRENT_DATE - ($1 || ' days')::interval)
        AND v.unidadenegocioid = ANY($2::bigint[])
        AND u.pessoaid IS NOT NULL
      GROUP BY u.pessoaid, v.unidadenegocioid
    )
    SELECT DISTINCT ON (vp.pessoaid)
      vp.pessoaid,
      pe.nome,
      pe.cpf,
      vp.uni AS loja_erp,
      (SELECT SUM(tot) FROM vp x WHERE x.pessoaid = vp.pessoaid) AS total_geral
    FROM vp
    JOIN pessoa pe ON pe.id = vp.pessoaid
    ORDER BY vp.pessoaid, vp.tot DESC
  `, [DIAS, unis]);

  console.log(`  ${rows.length} vendedor(es) encontrado(s) no ERP.`);

  const senhaHash = bcrypt.hashSync(uuidv4(), 8); // senha aleatória (provisória, não logam ainda)

  const existePorPessoa = db.prepare('SELECT id FROM colaboradores WHERE erp_pessoa_id = ?');
  const existePorCpf = db.prepare("SELECT id FROM colaboradores WHERE cpf = ? AND cpf IS NOT NULL AND cpf <> ''");
  const insert = db.prepare(`
    INSERT INTO colaboradores
      (id, empresa_id, loja_id, funcao_id, departamento, situacao, nome, cpf, email,
       salario, senha_hash, senha_provisoria, ativo, admissao, erp_pessoa_id, origem_erp, criado_em)
    VALUES (?, ?, ?, ?, 'Atendimento', 'ativo', ?, ?, ?, 0, ?, 1, 1, '2020-01-01', ?, 1, datetime('now'))
  `);
  const updateVinc = db.prepare(`
    UPDATE colaboradores SET loja_id = ?, nome = ?, erp_pessoa_id = ?, origem_erp = 1,
      cpf = COALESCE(NULLIF(cpf,''), ?) WHERE id = ?
  `);

  let criados = 0, atualizados = 0, semLoja = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const lojaId = lojaPorUni.get(Number(r.loja_erp));
      if (!lojaId) { semLoja++; continue; }
      const nome = limpaNome(r.nome) || `Vendedor ${r.pessoaid}`;
      const cpf = soDigitos(r.cpf) || null;

      // Já existe pelo vínculo? Ou casa por CPF com algum colaborador já cadastrado?
      let alvo = existePorPessoa.get(r.pessoaid);
      if (!alvo && cpf) alvo = existePorCpf.get(cpf);

      if (alvo) {
        updateVinc.run(lojaId, nome, r.pessoaid, cpf, alvo.id);
        atualizados++;
      } else {
        const email = `erp-${r.pessoaid}@grupomutti.local`; // placeholder único (não loga)
        insert.run(uuidv4(), EMPRESA_ID, lojaId, FUNCAO_VENDEDOR, nome, cpf, email, senhaHash, r.pessoaid);
        criados++;
      }
    }
  });
  tx();

  console.log(`✓ Vendedores sincronizados: ${criados} criado(s), ${atualizados} atualizado(s)` +
              (semLoja ? `, ${semLoja} ignorado(s) (loja fora do mapa)` : '') + '.');
  process.exit(0);
}

main().catch(e => { console.error('✗ Erro na sincronização de vendedores:', e.message); process.exit(1); });
