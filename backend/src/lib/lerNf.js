// lerNf.js — lê um comprovante PDF (base64) e tenta identificar se é uma NOTA FISCAL,
// extraindo número, CNPJ e valor. Para PDFs DIGITAIS de NF/NFS-e/DANFE (com camada de texto)
// isso basta — não precisa de OCR de imagem.
//
// DEPLOY: a extração usa a lib Node `pdf-parse` (já nas dependências) → roda em QUALQUER servidor
// sem instalar nada no sistema. Se por algum motivo falhar, tenta o `pdftotext` (poppler) como
// reforço (local). Se o PDF for digitalizado (imagem, sem texto), aí sim precisaria de OCR de
// imagem (Tesseract/serviço) — fica para depois; neste caso retorna temTexto=false.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function soBase64(dados) { return String(dados || '').replace(/^data:[^;]+;base64,/, ''); }

// Node puro (portável): pdf-parse.
async function textoViaNode(buf) {
  try { const pdfParse = require('pdf-parse'); const d = await pdfParse(buf); return (d && d.text) || ''; }
  catch (e) { return ''; }
}
// Reforço local: pdftotext (poppler), se existir.
function textoViaPoppler(buf) {
  const tmp = path.join(os.tmpdir(), `nf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try { fs.writeFileSync(tmp, buf); return execFileSync(process.env.POPPLER_PDFTOTEXT || 'pdftotext', ['-layout', '-q', tmp, '-'], { maxBuffer: 20 * 1024 * 1024 }).toString('utf8'); }
  catch (e) { return ''; }
  finally { try { fs.unlinkSync(tmp); } catch { /* ok */ } }
}

async function textoDoPdf(dadosBase64) {
  const b64 = soBase64(dadosBase64); if (!b64) return '';
  const buf = Buffer.from(b64, 'base64');
  let txt = await textoViaNode(buf);
  if (!txt || txt.trim().length < 10) { const alt = textoViaPoppler(buf); if (alt && alt.trim().length > (txt || '').trim().length) txt = alt; }
  return txt || '';
}

function analisar(texto) {
  if (!texto || texto.trim().length < 10) return { ehNf: false, motivo: 'PDF sem texto (digitalizado?) — precisaria de OCR de imagem.' };
  const t = texto.replace(/\s+/g, ' ');
  const T = t.toUpperCase();
  const ehNf = /NOTA FISCAL|NFS-?E|NF-?E|DANFE|CHAVE DE ACESSO|NOTA FISCAL ELETR/i.test(T);
  const cnpj = (t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || t.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/) || [])[0] || null;
  const chave = (t.replace(/\D/g, '').match(/\d{44}/) || [])[0] || null;
  let numero = null;
  const mNum = t.match(/n[uú]mero\s+da\s+nota[^0-9]*(\d{3,})/i) || t.match(/n[ºo]\.?\s*(?:da\s*)?nota[^0-9]*(\d{3,})/i) || t.match(/\bNF-?e?\s*n?[ºo]?\s*[:.]?\s*(\d{3,})/i);
  if (mNum) numero = mNum[1];
  const mVal = t.match(/valor\s+(?:l[ií]quido|total|a ser pago|a pagar)[^\d]*([\d.]+,\d{2})/i) || t.match(/R\$\s*([\d.]+,\d{2})/);
  const valor = mVal ? (Number(mVal[1].replace(/\./g, '').replace(',', '.')) || null) : null;
  return { ehNf, cnpj, chave, numero, valor };
}

// OCR por VISÃO do Claude — para PDF-imagem (digitalizado/foto) que não tem camada de texto.
// Manda o PDF direto como "document" (deploy-proof, não depende de poppler no servidor) e pede
// SÓ um JSON com valor/CNPJ/fornecedor/número. Reaproveita a chave/infra da Rhia.
async function ocrViaClaude(b64) {
  if (!process.env.ANTHROPIC_API_KEY || !b64) return null;
  let rhia; try { rhia = require('./rhia'); } catch { return null; }
  const prompt = 'Esta é a imagem de um comprovante/nota fiscal brasileiro. Responda SOMENTE um JSON '
    + '{"ehNf":bool,"numero":string|null,"cnpj":string|null,"valor":number|null,"fornecedor":string|null}. '
    + 'valor = valor total numérico (ex: 169.09). cnpj com máscara. Se não for nota fiscal, ehNf=false.';
  try {
    const txt = await rhia.anthropic({ system: 'Você lê comprovantes e devolve só JSON.', maxTokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt },
      ] }] });
    const j = rhia.extrairJson ? rhia.extrairJson(txt) : JSON.parse(txt);
    if (!j) return null;
    return { ehNf: !!j.ehNf, numero: j.numero || null, cnpj: j.cnpj || null,
      valor: (j.valor != null && !isNaN(Number(j.valor))) ? Number(j.valor) : null,
      fornecedor: j.fornecedor || null, via_ocr: true };
  } catch (e) { return null; }
}

// OCR genérico de comprovante (IMAGEM ou PDF) → extrai valor/fornecedor/número via visão do Claude.
async function ocrComprovanteAny(dados, mime) {
  if (!process.env.ANTHROPIC_API_KEY || !dados) return null;
  let rhia; try { rhia = require('./rhia'); } catch { return null; }
  const b64 = soBase64(dados);
  const ehImg = (mime || '').startsWith('image/') || /^data:image\//i.test(String(dados));
  const block = ehImg
    ? { type: 'image', source: { type: 'base64', media_type: (mime && mime.startsWith('image/')) ? mime : 'image/jpeg', data: b64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  const prompt = 'Esta imagem pode ter UM ou VÁRIOS comprovantes brasileiros (depósitos, recargas, despesas ou notas). '
    + 'Liste o valor TOTAL de CADA comprovante separado que você ver (não some os itens internos de um mesmo documento). '
    + 'Responda SOMENTE um JSON {"valores":[number,...],"fornecedor":string|null,"numero":string|null,"ehNf":bool,"tipoDoc":string}. '
    + 'valores = lista com o total de cada comprovante (ex: [169.09, 50.00]); se só um, lista com um item; se não achar, []. '
    + 'ehNf = true SOMENTE se for NOTA FISCAL de verdade (NF-e, NFS-e, cupom fiscal/SAT, DANFE) — tem CNPJ do emitente e número da nota e/ou chave de acesso de 44 dígitos. '
    + 'Se for apenas recibo, comprovante de pagamento/PIX/depósito, ordem de serviço ou orçamento, ehNf=false. '
    + 'tipoDoc = um rótulo curto: "NF-e","NFS-e","Cupom fiscal","Recibo","Comprovante PIX","Comprovante depósito","Outro".';
  try {
    const txt = await rhia.anthropic({ system: 'Você lê comprovantes e devolve só JSON.', maxTokens: 400,
      messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] });
    const j = rhia.extrairJson ? rhia.extrairJson(txt) : JSON.parse(txt);
    if (!j) return null;
    let valores = Array.isArray(j.valores) ? j.valores.map(Number).filter(v => !isNaN(v) && v > 0) : [];
    if (!valores.length && j.valor != null && !isNaN(Number(j.valor))) valores = [Number(j.valor)]; // compat
    const soma = valores.reduce((a, v) => a + v, 0);
    return { valor: valores.length ? Math.round(soma * 100) / 100 : null, valores, n_valores: valores.length,
      fornecedor: j.fornecedor || null, numero: j.numero || null, ehNf: !!j.ehNf, tipoDoc: j.tipoDoc || null };
  } catch (e) { return null; }
}

async function lerComprovante(dadosBase64, { ocr = false } = {}) {
  const b64 = soBase64(dadosBase64);
  const texto = await textoDoPdf(dadosBase64);
  const temTexto = !!(texto && texto.trim());
  const base = { ...analisar(texto), temTexto };
  // Sem texto (imagem) + OCR pedido → tenta ler pela visão do Claude.
  if (!temTexto && ocr) {
    const o = await ocrViaClaude(b64);
    if (o) return { ...base, ...o, temTexto: false };
  }
  return base;
}

// Lê um PDF direto do disco (pasta sincronizada do OneDrive). Retorna análise + base64 (para guardar).
async function lerArquivoPdf(caminho, opts = {}) {
  const buf = fs.readFileSync(caminho);
  const b64 = buf.toString('base64');
  const r = await lerComprovante(b64, opts);
  return { ...r, base64: b64 };
}

module.exports = { lerComprovante, textoDoPdf, analisar, lerArquivoPdf, ocrViaClaude, ocrComprovanteAny };
