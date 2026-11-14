// Regime tributário de fornecedor por CNPJ via BrasilAPI (pública, grátis).
// Classifica em: MEI · Simples Nacional · Lucro Presumido · Lucro Real · Desconhecido.
// Cacheia por CNPJ (a API tem limite de requisições). ⚠️ consultar ENVIA o CNPJ à API externa.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

const soDigitos = s => String(s || '').replace(/\D/g, '');
const REVALIDA_DIAS = 60; // não reconsulta um CNPJ visto há menos que isso (salvo forçar)

// Dígitos verificadores do CNPJ (p/ montar o CNPJ da MATRIZ a partir da raiz) — regime/Simples ficam na matriz.
function dvCnpj(base12) {
  const calc = (nums, pesos) => { let s = 0; for (let i = 0; i < nums.length; i++) s += nums[i] * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d = base12.split('').map(Number);
  const dv1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calc([...d, dv1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return '' + dv1 + dv2;
}
function matrizDe(cnpj14) { const base = cnpj14.slice(0, 8) + '0001'; return base + dvCnpj(base); }
const ehFilial = cnpj14 => cnpj14.slice(8, 12) !== '0001';
const inconclusivo = reg => !reg || reg === 'Desconhecido' || /Não optante/.test(reg);

function classificar(j) {
  if (!j || typeof j !== 'object') return { regime: 'Desconhecido' };
  if (j.opcao_pelo_mei === true) return { regime: 'MEI', opcao_simples: true, opcao_mei: true };
  if (j.opcao_pelo_simples === true) return { regime: 'Simples Nacional', opcao_simples: true, opcao_mei: false };
  // regime_tributario: lista por ano com forma_de_tributacao (LUCRO REAL / LUCRO PRESUMIDO / …)
  const rt = Array.isArray(j.regime_tributario) ? j.regime_tributario : [];
  if (rt.length) {
    const ult = rt.slice().sort((a, b) => (Number(b.ano) || 0) - (Number(a.ano) || 0))[0];
    const forma = String(ult.forma_de_tributacao || '').toUpperCase();
    const regime = forma.includes('PRESUMIDO') ? 'Lucro Presumido' : forma.includes('REAL') ? 'Lucro Real' : forma.includes('ARBITR') ? 'Lucro Arbitrado' : (forma ? forma : 'Desconhecido');
    return { regime, opcao_simples: j.opcao_pelo_simples === true, opcao_mei: j.opcao_pelo_mei === true, ult_ano: Number(ult.ano) || null };
  }
  // optante = false e sem ECF → provável Presumido/Real sem escrituração pública; fica indefinido
  return { regime: j.opcao_pelo_simples === false ? 'Não optante (Presumido/Real)' : 'Desconhecido', opcao_simples: j.opcao_pelo_simples === true, opcao_mei: false };
}

async function fetchBrasilApi(cnpj, tentativa = 0) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, { signal: ctrl.signal, headers: { 'User-Agent': 'mutti-sistema/1.0' } });
    if (r.status === 429) { // limite — espera e tenta de novo (até 3x) p/ não cair em "Desconhecido" à toa
      if (tentativa < 3) { clearTimeout(t); await new Promise(s => setTimeout(s, 2000 * (tentativa + 1))); return fetchBrasilApi(cnpj, tentativa + 1); }
      return { erro: 'limite da API (tente de novo em instantes)' };
    }
    if (r.status === 404) return { erro: 'CNPJ não encontrado' };
    if (!r.ok) return { erro: 'API retornou ' + r.status };
    return { json: await r.json() };
  } catch (e) { return { erro: e.name === 'AbortError' ? 'tempo esgotado' : e.message }; }
  finally { clearTimeout(t); }
}

function gravar(emp, cnpj, razao, c, erro) {
  db.prepare(`INSERT INTO fornecedor_regime (empresa_id, cnpj, razao_social, regime, opcao_simples, opcao_mei, ult_ano, erro, consultado_em)
    VALUES (?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, cnpj) DO UPDATE SET razao_social=excluded.razao_social, regime=excluded.regime, opcao_simples=excluded.opcao_simples, opcao_mei=excluded.opcao_mei, ult_ano=excluded.ult_ano, erro=excluded.erro, consultado_em=excluded.consultado_em`)
    .run(emp, cnpj, razao || null, c.regime || null, c.opcao_simples ? 1 : 0, c.opcao_mei ? 1 : 0, c.ult_ano || null, erro || null);
}

// Consulta 1 CNPJ (usa cache salvo se recente, salvo forcar).
async function consultar(emp, cnpjRaw, { forcar } = {}) {
  const cnpj = soDigitos(cnpjRaw);
  if (cnpj.length !== 14) return { ok: false, erro: 'CNPJ inválido (precisa de 14 dígitos).', cnpj };
  // Override MANUAL sempre vence — nunca é sobrescrito por revalidação automática.
  const jaManual = db.prepare('SELECT * FROM fornecedor_regime WHERE empresa_id=? AND cnpj=? AND manual=1').get(emp, cnpj);
  if (jaManual) return { ok: true, cnpj, manual: true, cache: true, ...jaManual };
  if (!forcar) {
    const cache = db.prepare('SELECT * FROM fornecedor_regime WHERE empresa_id=? AND cnpj=?').get(emp, cnpj);
    if (cache && cache.consultado_em) {
      const idadeD = (Date.now() - new Date(cache.consultado_em.replace(' ', 'T') + 'Z').getTime()) / 86400000;
      if (idadeD < REVALIDA_DIAS && !cache.erro) return { ok: true, cnpj, cache: true, ...cache };
    }
  }
  const { json, erro } = await fetchBrasilApi(cnpj);
  if (erro) { gravar(emp, cnpj, null, { regime: null }, erro); return { ok: false, erro, cnpj }; }
  let c = classificar(json);
  // Se é FILIAL e deu inconclusivo, consulta a MATRIZ (regime/Simples ficam na raiz).
  if (inconclusivo(c.regime) && ehFilial(cnpj)) {
    await new Promise(s => setTimeout(s, 350));
    const mat = matrizDe(cnpj);
    const r2 = await fetchBrasilApi(mat);
    if (r2.json) { const cm = classificar(r2.json); if (!inconclusivo(cm.regime)) c = { ...cm, viaMatriz: true }; }
  }
  gravar(emp, cnpj, json.razao_social, c, null);
  return { ok: true, cnpj, cache: false, razao_social: json.razao_social, ...c };
}

// Lista os fornecedores do ERP por volume de compra (notafiscal → fornecedor.pessoaid → pessoa.cnpj).
async function fornecedoresDoErp(emp, { limite = 150, dias = 365 } = {}) {
  if (!habilitado()) return [];
  const unis = unisEmpresa(emp);
  if (!unis.length) return [];
  const rows = await erpQuery(`
    WITH nf AS (
      SELECT n.id, n.fornecedorid,
        (SELECT COALESCE(SUM(ii.valortotal),0) FROM itemnotafiscal ii WHERE ii.notafiscalid=n.id) valor
      FROM notafiscal n
      WHERE n.unidadenegocioid = ANY($1::bigint[]) AND n.status NOT IN ('X','E')
        AND n.fornecedorid IS NOT NULL AND n.tipooperacao='1' AND n.datahoraentrada >= now() - ($2 || ' days')::interval)
    SELECT regexp_replace(p.cnpj,'\\D','','g') cnpj, p.nome razao,
      round(SUM(nf.valor)::numeric,2) total
    FROM nf JOIN fornecedor f ON f.id=nf.fornecedorid JOIN pessoa p ON p.id=f.pessoaid
    WHERE p.cnpj IS NOT NULL AND length(regexp_replace(p.cnpj,'\\D','','g'))=14
    GROUP BY p.cnpj, p.nome ORDER BY total DESC LIMIT $3`, [unis, dias, Number(limite) || 150]);
  return rows.map(r => ({ cnpj: r.cnpj, razao: (r.razao || '').trim(), total: Number(r.total) || 0 }));
}

// Lote (com pausa entre consultas por causa do limite). cnpjs = [{cnpj, razao?}]
async function consultarLote(emp, cnpjs = [], { forcar } = {}) {
  const res = []; let ok = 0, falha = 0;
  for (const item of cnpjs) {
    const cnpj = typeof item === 'string' ? item : item.cnpj;
    const r = await consultar(emp, cnpj, { forcar });
    if (r.ok) ok++; else falha++;
    res.push(r);
    if (!r.cache) await new Promise(s => setTimeout(s, 350)); // respeita o rate limit só quando bate na API
  }
  return { ok: true, total: cnpjs.length, consultados: ok, falhas: falha, resultados: res };
}

function listar(emp) {
  return { itens: db.prepare('SELECT cnpj, razao_social, regime, opcao_simples, opcao_mei, ult_ano, erro, manual, manual_por, via_matriz, consultado_em FROM fornecedor_regime WHERE empresa_id=? ORDER BY razao_social, cnpj').all(emp) };
}

// Propaga o regime da MATRIZ (ou de uma filial irmã já classificada) para as filiais Desconhecidas da
// mesma raiz de CNPJ (regime é da EMPRESA, não da filial). Não toca nos manuais. Retorna quantos resolveu.
function propagarMatriz(emp) {
  const todos = db.prepare('SELECT cnpj, regime, opcao_simples, opcao_mei, manual FROM fornecedor_regime WHERE empresa_id=?').all(emp);
  const fontePorRaiz = new Map(); // raiz(8) → {regime, opcao_simples, opcao_mei} de um CNPJ já classificado
  for (const r of todos) {
    if (inconclusivo(r.regime)) continue;
    const raiz = String(r.cnpj).slice(0, 8);
    if (!fontePorRaiz.has(raiz)) fontePorRaiz.set(raiz, r);
  }
  const upd = db.prepare(`UPDATE fornecedor_regime SET regime=?, opcao_simples=?, opcao_mei=?, via_matriz=1, erro=NULL
    WHERE empresa_id=? AND cnpj=? AND manual=0`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const r of todos) {
      if (r.manual || !inconclusivo(r.regime)) continue;
      const f = fontePorRaiz.get(String(r.cnpj).slice(0, 8));
      if (f) { upd.run(f.regime, f.opcao_simples, f.opcao_mei, emp, r.cnpj); n++; }
    }
  });
  tx();
  return { ok: true, propagados: n };
}
function remover(emp, cnpj) { db.prepare('DELETE FROM fornecedor_regime WHERE empresa_id=? AND cnpj=?').run(emp, soDigitos(cnpj)); return { ok: true }; }

// Override MANUAL do regime (pros que a API nunca resolve). regime ∈ lista conhecida; '' limpa o manual.
const REGIMES = ['MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Lucro Arbitrado', 'Não optante (Presumido/Real)', 'Desconhecido'];
function definirManual(emp, cnpjRaw, regime, usuario) {
  const cnpj = soDigitos(cnpjRaw); if (cnpj.length !== 14) throw new Error('CNPJ inválido.');
  if (regime && !REGIMES.includes(regime)) throw new Error('Regime inválido.');
  const simples = regime === 'Simples Nacional' || regime === 'MEI';
  db.prepare(`INSERT INTO fornecedor_regime (empresa_id, cnpj, regime, opcao_simples, opcao_mei, manual, manual_por, consultado_em)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, cnpj) DO UPDATE SET regime=excluded.regime, opcao_simples=excluded.opcao_simples, opcao_mei=excluded.opcao_mei, manual=excluded.manual, manual_por=excluded.manual_por, erro=NULL, consultado_em=excluded.consultado_em`)
    .run(emp, cnpj, regime || 'Desconhecido', simples ? 1 : 0, regime === 'MEI' ? 1 : 0, regime ? 1 : 0, usuario?.nome || null);
  return { ok: true, cnpj, regime: regime || 'Desconhecido', manual: !!regime };
}

// ── Validar TODOS os fornecedores do ERP em BACKGROUND (a API tem rate limit) ──────────────────────
let JOB = { rodando: false, total: 0, feitos: 0, ok: 0, falha: 0, emp: null, iniciado: null, fim: null };
function progresso() { return { ...JOB, pct: JOB.total ? Math.round(JOB.feitos / JOB.total * 100) : 0 }; }
async function validarTodos(emp, { forcar = false } = {}) {
  if (JOB.rodando) return { ok: false, jaRodando: true, ...progresso() };
  const fornecedores = await fornecedoresDoErp(emp, { limite: 5000, dias: 1095 }); // todos c/ compra nos últimos 3 anos
  JOB = { rodando: true, total: fornecedores.length, feitos: 0, ok: 0, falha: 0, emp, iniciado: new Date().toISOString(), fim: null };
  (async () => {
    for (const f of fornecedores) {
      if (!JOB.rodando) break;
      try { const r = await consultar(emp, f.cnpj, { forcar }); if (r.ok) JOB.ok++; else JOB.falha++; if (!r.cache) await new Promise(s => setTimeout(s, 400)); }
      catch (e) { JOB.falha++; }
      JOB.feitos++;
    }
    // Ao terminar, herda da matriz os que sobraram Desconhecidos (regime é da raiz do CNPJ).
    try { const p = propagarMatriz(emp); JOB.propagados = p.propagados; } catch (e) { }
    JOB.rodando = false; JOB.fim = new Date().toISOString();
  })();
  return { ok: true, iniciado: true, total: fornecedores.length };
}
function pararValidacao() { JOB.rodando = false; return { ok: true }; }

module.exports = { consultar, consultarLote, listar, remover, classificar, fornecedoresDoErp, matrizDe, definirManual, validarTodos, progresso, pararValidacao, propagarMatriz, REGIMES };
