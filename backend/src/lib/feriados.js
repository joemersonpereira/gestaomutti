// feriados.js — feriados brasileiros (nacionais fixos + móveis por Páscoa) + Bahia, para contar
// DIAS ÚTEIS (ignora sábado, domingo e feriado). Usado no índice de conciliação bancária.
// Os feriados são CALCULADOS (não valor fixo no código): fixos por regra + móveis pela Páscoa.

// Domingo de Páscoa (algoritmo de Gauss / Meeus) para um ano.
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
function addDias(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function iso(d) { return d.toISOString().slice(0, 10); }

// Conjunto de feriados (YYYY-MM-DD) do ano: nacionais fixos + móveis + Bahia (02/07).
function feriadosBR(ano) {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25', '07-02'];
  const s = new Set(fixos.map(md => `${ano}-${md}`));
  const p = pascoa(ano);
  s.add(iso(addDias(p, -47))); // Carnaval (terça)
  s.add(iso(addDias(p, -48))); // Carnaval (segunda)
  s.add(iso(addDias(p, -2)));  // Sexta-feira Santa
  s.add(iso(addDias(p, 60)));  // Corpus Christi
  return s;
}

// Dias ÚTEIS entre duas datas (exclui a inicial, inclui a final), sem sáb/dom/feriado.
// Se ate <= de, retorna 0. Datas em 'YYYY-MM-DD'. `extras` = Set/array de YYYY-MM-DD (ex.: municipais).
function diasUteisEntre(deStr, ateStr, extras) {
  if (!deStr || !ateStr) return null;
  const de = new Date(deStr + 'T00:00:00Z'), ate = new Date(ateStr + 'T00:00:00Z');
  if (!(ate > de)) return 0;
  const extraSet = extras instanceof Set ? extras : new Set(extras || []);
  const feriados = {};
  const getFer = y => (feriados[y] || (feriados[y] = feriadosBR(y)));
  let n = 0; const d = new Date(de);
  while (true) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > ate) break;
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;            // domingo/sábado
    const s = iso(d);
    if (getFer(d.getUTCFullYear()).has(s) || extraSet.has(s)) continue; // feriado (calculado ou cadastrado)
    n++;
  }
  return n;
}

module.exports = { feriadosBR, diasUteisEntre, pascoa };
