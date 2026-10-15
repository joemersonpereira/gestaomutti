// repasseCartao.js — a trilha do dinheiro, por fora do ERP.
//
// A pergunta aqui é outra: não é "a venda foi registrada certo?" (isso é conciliacaoCartao.js),
// e sim "a credenciadora pagou tudo o que devia, com a taxa combinada, e para qual filial?".
//
// Fonte: o relatório de RECEBIMENTOS da própria credenciadora (Rede: exportar Excel ▸ detalhado).
// Ele traz, no mesmo arquivo, o depósito consolidado E a parcela de cada venda que o formou —
// então dá para conferir em três níveis, sem consultar o ERP em momento nenhum:
//
//   1. o arquivo fecha consigo mesmo?     soma das parcelas  ×  valor depositado
//   2. o que caiu era meu?                parcela paga (NSU) ×  venda que eu conferi (conc_item)
//   3. a taxa foi a combinada?            taxa praticada     ×  conc_taxa_contratada
//
// E o crédito que cai agrupado é aberto por filial pelo número do estabelecimento.
const crypto = require('crypto');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { lojasEmpresa, unisEmpresa } = require('./escopoCompras');
const { lerRepasse } = require('./conciliacaoRepasseParsers');
const { lerUze } = require('./conciliacaoUzeParsers');

const round = n => Math.round((Number(n) || 0) * 100) / 100;
const TOL = 0.02;
const norm = v => String(v == null ? '' : v).trim().replace(/\D/g, '').replace(/^0+/, '');

// ── de-para: nº do estabelecimento na credenciadora → loja ────────────────
// Aprende sozinho: o relatório de VENDAS traz estabelecimento + CNPJ, e o CNPJ identifica a loja.
function estabelecimentos(empresaId) {
  return db.prepare('SELECT * FROM conc_estabelecimento WHERE empresa_id=?').all(empresaId);
}
function salvarEstabelecimento(empresaId, { operadora, estabelecimento, lojaId, uniErp, cnpj }) {
  db.prepare(`INSERT INTO conc_estabelecimento (empresa_id, operadora, estabelecimento, uni_erp, loja_id, cnpj, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, operadora, estabelecimento) DO UPDATE SET
      uni_erp=excluded.uni_erp, loja_id=excluded.loja_id, cnpj=COALESCE(excluded.cnpj, conc_estabelecimento.cnpj),
      atualizado_em=datetime('now')`)
    .run(empresaId, operadora, String(estabelecimento), uniErp || null, lojaId || '', cnpj || null);
  return { ok: true };
}
// chamado no import das VENDAS: aprende estabelecimento → loja sem ninguém cadastrar nada
function aprenderEstabelecimentos(empresaId, operadora, linhas, lojaPorUni) {
  const vistos = new Map();
  for (const l of linhas) if (l.estabelecimento && l.uni) vistos.set(l.estabelecimento, { uni: l.uni, cnpj: l.cnpj });
  for (const [estab, { uni, cnpj }] of vistos) {
    salvarEstabelecimento(empresaId, { operadora, estabelecimento: estab, uniErp: uni, lojaId: lojaPorUni.get(Number(uni)) || '', cnpj });
  }
  return vistos.size;
}

function mapaEstabelecimento(empresaId) {
  const m = new Map();
  for (const e of estabelecimentos(empresaId)) m.set(String(e.estabelecimento), e);
  return m;
}

// ── taxa combinada ─────────────────────────────────────────────────────────
function taxasContratadas(empresaId) {
  return db.prepare('SELECT * FROM conc_taxa_contratada WHERE empresa_id=? ORDER BY operadora, grupo, bandeira').all(empresaId);
}
// loja_id '*' = vale para todas as filiais; bandeira '*' = todas; faixa 0/0 = não se aplica
function salvarTaxa(empresaId, { operadora, lojaId, bandeira, grupo, parcelaIni, parcelaFim, taxa, vigenciaIni, vigenciaFim }) {
  const pi = Number(parcelaIni) || 0, pf = Number(parcelaFim) || pi;
  db.prepare(`INSERT INTO conc_taxa_contratada (empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim, taxa, vigencia_ini, vigencia_fim, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim) DO UPDATE SET
      taxa=excluded.taxa, vigencia_ini=excluded.vigencia_ini, vigencia_fim=excluded.vigencia_fim, atualizado_em=datetime('now')`)
    .run(empresaId, operadora, lojaId || '*', bandeira || '*', grupo, pi, pf, Number(taxa) || 0, vigenciaIni || null, vigenciaFim || null);
  return { ok: true };
}

// ── contrato da negociação (anexo + validade), por operadora (e loja, ou '*' pra todas) ──────
function contratosTaxa(empresaId) {
  return db.prepare(`SELECT empresa_id, operadora, loja_id, nome, tipo_mime, vigencia_ini, vigencia_fim, obs, atualizado_em,
    (dados IS NOT NULL AND dados<>'') AS tem_arquivo FROM conc_taxa_contrato WHERE empresa_id=? ORDER BY operadora, loja_id`).all(empresaId);
}
function salvarContratoTaxa(empresaId, { operadora, lojaId, nome, tipoMime, dados, vigenciaIni, vigenciaFim, obs, usuarioId }) {
  if (!operadora) throw new Error('Operadora é obrigatória.');
  db.prepare(`INSERT INTO conc_taxa_contrato (empresa_id, operadora, loja_id, nome, tipo_mime, dados, vigencia_ini, vigencia_fim, obs, usuario_id, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, operadora, loja_id) DO UPDATE SET
      nome=COALESCE(excluded.nome, conc_taxa_contrato.nome), tipo_mime=COALESCE(excluded.tipo_mime, conc_taxa_contrato.tipo_mime),
      dados=COALESCE(excluded.dados, conc_taxa_contrato.dados), vigencia_ini=excluded.vigencia_ini, vigencia_fim=excluded.vigencia_fim,
      obs=excluded.obs, usuario_id=excluded.usuario_id, atualizado_em=datetime('now')`)
    .run(empresaId, operadora, lojaId || '*', nome || null, tipoMime || null, dados || null, vigenciaIni || null, vigenciaFim || null, obs || null, usuarioId || null);
  return { ok: true };
}
function getContratoTaxa(empresaId, { operadora, lojaId }) {
  return db.prepare('SELECT nome, tipo_mime, dados FROM conc_taxa_contrato WHERE empresa_id=? AND operadora=? AND loja_id=?')
    .get(empresaId, operadora, lojaId || '*');
}
function excluirContratoTaxa(empresaId, { operadora, lojaId }) {
  db.prepare('DELETE FROM conc_taxa_contrato WHERE empresa_id=? AND operadora=? AND loja_id=?').run(empresaId, operadora, lojaId || '*');
  return { ok: true };
}
function excluirTaxa(empresaId, { operadora, lojaId, bandeira, grupo, parcelaIni, parcelaFim }) {
  const pi = Number(parcelaIni) || 0, pf = Number(parcelaFim) || pi;
  db.prepare('DELETE FROM conc_taxa_contratada WHERE empresa_id=? AND operadora=? AND loja_id=? AND bandeira=? AND grupo=? AND parcela_ini=? AND parcela_fim=?')
    .run(empresaId, operadora, lojaId || '*', bandeira || '*', grupo, pi, pf);
  return { ok: true };
}
// Copia a tabela de taxas de uma filial para outras — cada CNPJ tem seu credenciamento, mas
// na prática a negociação costuma ser igual em várias lojas.
function replicarTaxas(empresaId, { operadora, deLojaId, paraLojas = [], substituir = true }) {
  const origem = db.prepare('SELECT * FROM conc_taxa_contratada WHERE empresa_id=? AND operadora=? AND loja_id=?')
    .all(empresaId, operadora, deLojaId || '*');
  if (!origem.length) return { ok: false, erro: 'A filial de origem não tem taxa cadastrada.' };
  const tx = db.transaction(() => {
    for (const loja of paraLojas) {
      if (loja === deLojaId) continue;
      if (substituir) db.prepare('DELETE FROM conc_taxa_contratada WHERE empresa_id=? AND operadora=? AND loja_id=?').run(empresaId, operadora, loja);
      for (const t of origem) {
        salvarTaxa(empresaId, { operadora, lojaId: loja, bandeira: t.bandeira, grupo: t.grupo,
          parcelaIni: t.parcela_ini, parcelaFim: t.parcela_fim, taxa: t.taxa, vigenciaIni: t.vigencia_ini });
      }
    }
  });
  tx();
  return { ok: true, copiadas: origem.length, lojas: paraLojas.length };
}
// A mais específica ganha: filial > todas · bandeira > todas · faixa que contém o parcelamento.
function taxaEsperada(taxas, { operadora, lojaId, bandeira, grupo, parcelas }) {
  const n = Number(parcelas) || 0;
  const cands = taxas.filter(t => t.operadora === operadora && t.grupo === grupo
    && (t.loja_id === '*' || t.loja_id === lojaId)
    && (t.bandeira === '*' || t.bandeira.toLowerCase() === String(bandeira || '').toLowerCase())
    && ((!t.parcela_ini && !t.parcela_fim) || (n >= t.parcela_ini && n <= t.parcela_fim)));
  if (!cands.length) return null;
  const peso = t => (t.loja_id !== '*' ? 4 : 0) + (t.bandeira !== '*' ? 2 : 0) + (t.parcela_ini ? 1 : 0);
  return cands.sort((a, b) => peso(b) - peso(a))[0];
}

// ── credenciadoras × bandeiras ────────────────────────────────────────────
// Numa credenciadora multibandeira (Rede, Cielo…) a taxa é negociada por bandeira. Já Brasil Card,
// Banese, Bracov, Alelo, Le Card e Multi Mais são emissor e bandeira ao mesmo tempo — ali existe
// uma taxa só, e pedir "Visa/Mastercard" na tela não faz sentido.
const MULTIBANDEIRA = ['Rede', 'Cielo', 'GetNet', 'Stone', 'Bin', 'PagSeguro', 'Sipag'];
const BANDEIRAS_PADRAO = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Diners'];
const PROPRIAS = ['Brasil Card', 'Banese / Mulvi', 'Bracov', 'Alelo', 'Le Card', 'Nutricash',
  'Multi Mais / Uze', 'Iqnus', 'Sodexo', 'Ticket', 'VR'];
const soLetras = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
// "Le Card" e "Lecard" viram a mesma chave; "Banese / Mulvi" entra pelos dois nomes
const PROPRIAS_CHAVE = new Set(PROPRIAS.flatMap(p => p.split('/').map(soLetras)).filter(Boolean));

function credenciadoras(empresaId) {
  // o que já apareceu nos arquivos importados (vendas e repasses)
  const vistas = db.prepare(`
    SELECT operadora, bandeira FROM conc_item WHERE empresa_id=? AND IFNULL(bandeira,'')<>''
    UNION SELECT operadora, bandeira FROM conc_repasse_parcela WHERE empresa_id=? AND IFNULL(bandeira,'')<>''`)
    .all(empresaId, empresaId);
  const porOperadora = new Map();
  for (const v of vistas) {
    if (!porOperadora.has(v.operadora)) porOperadora.set(v.operadora, new Set());
    porOperadora.get(v.operadora).add(v.bandeira.trim());
  }
  const nomes = [...new Set([...MULTIBANDEIRA, ...PROPRIAS, ...porOperadora.keys()])];
  return nomes.map(nome => {
    const propria = !MULTIBANDEIRA.includes(nome);
    const vistasDela = [...(porOperadora.get(nome) || [])];
    return {
      nome, propria,
      // na própria, a "bandeira" é ela mesma → uma linha só, gravada como '*'
      // vale capturado pela maquininha não entra: quem paga (e cobra taxa) é o emissor.
      // A comparação é por nome inteiro — "Alelo" contém "elo" e cortaria a bandeira Elo.
      bandeiras: propria ? [] : [...new Set([...BANDEIRAS_PADRAO, ...vistasDela])]
        .filter(b => !PROPRIAS_CHAVE.has(soLetras(b))),
    };
  }).sort((a, b) => (a.propria === b.propria ? a.nome.localeCompare(b.nome) : a.propria ? 1 : -1));
}

// ── taxas cadastradas no ERP (ponte opcional) ─────────────────────────────
// O ERP tem duas tabelas para isso (taxacontratadacartao e taxamodalidadecartao). Neste banco as
// duas estão VAZIAS — e o campo `taxa` do título não serve de referência, porque é o valor que a
// própria credenciadora informou no arquivo (comparar com ele seria comparar a operadora com ela
// mesma). Então o cadastro do sistema continua sendo a referência; esta função existe para o dia
// em que alguém preencher o ERP: aí dá para puxar de lá e conferir também contra ele.
async function taxasDoErp(empresaId) {
  const { erpQuery, habilitado } = require('../db/erp');
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const lojas = lojasEmpresa(empresaId);
  const lojaPorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.id]));
  const unis = [...lojaPorUni.keys()];
  if (!unis.length) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };

  const [contratadas, porModalidade] = await Promise.all([
    erpQuery(`SELECT t.unidadenegocioid uni, t.bandeira, t.parcelamentomaximo, t.taxacontratada::float8 taxa,
              to_char(t.vigenciadatainicial,'YYYY-MM-DD') vigencia,
              COALESCE(co.nome,'Rede') operadora, ta.codigoagrupamentobaixa agrupamento
         FROM taxacontratadacartao t
         LEFT JOIN conciliacaocartaooperadora co ON co.id = t.conciliacaocartaooperadoraid
         LEFT JOIN conciliacaocartaotipoautorizacao ta ON ta.id = t.conciliacaocartaotipoautorizacaoid
        WHERE t.unidadenegocioid = ANY($1::bigint[])`, [unis]),
    erpQuery(`SELECT t.unidadenegocioid uni, t.modalidadecartaoid mod_id, mc.nome modalidade, t.taxa::float8 taxa
         FROM taxamodalidadecartao t
         LEFT JOIN modalidadecartao mc ON mc.id = t.modalidadecartaoid
        WHERE t.unidadenegocioid = ANY($1::bigint[])`, [unis]),
  ]);

  const grupoDoAgrupamento = a => {
    const s = String(a || '');
    if (/D.bito/.test(s)) return 'DEBITO';
    if (/Cr.dito/.test(s)) return 'CREDITO';
    if (/Voucher/.test(s)) return 'VOUCHER';
    if (/Pix/i.test(s)) return 'PIX';
    return 'OUTRO';
  };
  const gruposApp = new Map(db.prepare('SELECT modalidade_id, grupo FROM conc_modalidade_grupo WHERE empresa_id=?')
    .all(empresaId).map(r => [String(r.modalidade_id), r.grupo]));

  const achadas = [
    ...contratadas.map(t => {
      const max = Number(t.parcelamentomaximo) || 0;
      const grupo = max > 1 ? 'PARCELADO' : grupoDoAgrupamento(t.agrupamento);
      return { operadora: (t.operadora || 'Rede').trim(), lojaId: lojaPorUni.get(Number(t.uni)) || '*',
        bandeira: (t.bandeira || '*').trim() || '*', grupo,
        parcelaIni: max > 1 ? 2 : 0, parcelaFim: max > 1 ? max : 0,
        taxa: Number(t.taxa) || 0, vigenciaIni: t.vigencia, fonte: 'taxacontratadacartao' };
    }),
    ...porModalidade.map(t => ({ operadora: 'Rede', lojaId: lojaPorUni.get(Number(t.uni)) || '*', bandeira: '*',
      grupo: gruposApp.get(String(t.mod_id)) || 'OUTRO', parcelaIni: 0, parcelaFim: 0,
      taxa: Number(t.taxa) || 0, vigenciaIni: null, fonte: 'taxamodalidadecartao', modalidade: t.modalidade })),
  ].filter(t => t.taxa > 0);

  return { ok: true, achadas, total: achadas.length };
}

// puxa as taxas do ERP para o cadastro do sistema (só faz sentido quando o ERP tiver algo lá)
async function importarTaxasDoErp(empresaId) {
  const r = await taxasDoErp(empresaId);
  if (!r.ok) return r;
  if (!r.achadas.length) {
    return { ok: false, erro: 'O ERP não tem nenhuma taxa cadastrada (as tabelas taxacontratadacartao e taxamodalidadecartao estão vazias). Cadastre aqui na tela — é essa a referência que o sistema usa para apontar cobrança a mais.' };
  }
  const tx = db.transaction(() => r.achadas.forEach(t => salvarTaxa(empresaId, t)));
  tx();
  return { ok: true, importadas: r.achadas.length };
}

// ── importar o relatório de recebimentos ──────────────────────────────────
async function importar(empresaId, { conteudoBase64, nomeArquivo, usuarioId, lojaId }) {
  const buf = Buffer.from(String(conteudoBase64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) return { ok: false, erro: 'Arquivo vazio.' };
  // o Uze só exporta PDF; os demais vêm em planilha
  const lido = buf.slice(0, 4).toString() === '%PDF'
    ? await lerUze(buf, { nomeArquivo })
    : lerRepasse(buf, { nomeArquivo });
  if (!lido.ok) return lido;

  const lojas = lojasEmpresa(empresaId);
  const lojaPorUni = new Map(lojas.map(l => [Number(l.erp_unidadenegocio_id), l.id]));

  // Alguns relatórios (Alelo) trazem o CNPJ junto da transação — é o caminho mais direto para a
  // filial. Aprende o de-para do estabelecimento a partir dele, sem ninguém cadastrar nada.
  const cnpjs = [...new Set(lido.parcelas.map(p => p.cnpj).filter(Boolean))];
  if (cnpjs.length) {
    try {
      const { erpQuery, habilitado } = require('../db/erp');
      if (habilitado()) {
        const unis = await erpQuery('SELECT id, cnpj FROM unidadenegocio WHERE cnpj = ANY($1::text[])', [cnpjs]);
        const uniPorCnpj = new Map(unis.map(u => [String(u.cnpj), Number(u.id)]));
        const vistos = new Map();
        for (const p of lido.parcelas) if (p.cnpj && p.estabelecimento) vistos.set(p.estabelecimento, p.cnpj);
        for (const [estab, cnpj] of vistos) {
          const uni = uniPorCnpj.get(cnpj);
          if (uni) salvarEstabelecimento(empresaId, { operadora: lido.operadora, estabelecimento: estab,
            uniErp: uni, lojaId: lojaPorUni.get(uni) || '', cnpj });
        }
      }
    } catch (e) { /* o de-para por CNPJ é um bônus; não pode derrubar a importação */ }
  }

  const estabs = mapaEstabelecimento(empresaId);
  // A Mulvi (e a Nutricash e o Le Card) filtram a loja no proprio portal e nao repetem o CNPJ
  // dentro do arquivo. Nesses casos a loja vem escolhida no upload e vale para o arquivo inteiro.
  const escolhida = lojaId ? lojas.find(l => l.id === lojaId) : null;
  const resolveLoja = estab => {
    const e = estabs.get(String(estab));
    if (e) return { uni: e.uni_erp, lojaId: e.loja_id };
    if (escolhida) return { uni: Number(escolhida.erp_unidadenegocio_id), lojaId: escolhida.id };
    return { uni: null, lojaId: '' };
  };

  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const datas = [...lido.depositos.map(d => d.data), ...lido.parcelas.map(p => p.dataRecebimento)].filter(Boolean).sort();
  const valorTotal = round(lido.depositos.reduce((s, d) => s + d.valor, 0));
  const jaTem = db.prepare('SELECT id FROM conc_repasse_arquivo WHERE empresa_id=? AND hash=?').get(empresaId, hash);

  let arquivoId;
  const tx = db.transaction(() => {
    if (jaTem) {
      arquivoId = jaTem.id;
      db.prepare('DELETE FROM conc_repasse_parcela WHERE arquivo_id=?').run(arquivoId);
      db.prepare('DELETE FROM conc_repasse WHERE arquivo_id=?').run(arquivoId);
      db.prepare('DELETE FROM conc_repasse_ajuste WHERE arquivo_id=?').run(arquivoId);
      db.prepare(`UPDATE conc_repasse_arquivo SET linhas=?, valor_total=?, importado_em=datetime('now') WHERE id=?`)
        .run(lido.parcelas.length, valorTotal, arquivoId);
    } else {
      arquivoId = db.prepare(`INSERT INTO conc_repasse_arquivo (empresa_id, operadora, layout, nome_arquivo, hash, data_ini, data_fim, linhas, valor_total, usuario_id, importado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
        .run(empresaId, lido.operadora, lido.layout, nomeArquivo || '', hash, datas[0], datas[datas.length - 1],
          lido.parcelas.length, valorTotal, String(usuarioId || '')).lastInsertRowid;
    }

    const insDep = db.prepare(`INSERT INTO conc_repasse (arquivo_id, empresa_id, operadora, data, estabelecimento, uni_erp, loja_id,
      banco, agencia, conta, bandeira, modalidade, grupo, valor, valor_bruto, taxa, status, tipo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const idDeposito = new Map();
    for (const d of lido.depositos) {
      const { uni, lojaId } = resolveLoja(d.estabelecimento);
      const id = insDep.run(arquivoId, empresaId, lido.operadora, d.data, d.estabelecimento, uni, lojaId,
        d.banco || '', '', '', d.bandeira, d.modalidade, d.grupo, round(d.valor), 0, 0, d.status, 'recebido').lastInsertRowid;
      idDeposito.set([d.data, d.estabelecimento, d.bandeira, d.grupo].join('|'), id);
    }
    // a agenda (o que ainda vai cair) entra na mesma tabela, marcada como a_receber
    const futAgrup = new Map();
    for (const f of lido.futuros) {
      const k = [f.dataPrevista, f.estabelecimento, f.bandeira, f.grupo].join('|');
      const a = futAgrup.get(k) || { ...f, valor: 0, bruto: 0 };
      a.valor = round(a.valor + f.valorLiquido); a.bruto = round(a.bruto + f.valorBruto);
      futAgrup.set(k, a);
    }
    for (const [, f] of futAgrup) {
      const { uni, lojaId } = resolveLoja(f.estabelecimento);
      insDep.run(arquivoId, empresaId, lido.operadora, f.dataPrevista, f.estabelecimento, uni, lojaId,
        '', '', '', f.bandeira, f.modalidade, f.grupo, f.valor, f.bruto, f.taxa, f.status || 'A RECEBER', 'a_receber');
    }

    const insParc = db.prepare(`INSERT INTO conc_repasse_parcela (arquivo_id, repasse_id, empresa_id, operadora,
      data_recebimento, data_venda, data_vencimento, nsu, autorizacao, lote, estabelecimento, uni_erp, loja_id,
      bandeira, modalidade, grupo, parcelas, parcela, valor_bruto, taxa, valor_taxa, valor_liquido, status, item_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // casa cada parcela com a venda que eu já tinha conferido (pelo NSU, dentro da mesma loja)
    const vendas = db.prepare('SELECT id, nsu, autorizacao, uni_erp, valor, data FROM conc_item WHERE empresa_id=?').all(empresaId);
    const porNsu = new Map();
    for (const v of vendas) { const k = v.uni_erp + '|' + norm(v.nsu); if (norm(v.nsu) && !porNsu.has(k)) porNsu.set(k, v); }
    const porAut = new Map();
    for (const v of vendas) { const k = v.uni_erp + '|' + norm(v.autorizacao); if (norm(v.autorizacao) && !porAut.has(k)) porAut.set(k, v); }

    for (const p of lido.parcelas) {
      const { uni, lojaId } = resolveLoja(p.estabelecimento);
      const grupoDep = p.grupo === 'PARCELADO' ? 'CREDITO' : p.grupo;
      const repId = idDeposito.get([p.dataRecebimento, p.estabelecimento, p.bandeira, grupoDep].join('|')) || null;
      const venda = (uni && (porNsu.get(uni + '|' + norm(p.nsu)) || porAut.get(uni + '|' + norm(p.autorizacao)))) || null;
      insParc.run(arquivoId, repId, empresaId, lido.operadora, p.dataRecebimento, p.dataVenda, p.dataVencimento,
        p.nsu, p.autorizacao, p.lote, p.estabelecimento, uni, lojaId, p.bandeira, p.modalidade, p.grupo,
        p.parcelas, p.parcela, round(p.valorBruto), p.taxa, round(p.valorTaxa), round(p.valorLiquido),
        p.status, venda ? venda.id : null);
    }

    const insAj = db.prepare(`INSERT INTO conc_repasse_ajuste (arquivo_id, empresa_id, operadora, tipo, data, data_venda,
      nsu, estabelecimento, uni_erp, loja_id, bandeira, motivo, descricao, valor, credito, pendente)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const a of lido.ajustes) {
      const { uni, lojaId } = resolveLoja(a.estabelecimento);
      insAj.run(arquivoId, empresaId, lido.operadora, a.tipo, a.data || null, a.dataVenda || null, a.nsu || '',
        a.estabelecimento || '', uni, lojaId, a.bandeira || '', a.motivo || '', a.descricao || '',
        round(a.valor), round(a.credito), round(a.pendente));
    }
  });
  tx();

  const avisos = [...(lido.avisos || [])];
  if (jaTem) avisos.push('Esse relatório já tinha sido importado — reprocessei por cima (sem duplicar).');
  const semLoja = db.prepare(`SELECT DISTINCT estabelecimento FROM conc_repasse WHERE arquivo_id=? AND (loja_id IS NULL OR loja_id='')`).all(arquivoId);
  if (semLoja.length) avisos.push(`Estabelecimento(s) sem loja definida: ${semLoja.map(s => s.estabelecimento).join(', ')} — suba um relatório de VENDAS dessa loja (ele traz o CNPJ) ou defina em Ajustes.`);

  // já tenta bater com o extrato bancário do ERP — poupa o clique manual de "conferir" quando dá
  // pra confirmar sozinho. Não falha a importação se o ERP estiver fora do ar.
  const auto = await autoConferirLotes(empresaId, { ini: datas[0], fim: datas[datas.length - 1] }).catch(() => ({ ok: false }));
  if (auto.ok && auto.conferidos) avisos.push(`${auto.conferidos} dia(s)-loja conferido(s) automaticamente pelo extrato bancário do ERP.`);

  const conf = conferir(empresaId, { ini: datas[0], fim: datas[datas.length - 1] });
  return { ok: true, arquivoId, operadora: lido.operadora, periodo: { ini: datas[0], fim: datas[datas.length - 1] },
    qtdDepositos: lido.depositos.length, qtdParcelas: lido.parcelas.length, qtdFuturos: lido.futuros.length,
    qtdAjustes: lido.ajustes.length, valorTotal, ...conf, avisos: [...avisos, ...(conf.avisos || [])] };
}

// ── conferência do período ────────────────────────────────────────────────
function conferir(empresaId, { ini, fim, lojaId } = {}) {
  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = id => (lojas.find(l => l.id === id) || {}).nome || null;
  const filtroLoja = lojaId ? ' AND r.loja_id = @loja' : '';
  const p = { emp: empresaId, ini, fim, loja: lojaId || '' };

  const depositos = db.prepare(`SELECT r.* FROM conc_repasse r
     WHERE r.empresa_id=@emp AND r.tipo='recebido' AND r.data BETWEEN @ini AND @fim ${filtroLoja}
     ORDER BY r.data, r.estabelecimento, r.bandeira`).all(p);
  const parcelas = db.prepare(`SELECT r.* FROM conc_repasse_parcela r
     WHERE r.empresa_id=@emp AND r.data_recebimento BETWEEN @ini AND @fim ${filtroLoja}`).all(p);
  const aReceber = db.prepare(`SELECT r.* FROM conc_repasse r
     WHERE r.empresa_id=@emp AND r.tipo='a_receber' AND r.data BETWEEN @ini AND @fim ${filtroLoja}`).all(p);
  const ajustes = db.prepare(`SELECT r.* FROM conc_repasse_ajuste r
     WHERE r.empresa_id=@emp AND (r.data IS NULL OR r.data BETWEEN @ini AND @fim) ${filtroLoja}`).all(p);

  if (!depositos.length && !parcelas.length) return { ok: true, vazio: true, resumo: resumoVazio(), depositos: [], divergencias: [] };

  // Só é justo dizer "pagaram uma venda que não é minha" quando eu TENHO o relatório de vendas
  // daquele dia. O repasse de hoje paga débito de ontem e parcela de venda de meses atrás — sem o
  // dia importado, a parcela fica como "dia não conferido", não como divergência.
  const diasComVenda = new Set(db.prepare('SELECT DISTINCT uni_erp || \'|\' || data k FROM conc_item WHERE empresa_id=?')
    .all(empresaId).map(r => r.k));
  const coberta = pa => pa.uni_erp && pa.data_venda && diasComVenda.has(pa.uni_erp + '|' + pa.data_venda);

  // 1) o arquivo fecha consigo mesmo? depósito × soma das parcelas que ele diz conter
  const somaPorDep = new Map();
  for (const pa of parcelas) {
    if (!pa.repasse_id) continue;
    somaPorDep.set(pa.repasse_id, round((somaPorDep.get(pa.repasse_id) || 0) + pa.valor_liquido));
  }
  const taxas = taxasContratadas(empresaId);
  const conferencias = mapaConferencia(empresaId);

  // A credenciadora desconta ajustes DO PRÓPRIO depósito (aluguel de maquininha, cancelamento,
  // chargeback). Sem abater isso, o depósito parece "não fechar" com as parcelas — e fecha.
  // O aluguel da maquininha vem SEM bandeira, e o mesmo cancelamento aparece em duas abas do
  // arquivo — por isso o desconto é somado por (dia + estabelecimento), com deduplicação.
  const ajustePorDia = new Map();
  const vistos = new Set();
  for (const a of ajustes) {
    if (!a.data || !a.estabelecimento) continue;
    if (a.tipo !== 'ajuste') continue;   // cancelamento/cobrança em aberto já vêm refletidos nas parcelas
    const id = [a.data, a.estabelecimento, round(a.valor)].join('|');
    if (vistos.has(id)) continue;                       // mesmo evento repetido em outra aba
    vistos.add(id);
    const k = a.data + '|' + a.estabelecimento;
    const at = ajustePorDia.get(k) || { debito: 0, credito: 0, motivos: new Set() };
    at.debito = round(at.debito + (a.valor || 0));
    at.credito = round(at.credito + (a.credito || 0));
    if (a.valor || a.credito) at.motivos.add(a.motivo || a.descricao || 'ajuste');
    ajustePorDia.set(k, at);
  }

  const lista = depositos.map(d => {
    const soma = somaPorDep.get(d.id) || 0;
    const dif = round(d.valor - soma);   // por depósito; o veredito de verdade é por dia+loja
    const doDeposito = parcelas.filter(x => x.repasse_id === d.id);
    const semVenda = doDeposito.filter(x => !x.item_id && coberta(x));      // pagou algo que não é meu
    const naoConferido = doDeposito.filter(x => !x.item_id && !coberta(x)); // falta subir o dia da venda
    return {
      id: d.id, data: d.data, estabelecimento: d.estabelecimento, loja: nomeLoja(d.loja_id) || ('estab. ' + d.estabelecimento),
      lojaId: d.loja_id, banco: d.banco, bandeira: d.bandeira, modalidade: d.modalidade, grupo: d.grupo,
      valor: d.valor, status: d.status,
      parcelas: doDeposito.length, somaParcelas: soma, diferenca: dif, fecha: Math.abs(dif) <= TOL,
      bruto: round(doDeposito.reduce((s, x) => s + x.valor_bruto, 0)),
      taxaTotal: round(doDeposito.reduce((s, x) => s + x.valor_taxa, 0)),
      semVenda: semVenda.length, valorSemVenda: round(semVenda.reduce((s, x) => s + x.valor_liquido, 0)),
      naoConferido: naoConferido.length, valorNaoConferido: round(naoConferido.reduce((s, x) => s + x.valor_liquido, 0)),
      conciliadas: doDeposito.filter(x => x.item_id).length,
      conferencia: conferencias.get('dep:' + d.id) || null,
    };
  });

  // 2) taxa praticada × combinada
  const porTaxa = new Map();
  for (const pa of parcelas) {
    // a taxa é negociada por filial: a comparação também tem que ser por filial
    const k = [pa.loja_id, pa.operadora, pa.bandeira, pa.grupo, pa.parcelas > 1 ? pa.parcelas : 0].join('|');
    const a = porTaxa.get(k) || { operadora: pa.operadora, bandeira: pa.bandeira, grupo: pa.grupo,
      lojaId: pa.loja_id, loja: nomeLoja(pa.loja_id) || ('estab. ' + pa.estabelecimento),
      parcelas: pa.parcelas > 1 ? pa.parcelas : 0, n: 0, bruto: 0, taxaPaga: 0, taxas: new Set() };
    a.n++; a.bruto = round(a.bruto + pa.valor_bruto); a.taxaPaga = round(a.taxaPaga + pa.valor_taxa);
    a.taxas.add(pa.taxa);
    porTaxa.set(k, a);
  }
  const taxaComparada = [...porTaxa.values()].map(t => {
    const esperada = taxaEsperada(taxas, t);
    const efetiva = t.bruto ? round(100 * t.taxaPaga / t.bruto) : 0;
    const dif = esperada ? round(efetiva - esperada.taxa) : null;
    return { ...t, taxas: [...t.taxas].sort((a, b) => a - b), efetiva,
      contratada: esperada ? esperada.taxa : null,
      diferencaPontos: dif, custoExtra: dif != null ? round(t.bruto * dif / 100) : null };
  }).sort((a, b) => (b.custoExtra || 0) - (a.custoExtra || 0));

  // 3) rateio por filial e por dia
  const agrupa = (linhas, chaveFn, valorFn) => {
    const m = new Map();
    for (const x of linhas) {
      const k = chaveFn(x) || '—';
      const a = m.get(k) || { nome: k, n: 0, valor: 0 };
      a.n++; a.valor = round(a.valor + valorFn(x)); m.set(k, a);
    }
    return [...m.values()].sort((x, y) => y.valor - x.valor);
  };
  // ── Fechamento por DIA + FILIAL (é assim que o dinheiro cai e é assim que o Financeiro confere)
  //    esperado = soma das parcelas − descontos do dia (aluguel, cancelamento) + créditos
  const porDiaLoja = new Map();
  for (const d of lista) {
    const k = d.data + '|' + d.estabelecimento;
    const a = porDiaLoja.get(k) || { data: d.data, estabelecimento: d.estabelecimento, loja: d.loja,
      lojaId: d.lojaId, depositado: 0, parcelas: 0, qtdDepositos: 0 };
    a.depositado = round(a.depositado + d.valor);
    a.parcelas = round(a.parcelas + d.somaParcelas);
    a.qtdDepositos++;
    porDiaLoja.set(k, a);
  }
  const dias = [...porDiaLoja.entries()].map(([k, a]) => {
    const aj = ajustePorDia.get(k) || { debito: 0, credito: 0, motivos: new Set() };
    const esperado = round(a.parcelas - aj.debito + aj.credito);
    const dif = round(a.depositado - esperado);
    return { ...a, descontos: aj.debito, creditos: aj.credito, motivoDesconto: [...aj.motivos].join(', '),
      esperado, diferenca: dif, fecha: Math.abs(dif) <= TOL,
      conferencia: conferencias.get('dia-loja:' + k) || null };
  }).sort((x, y) => String(x.data).localeCompare(String(y.data)) || x.loja.localeCompare(y.loja));

  const diasNaoFecham = dias.filter(x => !x.fecha);
  const naoFecham = diasNaoFecham;
  const semVendaTotal = round(lista.reduce((s, d) => s + d.valorSemVenda, 0));

  return {
    ok: true, periodo: { ini, fim },
    depositos: lista, dias,
    resumo: {
      depositos: lista.length, recebido: round(lista.reduce((s, d) => s + d.valor, 0)),
      bruto: round(lista.reduce((s, d) => s + d.bruto, 0)),
      taxaTotal: round(lista.reduce((s, d) => s + d.taxaTotal, 0)),
      parcelasPagas: parcelas.length,
      parcelasConciliadas: parcelas.filter(x => x.item_id).length,
      parcelasSemVenda: lista.reduce((s, d) => s + d.semVenda, 0), valorSemVenda: semVendaTotal,
      parcelasNaoConferidas: lista.reduce((s, d) => s + d.naoConferido, 0),
      valorNaoConferido: round(lista.reduce((s, d) => s + d.valorNaoConferido, 0)),
      naoFecham: diasNaoFecham.length, valorNaoFecha: round(diasNaoFecham.reduce((s, d) => s + Math.abs(d.diferenca), 0)),
      descontosTotal: round(dias.reduce((s, d) => s + d.descontos, 0)),
      creditosTotal: round(dias.reduce((s, d) => s + d.creditos, 0)),
      aReceber: round(aReceber.reduce((s, x) => s + x.valor, 0)),
      ajustes: ajustes.length, valorAjustes: round(ajustes.reduce((s, x) => s + x.valor, 0)),
      porLoja: agrupa(lista, d => d.loja, d => d.valor),
      porDia: agrupa(lista, d => d.data, d => d.valor).sort((a, b) => String(a.nome).localeCompare(String(b.nome))),
      porBandeira: agrupa(lista, d => d.bandeira + ' ' + d.modalidade, d => d.valor),
      taxas: taxaComparada,
      custoExtraTotal: round(taxaComparada.reduce((s, t) => s + (t.custoExtra > 0 ? t.custoExtra : 0), 0)),
    },
    aReceber: agrupa(aReceber, x => x.data, x => x.valor).sort((a, b) => String(a.nome).localeCompare(String(b.nome))),
    ajustes: ajustes.map(a => ({ ...a, loja: nomeLoja(a.loja_id) || (a.estabelecimento ? 'estab. ' + a.estabelecimento : '—'),
      conferencia: conferencias.get('ajuste:' + a.id) || null })),
  };
}

function resumoVazio() {
  return { depositos: 0, recebido: 0, bruto: 0, taxaTotal: 0, parcelasPagas: 0, parcelasSemVenda: 0,
    valorSemVenda: 0, naoFecham: 0, valorNaoFecha: 0, aReceber: 0, ajustes: 0, valorAjustes: 0,
    porLoja: [], porDia: [], porBandeira: [], taxas: [], custoExtraTotal: 0 };
}

// ── Vencimento: o ERP está com a data que a credenciadora vai pagar? ───────
// A credenciadora informa, por parcela, a "data original de vencimento". Se o título do ERP tiver
// outra data, no dia do repasse o Financeiro filtra por vencimento e o valor não fecha — mesmo
// estando tudo certo no dinheiro. Aqui a comparação é feita título a título.
async function conferirVencimentos(empresaId, { ini, fim, lojaId, apenasDivergentes = true } = {}) {
  const { erpQuery, habilitado } = require('../db/erp');
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const filtroLoja = lojaId ? ' AND loja_id = @loja' : '';
  const parcelas = db.prepare(`SELECT * FROM conc_repasse_parcela
     WHERE empresa_id=@emp AND data_recebimento BETWEEN @ini AND @fim ${filtroLoja}`)
    .all({ emp: empresaId, ini, fim, loja: lojaId || '' });
  if (!parcelas.length) return { ok: true, vazio: true, resumo: { titulos: 0, divergentes: 0 }, linhas: [] };

  // busca no ERP os títulos correspondentes (mesma loja, mesmo NSU)
  const unis = [...new Set(parcelas.map(p => Number(p.uni_erp)).filter(Boolean))];
  const nsus = [...new Set(parcelas.map(p => String(p.nsu || '').trim()).filter(Boolean))];
  const titulos = nsus.length && unis.length ? await erpQuery(`
    SELECT cr.id, cr.unidadenegocioid uni, cr.numerotransacao nsu, cr.numeroparcela parcela,
           cr.totalparcela, cr.valor::float8 valor,
           to_char(cr.datavencimento, 'YYYY-MM-DD') vencimento,
           to_char(cr.dataemissao, 'YYYY-MM-DD') emissao,
           cr.statusconciliacao, cr.conferido, mc.nome modalidade
      FROM cartaoreceber cr
      LEFT JOIN modalidadecartao mc ON mc.id = cr.modalidadecartaoid
     WHERE cr.unidadenegocioid = ANY($1::bigint[]) AND cr.numerotransacao = ANY($2::text[])
       AND NOT EXISTS (SELECT 1 FROM correcaocartaoreceberincorreto ci WHERE ci.cartaoreceberid = cr.id)`,
    [unis, nsus]) : [];

  const mapa = new Map();
  for (const t of titulos) mapa.set(t.uni + '|' + norm(t.nsu) + '|' + t.parcela, t);

  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = id => (lojas.find(l => l.id === id) || {}).nome || null;
  const dias = (a, b) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(b + 'T12:00:00')) / 864e5);

  const linhas = [];
  let iguais = 0, semTitulo = 0;
  for (const p of parcelas) {
    if (!p.data_vencimento) continue;
    const t = mapa.get(p.uni_erp + '|' + norm(p.nsu) + '|' + p.parcela);
    if (!t) { semTitulo++; continue; }
    const dif = t.vencimento ? dias(t.vencimento, p.data_vencimento) : null;
    if (dif === 0) { iguais++; if (apenasDivergentes) continue; }
    linhas.push({
      ref: 'VENCIMENTO|erp:' + t.id,
      loja: nomeLoja(p.loja_id) || ('estab. ' + p.estabelecimento), lojaId: p.loja_id,
      nsu: p.nsu, parcela: p.parcela, totalParcela: p.parcelas,
      bandeira: p.bandeira, modalidade: p.modalidade, modalidadeErp: t.modalidade,
      dataVenda: p.data_venda, valor: p.valor_bruto, valorErp: t.valor,
      vencimentoOperadora: p.data_vencimento, vencimentoErp: t.vencimento,
      pagoEm: p.data_recebimento, diferencaDias: dif, crId: t.id,
      statusConc: t.statusconciliacao,
      detalhe: dif == null ? 'O título do ERP está sem data de vencimento.'
        : `ERP vence ${t.vencimento} e a credenciadora paga em ${p.data_vencimento} (${dif > 0 ? dif + ' dia(s) depois' : Math.abs(dif) + ' dia(s) antes'}).`,
    });
  }
  linhas.sort((a, b) => Math.abs(b.diferencaDias || 0) - Math.abs(a.diferencaDias || 0) || b.valor - a.valor);

  // fechamento do dia: é o teste prático — filtrar o ERP por vencimento e bater com o repasse
  const porDia = new Map();
  for (const p of parcelas) {
    const k = p.data_recebimento;
    const a = porDia.get(k) || { data: k, pago: 0, parcelas: 0, vencimentoBate: 0, vencimentoErrado: 0 };
    a.pago = round(a.pago + p.valor_liquido); a.parcelas++;
    const t = mapa.get(p.uni_erp + '|' + norm(p.nsu) + '|' + p.parcela);
    if (t && t.vencimento === p.data_vencimento) a.vencimentoBate++;
    else if (t) a.vencimentoErrado++;
    porDia.set(k, a);
  }

  const agrupa = chaveFn => {
    const m = new Map();
    for (const l of linhas) {
      const k = chaveFn(l) || '—';
      const a = m.get(k) || { nome: k, n: 0, valor: 0 };
      a.n++; a.valor = round(a.valor + l.valor); m.set(k, a);
    }
    return [...m.values()].sort((x, y) => y.n - x.n);
  };

  return {
    ok: true, periodo: { ini, fim },
    resumo: {
      titulos: parcelas.length, conferidos: iguais + linhas.length, iguais,
      divergentes: linhas.filter(l => l.diferencaDias !== 0).length,
      semTituloNoErp: semTitulo,
      valorDivergente: round(linhas.reduce((s, l) => s + l.valor, 0)),
      porLoja: agrupa(l => l.loja),
      porDiferenca: agrupa(l => l.diferencaDias == null ? 'sem vencimento no ERP'
        : (l.diferencaDias > 0 ? '+' : '') + l.diferencaDias + ' dia(s)'),
      porDia: [...porDia.values()].sort((a, b) => String(a.data).localeCompare(String(b.data))),
    },
    linhas: linhas.slice(0, 500),
  };
}

// parcelas de um depósito (para abrir na tela)
function detalheDeposito(empresaId, id) {
  const dep = db.prepare('SELECT * FROM conc_repasse WHERE id=? AND empresa_id=?').get(id, empresaId);
  if (!dep) return { ok: false, erro: 'Depósito não encontrado.' };
  const parcelas = db.prepare(`SELECT p.*, i.data data_venda_conferida, i.valor valor_venda_conferida, i.cliente
     FROM conc_repasse_parcela p LEFT JOIN conc_item i ON i.id = p.item_id
    WHERE p.repasse_id=? ORDER BY p.valor_liquido DESC`).all(id);
  return { ok: true, deposito: dep, parcelas };
}

// ── conferência do financeiro ─────────────────────────────────────────────
function mapaConferencia(empresaId) {
  return new Map(db.prepare('SELECT ref, status, obs, atualizado_em FROM conc_repasse_conferencia WHERE empresa_id=?')
    .all(empresaId).map(r => [r.ref, r]));
}
function marcarConferencia(empresaId, { ref, status, valor, obs, usuarioId }) {
  db.prepare(`INSERT INTO conc_repasse_conferencia (empresa_id, ref, status, valor, obs, usuario_id, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(empresa_id, ref) DO UPDATE SET status=excluded.status, obs=excluded.obs,
      usuario_id=excluded.usuario_id, atualizado_em=datetime('now')`)
    .run(empresaId, ref, status || 'conferido', round(valor), obs || '', String(usuarioId || ''));
  return { ok: true };
}

// ── Auto-conferência por extrato bancário do ERP ───────────────────────────
// O extrato (origem 'F' no ERP) mostra o que realmente caiu na conta. Isso NÃO muda a fonte da
// conciliação em si — quem diz "a venda tá certa" e "a taxa tá certa" continua sendo o relatório
// da credenciadora, nunca o ERP. Só automatiza a pergunta "caiu na conta mesmo?", que hoje o
// Financeiro confirma clicando "conferir" um dia-loja de cada vez.
// Só confere sozinho o que já FECHA (depositado == soma das parcelas): se não fecha, tem
// divergência de verdade e precisa de olho humano, não de confirmação automática.
async function autoConferirLotes(empresaId, { ini, fim, lojaId } = {}) {
  const { erpQuery, habilitado } = require('../db/erp');
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const conf = conferir(empresaId, { ini, fim, lojaId });
  if (!conf.ok || conf.vazio) return { ok: true, conferidos: 0, total: 0 };

  const lojas = lojasEmpresa(empresaId);
  const uniDaLoja = id => { const l = lojas.find(x => x.id === id); return l ? Number(l.erp_unidadenegocio_id) : null; };
  const unis = [...new Set(conf.dias.map(d => uniDaLoja(d.lojaId)).filter(Boolean))];
  if (!unis.length) return { ok: true, conferidos: 0, total: conf.dias.length };

  // o depósito pode cair no extrato até alguns dias depois da data que a credenciadora reportou
  // (fim de semana, feriado bancário) — folga a janela pra frente.
  const extrato = await erpQuery(`
    SELECT unidadenegocioid uni, valor::float8 valor
      FROM lancamentofinanceiro
     WHERE unidadenegocioid = ANY($1::bigint[]) AND origem='F' AND tipo='E'
       AND datahora >= $2::date AND datahora < ($3::date + 6)`,
    [unis, ini, fim]);
  const porValor = new Set(extrato.map(e => e.uni + '|' + round(e.valor)));

  // o botão "conferir" da tela age por DEPÓSITO (ref 'dep:'+id) — a auto-conferência tem que
  // marcar no mesmo nível, senão a tela continua mostrando "conferir" mesmo depois de rodar isso.
  let conferidos = 0;
  for (const d of conf.depositos) {
    if (d.conferencia || !d.fecha) continue;
    const uni = uniDaLoja(d.lojaId);
    if (!uni || !porValor.has(uni + '|' + round(d.valor))) continue;
    marcarConferencia(empresaId, { ref: 'dep:' + d.id, status: 'conferido', valor: d.valor,
      obs: 'Conferido automaticamente: valor bate com o extrato bancário do ERP.', usuarioId: 'auto-extrato' });
    conferidos++;
  }
  return { ok: true, conferidos, total: conf.depositos.length };
}

function lotes(empresaId, { limite = 60 } = {}) {
  return db.prepare(`SELECT id, operadora, nome_arquivo, data_ini, data_fim, linhas, valor_total, importado_em
    FROM conc_repasse_arquivo WHERE empresa_id=? ORDER BY id DESC LIMIT ?`).all(empresaId, limite);
}
function apagarLote(empresaId, id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM conc_repasse_parcela WHERE arquivo_id=? AND empresa_id=?').run(id, empresaId);
    db.prepare('DELETE FROM conc_repasse WHERE arquivo_id=? AND empresa_id=?').run(id, empresaId);
    db.prepare('DELETE FROM conc_repasse_ajuste WHERE arquivo_id=? AND empresa_id=?').run(id, empresaId);
    db.prepare('DELETE FROM conc_repasse_arquivo WHERE id=? AND empresa_id=?').run(id, empresaId);
  });
  tx();
  return { ok: true };
}

// token da operadora como ela aparece no texto do extrato (fallback p/ linhas sem estabelecimento)
const TOKEN_OPERADORA = {
  'Rede': /\bREDE\b/, 'Cielo': /\bCIELO\b/, 'GetNet': /\bGET\s*NET\b/, 'Stone': /\bSTONE\b/,
  'Brasil Card': /BRASIL\s*CAR/, 'Le Card': /\bLE\s*CARD\b/, 'Nutricash': /NUTRICASH/,
  'Bracov': /BRACOV/, 'Alelo': /\bALELO\b/, 'Banese / Mulvi': /BANESE|MULVI/, 'Multi Mais / Uze': /MULTI\s*MAIS|\bUZE\b/,
};
// Valida se o repasse CAIU no banco (conciliação bancária do Alpha / extratobancario).
// O repasse já vem na granularidade da linha do banco (estabelecimento + bandeira + modalidade por dia):
// no extrato cada crédito traz o código do estabelecimento no texto ("REDE VISA CD0071713654"), então
// casamos LINHA a linha por estabelecimento + valor + data, e agregamos em lotes (data/loja/operadora)
// pra responder "caiu o lote?".
async function conferirNoBanco(empresaId, { ini, fim, lojaId } = {}) {
  if (!habilitado()) return { ok: false, erro: 'ERP indisponível.' };
  const unis = unisEmpresa(empresaId, lojaId);
  const vazio = { ok: true, lotes: [], linhas: [], resumo: { total: 0, valorTotal: 0, caiu: 0, valorCaiu: 0, naoAchado: 0, valorNaoAchado: 0, lotes: 0, lotesCaiu: 0 } };
  if (!unis.length) return vazio;
  const lojas = lojasEmpresa(empresaId);
  const nomeLoja = id => (lojas.find(l => l.id === id) || {}).nome || null;
  // repasse pode ser filtrado por loja; o BANCO não — a liquidação de cartão cai numa conta
  // centralizada do grupo (ex.: toda a Rede cai na conta da Esplanada), então o pool do banco
  // é sempre o grupo inteiro e o vínculo real é o código do estabelecimento no texto do extrato.
  const lojaAppFiltro = lojaId && String(lojaId).startsWith('loja-') ? lojaId : null;
  const deps = db.prepare(`SELECT id, data, valor, loja_id, uni_erp, operadora, bandeira, modalidade, estabelecimento
    FROM conc_repasse WHERE empresa_id=? AND tipo='recebido' AND data BETWEEN ? AND ?
      ${lojaAppFiltro ? 'AND loja_id=?' : ''} ORDER BY data`).all(...(lojaAppFiltro ? [empresaId, ini, fim, lojaAppFiltro] : [empresaId, ini, fim]));
  if (!deps.length) return vazio;
  const bankUnis = unisEmpresa(empresaId); // todas as contas do grupo
  const bancoRows = await erpQuery(`
    SELECT to_char(eb.datahora,'YYYY-MM-DD') AS data, eb.valor, upper(coalesce(eb.descricao,'')) AS descricao
    FROM extratobancario eb
    JOIN contabancaria cb ON cb.id = eb.contabancariaid
    JOIN contacorrente cc ON cc.id = cb.contacorrenteid
    WHERE cc.unidadenegocioid = ANY($1::bigint[]) AND eb.valor > 0
      AND eb.datahora >= ($2::date - interval '6 days') AND eb.datahora < ($3::date + interval '7 days')`, [bankUnis, ini, fim]);
  const pool = bancoRows.map(b => ({ data: b.data, valor: Number(b.valor), descDigitos: b.descricao.replace(/\D/g, ''), descricao: b.descricao, usado: false }));
  const diffDias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  // match linha a linha: estabelecimento no texto (forte) OU nome da operadora (fraco), valor exato, data próxima
  const linhas = deps.map(d => {
    const estab = (d.estabelecimento || '').replace(/\D/g, '');
    const tok = TOKEN_OPERADORA[d.operadora];
    const casa = (b) => {
      if (b.usado || Math.abs(b.valor - Number(d.valor)) > 0.02 || diffDias(b.data, d.data) > 6) return false;
      if (estab && b.descDigitos.includes(estab)) return true;      // casou pelo estabelecimento (forte)
      if (tok && tok.test(b.descricao)) return true;                // fallback: nome da operadora no texto
      return false;
    };
    const cands = pool.filter(casa).sort((a, b) => diffDias(a.data, d.data) - diffDias(b.data, d.data));
    const hit = cands[0];
    if (hit) hit.usado = true;
    return { id: d.id, data: d.data, loja_id: d.loja_id, loja: nomeLoja(d.loja_id) || (estab ? 'estab. ' + estab : '— sem loja'),
      operadora: d.operadora, bandeira: d.bandeira, modalidade: d.modalidade, estabelecimento: d.estabelecimento,
      valor: round(Number(d.valor)), caiu: !!hit, banco_data: hit ? hit.data : null };
  });
  // agrega em lotes: data | loja | operadora
  const lotesMap = {};
  linhas.forEach(x => {
    const k = x.data + '|' + (x.loja_id || '') + '|' + (x.operadora || '');
    const L = lotesMap[k] || (lotesMap[k] = { data: x.data, loja: x.loja, loja_id: x.loja_id, operadora: x.operadora, valor: 0, linhas: 0, caiuLinhas: 0, valorCaiu: 0 });
    L.valor += x.valor; L.linhas++; if (x.caiu) { L.caiuLinhas++; L.valorCaiu += x.valor; }
  });
  // tratativas manuais (validação humana) salvas pela Tesouraria
  const trat = {};
  db.prepare(`SELECT chave, status, obs FROM conc_repasse_banco_tratativa WHERE empresa_id=?`).all(empresaId)
    .forEach(t => { trat[t.chave] = t; });
  // regra por operadora: operadoras de factoring/antecipação que não caem no banco → ignora sozinho
  const regraOp = {};
  db.prepare(`SELECT operadora, ignorar FROM conc_banco_operadora_regra WHERE empresa_id=? AND ignorar=1`).all(empresaId)
    .forEach(r => { regraOp[r.operadora] = true; });
  const lotes = Object.values(lotesMap).map(L => {
    const chave = L.data + '|' + (L.loja_id || '') + '|' + (L.operadora || '');
    const auto = L.caiuLinhas === L.linhas ? 'sim' : L.caiuLinhas === 0 ? 'nao' : 'parcial';
    const t = trat[chave];
    // status final: caiu pelo banco, confirmado à mão, ignorado (manual OU regra de operadora), ou pendente
    let status;
    if (auto === 'sim') status = 'caiu';
    else if (t && t.status === 'confirmado') status = 'confirmado';
    else if (t && t.status === 'ignorado') status = 'ignorado';
    else if (regraOp[L.operadora]) status = 'ignorado';
    else status = 'pendente';
    return { ...L, chave, valor: round(L.valor), valorCaiu: round(L.valorCaiu), caiu: auto, status,
      ignoradoPorRegra: status === 'ignorado' && !(t && t.status === 'ignorado') && !!regraOp[L.operadora], obs: t ? t.obs : null };
  }).sort((a, b) => a.data.localeCompare(b.data) || (b.valor - a.valor));
  const caiu = linhas.filter(x => x.caiu);
  const pendentes = lotes.filter(l => l.status === 'pendente');
  const okLotes = lotes.filter(l => l.status === 'caiu' || l.status === 'confirmado');
  const resumo = {
    total: linhas.length, valorTotal: round(linhas.reduce((s, x) => s + x.valor, 0)),
    caiu: caiu.length, valorCaiu: round(caiu.reduce((s, x) => s + x.valor, 0)),
    naoAchado: linhas.length - caiu.length, valorNaoAchado: round(linhas.filter(x => !x.caiu).reduce((s, x) => s + x.valor, 0)),
    lotes: lotes.length, lotesCaiu: okLotes.length,
    pendentes: pendentes.length, valorPendente: round(pendentes.reduce((s, l) => s + l.valor, 0)),
  };
  return { ok: true, lotes, linhas, resumo };
}

// Regra por operadora na conferência bancária: operadora de factoring/antecipação que não cai no
// banco como crédito rastreável → ignora sozinho (para de aparecer como pendência).
function regrasBancoOperadora(empresaId) {
  return db.prepare('SELECT operadora, ignorar, motivo, atualizado_em FROM conc_banco_operadora_regra WHERE empresa_id=? ORDER BY operadora').all(empresaId);
}
function salvarRegraBancoOperadora(empresaId, { operadora, ignorar, motivo, usuarioId } = {}) {
  if (!operadora) throw new Error('Operadora é obrigatória.');
  if (!ignorar) { db.prepare('DELETE FROM conc_banco_operadora_regra WHERE empresa_id=? AND operadora=?').run(empresaId, operadora); return { ok: true, ignorar: false }; }
  db.prepare(`INSERT INTO conc_banco_operadora_regra (empresa_id, operadora, ignorar, motivo, usuario_id, atualizado_em)
    VALUES (?,?,1,?,?,datetime('now'))
    ON CONFLICT(empresa_id, operadora) DO UPDATE SET ignorar=1, motivo=excluded.motivo, usuario_id=excluded.usuario_id, atualizado_em=datetime('now')`)
    .run(empresaId, operadora, motivo || null, usuarioId || null);
  return { ok: true, ignorar: true };
}

// Validação humana de um lote que não cruzou com o banco: confirma ("caiu, validei à mão"),
// ignora, ou reabre (remove a tratativa pra voltar a pendente).
function tratarLoteBanco(empresaId, { chave, status, valor, obs, usuarioId } = {}) {
  if (!chave) throw new Error('Lote não identificado.');
  if (status === 'pendente' || status === 'reabrir' || !status) {
    db.prepare(`DELETE FROM conc_repasse_banco_tratativa WHERE empresa_id=? AND chave=?`).run(empresaId, chave);
    return { ok: true, status: 'pendente' };
  }
  if (!['confirmado', 'ignorado'].includes(status)) throw new Error('Status inválido.');
  db.prepare(`INSERT INTO conc_repasse_banco_tratativa (empresa_id, chave, status, valor, obs, usuario_id, atualizado_em)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id, chave) DO UPDATE SET status=excluded.status, valor=excluded.valor, obs=excluded.obs, usuario_id=excluded.usuario_id, atualizado_em=datetime('now')`)
    .run(empresaId, chave, status, valor || 0, obs || null, usuarioId || null);
  return { ok: true, status };
}

module.exports = {
  importar, conferir, conferirVencimentos, detalheDeposito, lotes, apagarLote, marcarConferencia, autoConferirLotes,
  estabelecimentos, salvarEstabelecimento, aprenderEstabelecimentos, credenciadoras,
  taxasContratadas, salvarTaxa, excluirTaxa, replicarTaxas, taxaEsperada, taxasDoErp, importarTaxasDoErp, conferirNoBanco, tratarLoteBanco,
  regrasBancoOperadora, salvarRegraBancoOperadora,
  contratosTaxa, salvarContratoTaxa, getContratoTaxa, excluirContratoTaxa,
};
