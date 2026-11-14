// spedPreValidadorErp.js — VALIDADOR PRÉ-SPED: confere no ERP, ANTES do Alpha gerar o arquivo, os
// problemas de CADASTRO que quebram/rejeitam o SPED (a fiscal corrige na fonte antes de gerar).
// Só checa o que ESTÁ no ERP (o CFOP de entrada nasce no SPED — esse é validado no .txt, ver spedValidadorErp).
// Checagens: produto movimentado sem NCM (reg 0200), fornecedor sem CNPJ/CPF (reg 0150), NF sem chave (C100).
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const db = require('../db/connection');

function nomeLoja(uni) { const r = db.prepare('SELECT nome FROM lojas WHERE erp_unidadenegocio_id=?').get(uni); return r ? r.nome : String(uni); }

async function validarPreSped(empresaId, { ano, mes, lojaId = '', limite = 600 } = {}) {
  if (!habilitado()) return { erp: false };
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length) return { erp: true, erro: 'Nenhuma loja vinculada.' };
  const now = new Date();
  const a = Number(ano) || now.getFullYear(), m = Number(mes) || (now.getMonth() + 1);
  const ini = `${a}-${String(m).padStart(2, '0')}-01`;
  const fimD = new Date(a, m, 0);
  const fim = `${a}-${String(m).padStart(2, '0')}-${String(fimD.getDate()).padStart(2, '0')}`;
  const base = [unis, ini, fim];
  const lim = Number(limite) || 100;

  // 1) Produtos movimentados (entrada) no mês SEM NCM (ncmid nulo ou código != 8 dígitos).
  const semNcm = await erpQuery(`
    SELECT DISTINCT pr.id, pr.descricao,
      (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid=pr.id AND em2.codigobarras IS NOT NULL ORDER BY length(em2.codigobarras) DESC LIMIT 1) ean,
      n.codigo ncm
    FROM itemnotafiscal ii JOIN notafiscal nf ON nf.id=ii.notafiscalid
    JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
    LEFT JOIN ncm n ON n.id=pr.ncmid
    WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
      AND (pr.ncmid IS NULL OR n.codigo IS NULL OR length(regexp_replace(COALESCE(n.codigo::text,''),'[^0-9]','','g'))<>8)
    ORDER BY pr.descricao LIMIT ${lim}`, base).catch(() => []);

  // 2) Fornecedores com entrada no mês SEM CNPJ/CPF válido (11 ou 14 dígitos).
  const fornSemDoc = await erpQuery(`
    SELECT DISTINCT p.id, COALESCE(p.razaosocial, p.nome) nome, p.cnpj,
      (SELECT max(nf2.numero) FROM notafiscal nf2 JOIN fornecedor f2 ON f2.id=nf2.fornecedorid WHERE f2.pessoaid=p.id AND nf2.unidadenegocioid=ANY($1::bigint[]) AND nf2.datahoraentrada >= $2::date AND nf2.datahoraentrada < ($3::date + interval '1 day')) nf
    FROM notafiscal nf JOIN fornecedor f ON f.id=nf.fornecedorid JOIN pessoa p ON p.id=f.pessoaid
    WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
      AND (p.cnpj IS NULL OR length(regexp_replace(COALESCE(p.cnpj,''),'[^0-9]','','g')) NOT IN (11,14))
    ORDER BY nome LIMIT ${lim}`, base).catch(() => []);

  // 4) XML EMITIDO pela SEFAZ (NFe autorizada contra o CNPJ) e NÃO LANÇADO no ERP → falta no SPED.
  //    Janela por data de EMISSÃO (é quando a nota pertence à competência fiscal).
  const xmlNaoLancado = await erpQuery(`
    WITH dfe AS (
      SELECT DISTINCT ON (d.chaveacessonfe) d.chaveacessonfe, d.unidadenegocioid uni, d.emitentenome, d.emitentecnpj, d.valortotal,
        to_char(d.datahoraemissao,'YYYY-MM-DD') emissao
      FROM distribuicaodfe d
      WHERE d.unidadenegocioid=ANY($1::bigint[]) AND d.tipoxml IN ('A','B') AND d.situacaonfe='1' AND d.valortotal IS NOT NULL
        AND d.datahoraemissao >= $2::date AND d.datahoraemissao < ($3::date + interval '1 day')
      ORDER BY d.chaveacessonfe, d.tipoxml)
    SELECT dfe.* FROM dfe
    WHERE NOT EXISTS (SELECT 1 FROM notafiscal n WHERE n.chaveacesso=dfe.chaveacessonfe AND n.tipooperacao='1' AND n.status NOT IN ('X','E'))
    ORDER BY dfe.valortotal DESC NULLS LAST LIMIT ${lim}`, base).catch(() => []);

  // 5) Produtos de USO E CONSUMO movimentados (classificação PRINCIPAL > USO E CONSUMO). Não é erro, mas
  //    é o que mais gera correção da contabilidade (CFOP/CST de uso-consumo ≠ revenda) → revisar.
  const usoConsumo = await erpQuery(`
    SELECT DISTINCT pr.id, pr.descricao,
      (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid=pr.id AND em2.codigobarras IS NOT NULL ORDER BY length(em2.codigobarras) DESC LIMIT 1) ean,
      round(SUM(ii.valortotal) OVER (PARTITION BY pr.id)::numeric,2) valor
    FROM itemnotafiscal ii JOIN notafiscal nf ON nf.id=ii.notafiscalid
    JOIN embalagem em ON em.id=ii.embalagemid JOIN produto pr ON pr.id=em.produtoid
    JOIN classificacaoproduto cp ON cp.produtoid=pr.id JOIN classificacao c ON c.id=cp.classificacaoid
    WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
      AND c.caminho LIKE 'PRINCIPAL > USO E CONSUMO%'
    ORDER BY valor DESC NULLS LAST LIMIT ${lim}`, base).catch(() => []);

  // 3) NFs de entrada no mês SEM chave de acesso de 44 dígitos (modelo 55 exige).
  const semChave = await erpQuery(`
    SELECT nf.numero, nf.unidadenegocioid uni, to_char(nf.datahoraentrada,'YYYY-MM-DD') entrada,
      COALESCE(p.razaosocial, p.nome) fornecedor
    FROM notafiscal nf LEFT JOIN fornecedor f ON f.id=nf.fornecedorid LEFT JOIN pessoa p ON p.id=f.pessoaid
    WHERE nf.unidadenegocioid=ANY($1::bigint[]) AND nf.tipooperacao='1' AND nf.status NOT IN ('X','E')
      AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
      AND (nf.chaveacesso IS NULL OR length(regexp_replace(COALESCE(nf.chaveacesso,''),'[^0-9]','','g'))<>44)
    ORDER BY nf.datahoraentrada DESC LIMIT ${lim}`, base).catch(() => []);

  const checks = [
    { chave: 'produto_sem_ncm', titulo: 'Produtos sem NCM', severidade: 'alta', registro: '0200',
      descricao: 'Produto movimentado no mês sem classificação NCM válida (8 dígitos). O SPED rejeita o registro 0200.',
      qtd: semNcm.length, itens: semNcm.map(r => ({ id: Number(r.id), nome: (r.descricao || '').trim(), ean: r.ean || null, ncm: r.ncm || null })) },
    { chave: 'fornecedor_sem_doc', titulo: 'Fornecedores sem CNPJ/CPF', severidade: 'alta', registro: '0150',
      descricao: 'Fornecedor com entrada no mês sem CNPJ/CPF válido. O SPED exige o documento no registro 0150 (participante).',
      qtd: fornSemDoc.length, itens: fornSemDoc.map(r => ({ id: Number(r.id), nome: (r.nome || '').trim(), cnpj: r.cnpj || null, nf: r.nf || null })) },
    { chave: 'xml_nao_lancado', titulo: 'XML emitido e não lançado', severidade: 'alta', registro: 'C100',
      descricao: 'NFe autorizada pela SEFAZ contra o CNPJ, emitida no mês, que NÃO foi lançada no ERP. Se não entrar, falta no SPED (nota omitida).',
      qtd: xmlNaoLancado.length, itens: xmlNaoLancado.map(r => ({ nome: (r.emitentenome || '').trim() || null, cnpj: r.emitentecnpj || null, valor: Math.round((Number(r.valortotal) || 0) * 100) / 100, emissao: r.emissao, loja: nomeLoja(Number(r.uni)), chave: r.chaveacessonfe })) },
    { chave: 'uso_consumo', titulo: 'Produtos de uso/consumo a revisar', severidade: 'media', registro: 'C170', revisar: true,
      descricao: 'Produtos classificados em USO E CONSUMO movimentados no mês. Não é erro, mas é o que mais gera correção da contabilidade (CFOP/CST de uso-consumo difere de revenda) — confira o tratamento fiscal.',
      qtd: usoConsumo.length, itens: usoConsumo.map(r => ({ id: Number(r.id), nome: (r.descricao || '').trim(), ean: r.ean || null, valor: Math.round((Number(r.valor) || 0) * 100) / 100 })) },
    { chave: 'nf_sem_chave', titulo: 'NFs de entrada sem chave de acesso', severidade: 'media', registro: 'C100',
      descricao: 'NFe de entrada sem chave de 44 dígitos. Pode indicar nota manual/avulsa que precisa de atenção no C100.',
      qtd: semChave.length, itens: semChave.map(r => ({ numero: r.numero, loja: nomeLoja(Number(r.uni)), entrada: r.entrada, fornecedor: (r.fornecedor || '').trim() || null })) },
  ];
  const totalProblemas = checks.filter(c => !c.revisar).reduce((a2, c) => a2 + c.qtd, 0);
  const aRevisar = checks.filter(c => c.revisar).reduce((a2, c) => a2 + c.qtd, 0);
  return { erp: true, competencia: `${a}-${String(m).padStart(2, '0')}`, periodo: { ini, fim }, totalProblemas, aRevisar, checks };
}

module.exports = { validarPreSped };
