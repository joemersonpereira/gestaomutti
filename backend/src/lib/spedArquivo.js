// spedArquivo.js — inteligência do repositório SPED: lê o registro |0000| do arquivo gerado no Alpha
// e descobre sozinho o TIPO (Fiscal/EFD-ICMS-IPI × Contribuições/PIS-COFINS), a COMPETÊNCIA e o CNPJ
// (→ loja). Assim ninguém precisa preencher nada: o próprio arquivo diz o que é.
//
// Layout |0000|:
//   EFD ICMS/IPI (Fiscal):     |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|CNPJ|...   → DT_INI no campo 4
//   EFD Contribuições (PIS/COF):|0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANT|DT_INI|DT_FIN|NOME|CNPJ|... → DT_INI no campo 6
const soDigitos = s => String(s || '').replace(/\D/g, '');
const ehDataSped = s => /^\d{8}$/.test(String(s || '').trim()); // DDMMAAAA

// dados = string (conteúdo do .txt) OU Buffer
function parseSpedHeader(dados) {
  const txt = Buffer.isBuffer(dados) ? dados.toString('latin1') : String(dados || '');
  const linha = (txt.split(/\r?\n/).find(l => /^\|?0000\|/.test(l.trim())) || '').trim();
  if (!linha) return { ok: false, erro: 'Arquivo não parece um SPED (sem registro 0000).' };
  const c = linha.replace(/^\|/, '').replace(/\|$/, '').split('|'); // c[0]='0000'
  // acha o DT_INI (primeira data DDMMAAAA depois do campo 2) e descobre o tipo pela posição
  let idxData = -1;
  for (let i = 3; i < c.length; i++) { if (ehDataSped(c[i])) { idxData = i; break; } }
  if (idxData < 0) return { ok: false, erro: 'Não achei o período (DT_INI) no registro 0000.' };
  const tipo = idxData === 3 ? 'fiscal' : 'contribuicoes'; // campo 3 (0-based) = 4º → Fiscal; senão Contribuições
  // finalidade do arquivo (campo logo após COD_VER): Fiscal COD_FIN / Contribuições TIPO_ESCRIT.
  // 0 = original → etapa "envio"; 1 = substituto/retificador → etapa "corrigido".
  const finalidade = String(c[2] || '').trim();
  const etapa = finalidade === '1' ? 'corrigido' : 'envio';
  const dtIni = c[idxData];
  const dtFin = ehDataSped(c[idxData + 1]) ? c[idxData + 1] : null;
  const mm = dtIni.slice(2, 4), aaaa = dtIni.slice(4, 8);
  const competencia = `${aaaa}-${mm}`;
  // CNPJ = primeiro campo com 14 dígitos depois da data
  let cnpj = null;
  for (let i = idxData + 2; i < c.length; i++) { const d = soDigitos(c[i]); if (d.length === 14) { cnpj = d; break; } }
  const nome = c[idxData + 2] || null; // NOME vem logo após DT_FIN (idxData=DT_INI, +1=DT_FIN, +2=NOME)
  const fmt = d => d ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}` : null;
  return { ok: true, tipo, competencia, cnpj, nome, finalidade, etapa, dtIni: fmt(dtIni), dtFin: fmt(dtFin) };
}

// ── Classificador de erros do retorno da contabilidade (forma o "banco de correção") ──────────
// Recebe uma linha de erro escrita pela contabilidade e descobe a CATEGORIA + o REGISTRO SPED,
// pra agrupar e medir recorrência. É palpite por palavra-chave; a pessoa pode corrigir na tela.
const REGRAS_ERRO = [
  { cat: 'NF de entrada não lançada', reg: 'C100', re: /lan[çc]a|falta.*(nota|nf)|(nota|nf).*(falta|pendente)|manifest|desconhec|escritur/i },
  { cat: 'Cadastro de fornecedor (IE/endereço)', reg: '0150', re: /inscri[çc][aã]o\s*estadual|\bIE\b|0150|endere[çc]o|cadastro.*fornecedor|fornecedor.*cadastro/i },
  { cat: 'CST / CFOP divergente', reg: 'C170', re: /\bcst\b|\bcfop\b|tributa[çc]|c170|natureza.*opera/i },
  { cat: 'Inventário / Bloco H', reg: 'H010', re: /invent[aá]rio|bloco\s*h|estoque\s*(negativo|final|inicial)|h010/i },
  { cat: 'Unidade de medida', reg: '0190', re: /unidade\s*de\s*medida|0190|\bun\b.*diverg|convers[aã]o/i },
  { cat: 'NCM / produto', reg: '0200', re: /\bncm\b|0200|cadastro.*produto|produto.*cadastro|cest/i },
  { cat: 'Energia / Água / Comunicação', reg: 'C500', re: /energia|\bc500\b|\[água\]|\bágua\b|comunica[çc]|nfcom|telefon/i },
  { cat: 'Conhecimento de transporte (CT-e)', reg: 'D100', re: /\bct-?e\b|conhecimento.*transporte|frete|d100/i },
  { cat: 'Devolução', reg: 'C100', re: /devolu[çc]/i },
  { cat: 'PIS / COFINS', reg: 'M', re: /\bpis\b|\bcofins\b|contribui[çc][aã]o|cr[eé]dito.*(pis|cofins)/i },
  { cat: 'Valores / totais divergentes', reg: '', re: /valor.*diverg|total.*diverg|diferen[çc]a.*valor|soma/i },
];
function classificarErroSped(texto) {
  const t = String(texto || '');
  for (const r of REGRAS_ERRO) if (r.re.test(t)) return { categoria: r.cat, registro: r.reg };
  return { categoria: 'Outro', registro: '' };
}
// extrai uma referência (nº de NF / chave de 44 dígitos) do texto, se houver
function referenciaErro(texto) {
  const t = String(texto || '');
  const chave = t.match(/\b\d{44}\b/); if (chave) return chave[0];
  const nf = t.match(/\b(?:nf|nota|n[ºo.]*)\s*[:nº.]*\s*(\d{3,9})\b/i); if (nf) return nf[1];
  return null;
}
// quebra o texto colado (ou conteúdo de arquivo) em linhas de erro aproveitáveis
function linhasDeErro(texto) {
  return String(texto || '').split(/\r?\n/).map(l => l.trim())
    .filter(l => l.length >= 5 && !/^[-=_*#.\s]+$/.test(l));
}

// ── Verificador automático: roda no upload do SPED e acha sozinho os erros das categorias que a
// contabilidade JÁ devolveu antes (o banco de correção "ensina" o que procurar). Só checa o que dá
// pra ler estruturalmente do arquivo. `categoriasAtivas` = Set das categorias recorrentes.
function verificarSped(dados, categoriasAtivas) {
  const ativa = c => !categoriasAtivas || categoriasAtivas.has(c);
  const txt = Buffer.isBuffer(dados) ? dados.toString('latin1') : String(dados || '');
  const linhas = txt.split(/\r?\n/);
  const achados = [];
  const CAT_IE = 'Cadastro de fornecedor (IE/endereço)';
  const CAT_H = 'Inventário / Bloco H';
  let semIE = 0, negativos = 0;
  for (const raw of linhas) {
    const l = raw.trim(); if (!l) continue;
    const c = l.replace(/^\|/, '').split('|'); // c[0]=registro
    const reg = c[0];
    // 0150 fornecedor com CNPJ e SEM inscrição estadual (vira não-contribuinte → erro no SPED)
    if (reg === '0150' && ativa(CAT_IE)) {
      const nome = c[2], cnpj = soDigitos(c[4]), ie = String(c[6] || '').trim();
      if (cnpj.length === 14 && !ie && semIE < 300) {
        semIE++;
        achados.push({ categoria: CAT_IE, registro: '0150', descricao: `Fornecedor sem inscrição estadual: ${nome || '?'} (CNPJ ${cnpj})`, referencia: cnpj });
      }
    }
    // H010 item do inventário com quantidade negativa
    if (reg === 'H010' && ativa(CAT_H)) {
      const qtd = parseFloat(String(c[3] || '').replace(',', '.'));
      if (qtd < 0 && negativos < 300) {
        negativos++;
        achados.push({ categoria: CAT_H, registro: 'H010', descricao: `Estoque negativo no inventário: item ${c[1]} (qtd ${c[3]})`, referencia: c[1] });
      }
    }
  }
  return achados;
}

// extrai as chaves de acesso (44 díg) das NOTAS DE ENTRADA escrituradas no SPED (registro C100,
// IND_OPER=0 = entrada). É o que se compara com o Espião pra achar "NF não lançada".
function chavesEntradaSped(dados) {
  const txt = Buffer.isBuffer(dados) ? dados.toString('latin1') : String(dados || '');
  const set = new Set();
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l.startsWith('|C100|') && !l.startsWith('C100|')) continue;
    const c = l.replace(/^\|/, '').split('|'); // c[0]=C100, c[1]=IND_OPER, ... c[8]=CHV_NFE
    if (c[1] !== '0') continue; // só entradas
    const chv = String(c[8] || '').replace(/\D/g, '');
    if (chv.length === 44) set.add(chv);
  }
  return set;
}

module.exports = { parseSpedHeader, soDigitos, classificarErroSped, referenciaErro, linhasDeErro, verificarSped, chavesEntradaSped };
