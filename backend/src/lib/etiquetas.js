// etiquetas.js — dados p/ o gerador de etiquetas de preço (cadernos de oferta, itens, busca) +
// compactação inteligente da descrição do produto (separa quantidade/unidade e abrevia se preciso).
const { erpQuery, habilitado } = require('../db/erp');

// Abreviações comuns p/ caber o nome sem perder o sentido.
const ABREV = [
  [/COMPRIMIDOS?/gi, 'COMP'], [/C[ÁA]PSULAS?/gi, 'CAPS'], [/UNIDADES?/gi, 'UN'],
  [/SOLU[ÇC][ÃA]O/gi, 'SOL'], [/SUSPENS[ÃA]O/gi, 'SUSP'], [/POMADA/gi, 'POM'],
  [/XAROPE/gi, 'XPE'], [/INJET[ÁA]VEL/gi, 'INJ'], [/REVESTIDOS?/gi, 'REV'],
  [/SHAMPOO|XAMPU/gi, 'SHAMPOO'], [/CONDICIONADOR/gi, 'COND'], [/ABSORVENTE/gi, 'ABSORV'],
  [/COM\s+/gi, ''], [/\s+/g, ' '],
];

// Separa a descrição em { nome, unidade } (a quantidade/apresentação vira subtítulo, como nas placas).
function compactarNome(descricao, maxNome = 34) {
  let d = (descricao || '').trim().toUpperCase().replace(/\s+/g, ' ');
  let unidade = '';
  // Quantidade de embalagem no fim: "COM 10 COMPRIMIDOS", "60 UNIDADES", "380G", "10 ML".
  const m = d.match(/\s*(?:COM\s+|C\/\s*)?(\d+[\d.,]*)\s*(UNIDADES?|UNI|COMPRIMIDOS?|COMP|C[ÁA]PSULAS?|CAPS|ML|LT?|KG|G|GOTAS|SACH[ÊE]S?|D[OÓ]SES?)\.?\s*$/i);
  if (m) {
    const unit = m[2].toUpperCase().replace(/^L$/, 'L');
    unidade = `${m[1]} ${unit}`.replace('  ', ' ');
    d = d.slice(0, m.index).trim();
  }
  let nome = d, abreviado = false;
  if (nome.length > maxNome) { let a = nome; for (const [re, r] of ABREV) a = a.replace(re, r); a = a.trim(); if (a.length < nome.length) { nome = a; abreviado = true; } }
  if (nome.length > maxNome) { nome = nome.slice(0, maxNome - 1).trim() + '…'; abreviado = true; }
  return { nome, unidade, abreviado, original: descricao };
}

// Cadernos de oferta ativos (vigentes) do ERP.
async function listarCadernos() {
  if (!habilitado()) return [];
  const rows = await erpQuery(`
    SELECT c.id, c.nome, c.datahorainicial, c.datahorafinal,
      (SELECT count(*) FROM itemcadernooferta i WHERE i.cadernoofertaid=c.id AND i.precooferta>0) itens
    FROM cadernooferta c
    WHERE c.status='A' AND c.datahorafinal >= now() - interval '2 days'
    ORDER BY c.datahorafinal ASC LIMIT 60`);
  return rows.map(r => ({ id: Number(r.id), nome: r.nome, inicio: r.datahorainicial, validade: r.datahorafinal, itens: Number(r.itens) || 0 }));
}

// Itens de um caderno com preço de/por + validade + nome compactado. `uni` = erp_unidadenegocio p/ o "de".
async function itensCaderno(cadernoId, uni) {
  if (!habilitado()) return { itens: [] };
  const cab = (await erpQuery('SELECT nome, datahorainicial, datahorafinal FROM cadernooferta WHERE id=$1', [cadernoId]))[0] || {};
  const rows = await erpQuery(`
    SELECT ic.precooferta por, e.codigobarras ean, pr.descricao,
      COALESCE(pev.precovenda, e.precovenda, e.precoreferencial, 0) de
    FROM itemcadernooferta ic
    JOIN embalagem e ON e.id = ic.embalagemid
    JOIN produto pr ON pr.id = e.produtoid
    LEFT JOIN precoembalagemunidadenegocio pev ON pev.embalagemid = e.id AND pev.unidadenegocioid = $2
    WHERE ic.cadernoofertaid = $1 AND ic.precooferta > 0
    ORDER BY pr.descricao LIMIT 800`, [cadernoId, uni || 0]);
  const itens = rows.map(r => ({
    ...compactarNome(r.descricao), ean: r.ean,
    de: Number(r.de) || 0, por: Number(r.por) || 0,
  }));
  return { caderno: { nome: cab.nome, inicio: cab.datahorainicial, validade: cab.datahorafinal }, itens };
}

// Busca direta de produto por nome ou código de barras (sem caderno).
async function buscarProdutos(q, uni) {
  if (!habilitado() || !q || q.length < 2) return [];
  const termo = `%${q.trim().toLowerCase()}%`;
  const rows = await erpQuery(`
    SELECT e.codigobarras ean, pr.descricao,
      COALESCE(pev.precovenda, e.precovenda, e.precoreferencial, 0) de
    FROM embalagem e JOIN produto pr ON pr.id = e.produtoid
    LEFT JOIN precoembalagemunidadenegocio pev ON pev.embalagemid = e.id AND pev.unidadenegocioid = $2
    WHERE pr.status='A' AND (lower(pr.descricao) LIKE $1 OR e.codigobarras = $3)
    ORDER BY pr.descricao LIMIT 40`, [termo, uni || 0, q.trim()]);
  return rows.map(r => ({ ...compactarNome(r.descricao), ean: r.ean, de: Number(r.de) || 0, por: 0 }));
}

module.exports = { compactarNome, listarCadernos, itensCaderno, buscarProdutos };
