// holerites.js — motor de análise/divisão de PDFs de documentos pessoais (holerite,
// informe de rendimento). CRÍTICO: cada pessoa só pode receber as páginas DELA.
// Casamento é SEMPRE por CPF exato e validado (dígitos verificadores). Nunca por nome.
const { PDFDocument } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');

// Valida CPF pelos dígitos verificadores (evita pegar número aleatório/parte de CNPJ).
function cpfValido(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10], 10);
}

// Extrai os CPFs VÁLIDOS de um texto. Só pega tokens de 11 dígitos com fronteira
// (não pega 11 dígitos dentro de um CNPJ de 14). Se houver rótulo "CPF", prioriza o
// que vem logo após. Retorna array de CPFs distintos (na ordem de preferência).
function cpfsDoTexto(texto) {
  const t = String(texto || '');
  const re = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;
  const achados = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const cpf = m[1].replace(/\D/g, '');
    if (cpfValido(cpf) && !achados.some(a => a.cpf === cpf)) {
      achados.push({ cpf, idx: m.index });
    }
  }
  if (!achados.length) return [];
  // Prioriza CPF logo após um rótulo "CPF"
  const rotulos = [];
  const reRot = /CPF/gi; let r;
  while ((r = reRot.exec(t)) !== null) rotulos.push(r.index);
  achados.sort((a, b) => {
    const da = Math.min(...rotulos.map(p => (a.idx >= p ? a.idx - p : Infinity)), Infinity);
    const dbb = Math.min(...rotulos.map(p => (b.idx >= p ? b.idx - p : Infinity)), Infinity);
    return da - dbb;
  });
  return achados.map(a => a.cpf);
}

// Analisa o PDF: para cada página, extrai o texto e o(s) CPF(s). Uma página é
// "definida" quando tem EXATAMENTE 1 CPF válido; 0 = sem CPF; >1 = ambígua.
// Retorna { totalPaginas, paginas:[{pagina, cpf|null, ambiguo, cpfs:[...]}] }.
async function analisarPaginas(buffer) {
  const parser = new PDFParse({ data: buffer });
  let textos;
  try {
    const t = await parser.getText();
    textos = (t.pages || []).map(p => p.text || '');
  } finally {
    try { await parser.destroy(); } catch { /* ignora */ }
  }
  const paginas = textos.map((texto, i) => {
    const cpfs = cpfsDoTexto(texto);
    return { pagina: i + 1, cpf: cpfs.length === 1 ? cpfs[0] : null, ambiguo: cpfs.length > 1, cpfs };
  });
  return { totalPaginas: paginas.length, paginas };
}

// Agrupa as páginas por CPF e gera um PDF (base64) por pessoa contendo SÓ as páginas dela.
// Páginas sem CPF ou ambíguas ficam de fora (retornadas em `pendencias`).
async function dividirPorCpf(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const { totalPaginas, paginas } = await analisarPaginas(buffer);
  const porCpf = new Map(); // cpf → [indices 0-based]
  const pendencias = [];    // {pagina, motivo} — páginas que NÃO vão pra ninguém (alerta ao RH)

  // REGRA: cada página vai SÓ pelo CPF que está NELA. Página sem CPF (ou com +1 CPF,
  // ambígua) NUNCA é anexada a ninguém — vira pendência/alerta para quem subiu o PDF.
  for (const p of paginas) {
    if (!p.cpf) { pendencias.push({ pagina: p.pagina, motivo: p.ambiguo ? 'multiplos_cpf' : 'sem_cpf', cpfs: p.cpfs }); continue; }
    if (!porCpf.has(p.cpf)) porCpf.set(p.cpf, []);
    porCpf.get(p.cpf).push(p.pagina - 1);
  }
  return { totalPaginas, grupos: await montarGrupos(doc, porCpf), pendencias };
}

// Monta um PDF (base64) por CPF só com as páginas daquele CPF.
async function montarGrupos(doc, porCpf) {
  const grupos = [];
  for (const [cpf, idxs] of porCpf.entries()) {
    const novo = await PDFDocument.create();
    const pgs = await novo.copyPages(doc, idxs);
    pgs.forEach(pg => novo.addPage(pg));
    const bytes = Buffer.from(await novo.save());
    grupos.push({ cpf, paginas: idxs.map(i => i + 1), pdfBase64: bytes.toString('base64'), tamanho: bytes.length });
  }
  return grupos;
}

module.exports = { cpfValido, cpfsDoTexto, analisarPaginas, dividirPorCpf };
