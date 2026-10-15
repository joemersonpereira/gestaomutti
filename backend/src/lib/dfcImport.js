// dfcImport.js — lê os exports de DFC (regime caixa) por loja e grava em dfc_importado.
// Formato do arquivo: aba "Sheet1", col A = plano de contas hierárquico, col B = valor do mês (em MILHARES).
// Bug do export: valores fracionários perderam o "0." (ex.: "0,27347" virou 27347). Regra: inteiro != 0 → /100000.
// Validação: soma das folhas de cada grupo deve reconciliar com o valor do grupo (senão, avisa).
const { v4: uuid } = require('uuid');
const db = require('../db/connection');

// Valor de um GRUPO/TOTAL (nível 0/1) em milhares. Inteiro != 0 costuma ser fração que perdeu o "0.".
function milharesGrupo(v) {
  if (typeof v !== 'number' || !v) return 0;
  return Number.isInteger(v) ? v / 100000 : v;
}
// milhares corrigido → reais (usado só p/ grupos; folhas são resolvidas por reconciliação)
function valorReais(v) { return Math.round(milharesGrupo(v) * 1000 * 100) / 100; }
const semSinal = /\((\+|-)\)\s*$/;
function classificar(label) {
  const l = String(label || '').trim();
  const sinal = /\(\+\)/.test(l) ? '+' : /\(-\)/.test(l) ? '-' : '';
  const conta = l.replace(semSinal, '').trim();
  const temMinuscula = /[a-zà-ú]/.test(conta);
  const nivel = !temMinuscula ? (sinal ? 1 : 0) : 2; // MAIÚSCULA sem sinal = topo; MAIÚSCULA c/ sinal = grupo; resto = folha
  return { conta, sinal, nivel };
}

// Resolve as folhas (nível 2) de cada grupo (nível 1): um inteiro pode ser fração que perdeu o "0."
// (÷100000) OU um milhar redondo genuíno (ex.: 11 = R$11.000). Decide pelo que reconcilia com o grupo.
function resolverGrupo(grupoMilhares, folhas) {
  // folhas: [{raw}] → devolve milhares por folha
  const dec = folhas.map(f => (typeof f.raw === 'number' && !Number.isInteger(f.raw)) ? f.raw : null); // decimais são certos
  const intIdx = folhas.map((f, i) => (typeof f.raw === 'number' && Number.isInteger(f.raw) && f.raw !== 0) ? i : -1).filter(i => i >= 0);
  const valor = folhas.map((f, i) => dec[i] != null ? dec[i] : 0);
  // começa todos os inteiros como fração (÷100000)
  intIdx.forEach(i => { valor[i] = folhas[i].raw / 100000; });
  const soma = () => valor.reduce((a, v) => a + v, 0);
  let gap = grupoMilhares - soma();
  // promove inteiros (maior valor primeiro) de fração→genuíno enquanto ajudar a fechar o gap
  const ordenados = [...intIdx].sort((a, b) => folhas[b].raw - folhas[a].raw);
  for (const i of ordenados) {
    if (gap <= 0.0005) break;
    const ganho = folhas[i].raw - folhas[i].raw / 100000; // ao virar genuíno
    if (ganho <= gap + 0.0005) { valor[i] = folhas[i].raw; gap -= ganho; }
  }
  return valor;
}

// Lê um arquivo e devolve as linhas já classificadas + com valor em reais.
function parseArquivo(XLSX, caminho) { return parseWorkbook(XLSX, XLSX.readFile(caminho)); }
// Idem, a partir de conteúdo base64 (upload).
function parseBase64(XLSX, base64) { return parseWorkbook(XLSX, XLSX.read(String(base64).replace(/^data:.*;base64,/, ''), { type: 'base64' })); }

function parseWorkbook(XLSX, wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const linhas = [];
  rows.forEach((r, i) => {
    const label = (r[0] != null ? r[0] : '').toString().trim();
    if (!label || /^ampliar\s*todos/i.test(label)) return; // cabeçalho
    const { conta, sinal, nivel } = classificar(label);
    linhas.push({ ordem: i, conta, sinal, nivel, raw: r[1], milhares: nivel === 2 ? null : milharesGrupo(r[1]) });
  });
  // resolve folhas por grupo (nível 1 → nível 2 seguintes)
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].nivel !== 1) continue;
    const folhas = []; let j = i + 1;
    for (; j < linhas.length && linhas[j].nivel === 2; j++) folhas.push(linhas[j]);
    const resolvidas = resolverGrupo(linhas[i].milhares, folhas);
    folhas.forEach((f, k) => { f.milhares = resolvidas[k]; });
  }
  // folhas fora de grupo (raras) e qualquer null → fallback
  linhas.forEach(l => { if (l.milhares == null) l.milhares = milharesGrupo(l.raw); });
  return linhas.map(l => ({ ordem: l.ordem, conta: l.conta, sinal: l.sinal, nivel: l.nivel, valor: Math.round(l.milhares * 1000 * 100) / 100 }));
}

// Confere a reconciliação: para cada grupo (nível 1) soma as folhas (nível 2) seguintes até o próximo grupo/topo.
function reconciliar(linhas) {
  const avisos = [];
  for (let i = 0; i < linhas.length; i++) {
    const g = linhas[i];
    if (g.nivel !== 1) continue;
    let soma = 0;
    for (let j = i + 1; j < linhas.length && linhas[j].nivel === 2; j++) soma += linhas[j].valor;
    if (Math.abs(soma - g.valor) > 1) avisos.push({ grupo: g.conta, valorGrupo: g.valor, somaFolhas: Math.round(soma * 100) / 100, dif: Math.round((soma - g.valor) * 100) / 100 });
  }
  return avisos;
}

// Grava as linhas de 1 loja/mês (substitui o que já existe — idempotente).
function salvarLinhas(empresaId, lojaId, ano, mes, linhas) {
  const del = db.prepare('DELETE FROM dfc_importado WHERE empresa_id=? AND loja_id=? AND ano=? AND mes=?');
  const ins = db.prepare(`INSERT INTO dfc_importado (id,empresa_id,loja_id,ano,mes,ordem,nivel,conta,sinal,valor) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    del.run(empresaId, lojaId, ano, mes);
    for (const l of linhas) ins.run(uuid(), empresaId, lojaId, ano, mes, l.ordem, l.nivel, l.conta, l.sinal, l.valor);
  })();
  const receitas = linhas.find(l => l.nivel === 0 && /^RECEITAS/i.test(l.conta))?.valor || 0;
  const despesas = linhas.find(l => l.nivel === 0 && /^DESPESAS/i.test(l.conta))?.valor || 0;
  return { linhas: linhas.length, receitas, despesas, avisos: reconciliar(linhas) };
}
// Importa 1 loja/mês a partir de um arquivo (caminho).
function importarArquivo(XLSX, { empresaId, lojaId, ano, mes, caminho }) {
  return salvarLinhas(empresaId, lojaId, ano, mes, parseArquivo(XLSX, caminho));
}
// Importa 1 loja/mês a partir de conteúdo base64 (upload).
function importarConteudo(XLSX, { empresaId, lojaId, ano, mes, base64 }) {
  return salvarLinhas(empresaId, lojaId, ano, mes, parseBase64(XLSX, base64));
}

// Lê o DFC importado de um mês (todas as lojas ou uma), montado em hierarquia.
function ler(empresaId, { ano, mes, lojaId } = {}) {
  const rows = db.prepare(`SELECT loja_id, ordem, nivel, conta, sinal, sum(valor) valor FROM dfc_importado
    WHERE empresa_id=? AND ano=? AND mes=? ${lojaId ? 'AND loja_id=?' : ''}
    GROUP BY ordem, nivel, conta, sinal ${lojaId ? '' : ''} ORDER BY ordem`).all(...(lojaId ? [empresaId, ano, mes, lojaId] : [empresaId, ano, mes]));
  return rows;
}
function periodosImportados(empresaId) {
  return db.prepare(`SELECT ano, mes, count(DISTINCT loja_id) lojas, count(*) linhas FROM dfc_importado WHERE empresa_id=? GROUP BY ano,mes ORDER BY ano,mes`).all(empresaId);
}

// ── Resumo de um mês no formato do Fluxo de Caixa (p/ injetar meses que o ERP não tem) ──
const stripAcc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// nome de grupo de despesa normalizado (sem "2.04 -" e sem "(-)") → casa planilha com ERP.
function normGrupo(s) { return stripAcc(s).replace(/^\s*\d+\.\d+\s*-\s*/, '').replace(/\s*\([+-]\)\s*$/, '').trim().toUpperCase(); }
// forma de pagamento da receita (folha da RECEITA OPERACIONAL).
function chaveReceita(conta) {
  const c = stripAcc(conta).toUpperCase();
  if (/CARTAO/.test(c)) return 'CARTAO';
  if (/\bPIX\b/.test(c)) return 'PIX';
  if (/PBM|REEMBOLSO/.test(c)) return 'PBM';
  if (/PRAZO|CREDIARIO|CONVENIO/.test(c)) return 'CREDIARIO';
  if (/VALE/.test(c)) return 'VALE';
  if (/VISTA|DINHEIRO|ESPECIE|FUNDO DE CAIXA/.test(c)) return 'DINHEIRO';
  return null;
}
const LABEL_REC = { CARTAO: 'Cartão', PIX: 'Pix', PBM: 'PBM', CREDIARIO: 'Crediário', VALE: 'Vale-Compra', DINHEIRO: 'Dinheiro' };
// Devolve { has, receitas: Map(chave→valor), despesas: Map(grupoNorm→valor) } somando todas as lojas do mês.
// O DFC tem BLOCOS (RECEITAS/DESPESAS repetem: operacional, depois fornecedores, depois empréstimos).
// Receita p/ o fluxo = só a RECEITA OPERACIONAL do 1º bloco (formas de pagamento); o não-mapeado vira "Dinheiro/outros".
// Despesa = todos os grupos dentro de QUALQUER bloco DESPESAS (operacional + fornecedores/compras + empréstimos).
function resumoMes(empresaId, ano, mes) {
  const has = periodosImportados(empresaId).some(p => p.ano === ano && p.mes === mes);
  const receitas = new Map(), despesas = new Map();
  if (!has) return { has, receitas, despesas };
  const linhas = ler(empresaId, { ano, mes });
  // receitas: folhas da 1ª RECEITA OPERACIONAL
  const oi = linhas.findIndex(x => x.nivel === 1 && /RECEITA OPERACIONAL/i.test(x.conta));
  let operTotal = 0;
  if (oi >= 0) {
    operTotal = linhas[oi].valor || 0;
    for (let j = oi + 1; j < linhas.length && linhas[j].nivel === 2; j++) {
      const k = chaveReceita(linhas[j].conta); if (k) receitas.set(k, (receitas.get(k) || 0) + linhas[j].valor);
    }
  }
  const somaMapeada = [...receitas.values()].reduce((a, v) => a + v, 0);
  const resto = operTotal - somaMapeada; // formas não separadas (dinheiro/espécie/outros)
  if (resto > 1) receitas.set('DINHEIRO', (receitas.get('DINHEIRO') || 0) + resto);
  // despesas: grupos (nível 1) dentro de blocos DESPESAS (rastreando a seção nível 0 atual)
  let inDespesa = false;
  for (const x of linhas) {
    if (x.nivel === 0) { inDespesa = /^DESPESA/i.test(x.conta); continue; }
    if (x.nivel === 1 && inDespesa && x.valor) { const g = normGrupo(x.conta); despesas.set(g, (despesas.get(g) || 0) + x.valor); }
  }
  return { has, receitas, despesas };
}

module.exports = { valorReais, classificar, parseArquivo, parseBase64, reconciliar, importarArquivo, importarConteudo, ler, periodosImportados, resumoMes, normGrupo, chaveReceita, LABEL_REC };
