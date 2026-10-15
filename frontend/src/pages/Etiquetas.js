import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const money = n => (Number(n) || 0).toFixed(2).replace('.', ',');
const splitPreco = n => { const [r, c] = (Number(n) || 0).toFixed(2).split('.'); return { r, c }; };
const esc = s => (s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';

function validadeTexto(inicio, fim) {
  const i = dataBR(inicio), f = dataBR(fim);
  if (!f) return '';
  if (!i || i === f) return `SOMENTE NO DIA ${f}`;
  return `DE ${i} A ${f}`;
}

// Tamanhos (sempre A4). 6 por folha (plaquinha) e 2 por folha (cestão) são os padrões Mutti.
const SIZES = {
  '6': { cols: 2, rows: 3, label: '6 por folha (plaquinha)' },
  '2': { cols: 1, rows: 2, label: '2 por folha (cestão)' },
  '4': { cols: 2, rows: 2, label: '4 por folha' },
  '1': { cols: 1, rows: 1, label: '1 por folha (A4 cheio)' },
};

// HTML de UMA etiqueta. Se o tema tiver imagem de fundo (bgImage), sobrepõe o texto; senão, estilo CSS 7.7.
function tagHTML(it, cfg, validade) {
  const { r, c } = splitPreco(it.por);
  const p1 = cfg.corPrimaria || '#F26722', p2 = cfg.corSecundaria || '#1E8449', cp = cfg.corPreco || p1;
  const val = (cfg.textoValidade || 'VÁLIDO {validade} OU ENQUANTO DURAR O ESTOQUE').replace('{validade}', validade || '');
  const de = cfg.mostrarDe && it.de > 0 ? `<span class="de">DE R$ <s>${money(it.de)}</s></span>` : '';

  if (cfg.bgImage) {
    // Tema enviado pelo Marketing: só sobrepõe os campos variáveis sobre a arte.
    const P = cfg.pos || {};
    const box = (k, def) => { const p = P[k] || def; return `top:${p.t};left:${p.l};right:${p.r != null ? p.r : 'auto'};${p.w ? 'width:' + p.w + ';' : ''}text-align:${p.a || 'center'};font-size:${p.fs}cqw;`; };
    return `<div class="tag bg" style="background-image:url('${cfg.bgImage}')">
      <div class="ov nome-ov" style="${box('nome', { t: '24%', l: '4%', r: '4%', a: 'center', fs: 7 })}">${esc(it.nome)}${it.unidade ? `<div style="font-size:0.6em">${esc(it.unidade)}</div>` : ''}</div>
      ${de ? `<div class="ov" style="${box('de', { t: '43%', l: '5%', r: 'auto', a: 'left', fs: 3.6 })}"><s>DE R$ ${money(it.de)}</s></div>` : ''}
      <div class="ov" style="${box('preco', { t: '46%', l: '28%', r: '4%', a: 'center', fs: 30 })};color:${cp};font-weight:900;line-height:.85">${r}<span style="font-size:.5em">,${c}</span></div>
      <div class="ov" style="${box('validade', { t: '90%', l: '8%', r: '4%', a: 'center', fs: 2.6 })}">${esc(validade || '')}</div>
    </div>`;
  }
  // Estilo built-in 7.7 (fundo branco + faixas + preço contornado).
  return `<div class="tag s77" style="--p1:${p1};--p2:${p2}">
    <div class="deco"></div>
    <div class="top">
      <div class="badge">${esc(cfg.badge || 'OFERTAS')}</div>
      <div class="slogan"><b style="color:${p2}">Farmácia </b><b style="color:${p1}">Mutti</b><br><span>${esc(cfg.slogan || '')}</span></div>
    </div>
    <div class="nome">${esc(it.nome)}</div>${it.unidade ? `<div class="unid">${esc(it.unidade)}</div>` : ''}
    <div class="precos">
      <div class="left">${de}<div class="por">POR R$</div></div>
      <div class="preco" style="color:${cp}"><span class="reais">${r}</span><span class="cent">,${c}</span><span class="cada">${esc(cfg.sufixo || 'cada')}</span></div>
    </div>
    <div class="rodape">${esc(val)}</div>
  </div>`;
}

const CSS = (sz) => `
  * { box-sizing:border-box; margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size: A4; margin: 0; }
  body { background:#eee; }
  .pagina { width:210mm; height:297mm; background:#fff; display:grid; grid-template-columns:repeat(${sz.cols},1fr); grid-template-rows:repeat(${sz.rows},1fr); gap:2mm; padding:4mm; page-break-after:always; }
  .tag { container-type:size; position:relative; overflow:hidden; border-radius:2mm; background:#fff; }
  .tag.bg { background-size:100% 100%; background-repeat:no-repeat; }
  .ov { position:absolute; font-weight:900; color:#111; text-transform:uppercase; line-height:1; }
  /* estilo 7.7 */
  .s77 { border:2mm solid var(--p1); display:flex; flex-direction:column; padding:3.5cqw 4cqw; }
  .s77 .top { display:flex; justify-content:space-between; align-items:flex-start; gap:2cqw; z-index:2; }
  .s77 .badge { background:var(--p1); color:#fff; font-weight:900; font-size:9cqw; padding:1cqw 2.5cqw; border-radius:2cqw; line-height:1; box-shadow:0 0.5cqw 1cqw rgba(0,0,0,.2); }
  .s77 .slogan { text-align:right; font-size:3.2cqw; line-height:1.1; }
  .s77 .slogan span { color:#333; font-weight:700; }
  .s77 .nome { text-align:center; font-weight:900; color:#111; text-transform:uppercase; font-size:8.5cqw; line-height:1.02; margin-top:3cqw; z-index:2; }
  .s77 .unid { text-align:center; font-weight:800; color:#333; font-size:4.6cqw; margin-top:1cqw; }
  .s77 .precos { margin-top:auto; display:flex; align-items:center; gap:2cqw; z-index:2; }
  .s77 .left { display:flex; flex-direction:column; }
  .s77 .de { color:#444; font-weight:700; font-size:4.5cqw; margin-bottom:1cqw; }
  .s77 .por { background:var(--p1); color:#fff; font-weight:900; font-size:6.5cqw; padding:1cqw 2.5cqw; border-radius:1.5cqw; text-align:center; line-height:1; }
  .s77 .preco { font-weight:900; line-height:.82; display:flex; align-items:flex-start;
     text-shadow:0.25cqw 0 #fff,-0.25cqw 0 #fff,0 0.25cqw #fff,0 -0.25cqw #fff,0.4cqw 0.4cqw 0 rgba(0,0,0,.15); margin-left:auto; }
  .s77 .preco .reais { font-size:34cqw; }
  .s77 .preco .cent { font-size:15cqw; margin-top:1cqw; }
  .s77 .preco .cada { font-size:6cqw; align-self:flex-end; color:var(--p1); font-weight:800; margin-left:0.5cqw; text-shadow:none; }
  .s77 .rodape { background:#F6C445; color:#7a4a00; font-weight:800; font-size:3cqw; text-align:center; padding:1.5cqw; border-radius:1.5cqw; margin-top:2cqw; z-index:2; }
  .s77 .deco { position:absolute; top:0; left:0; right:0; height:14%; background:
     linear-gradient(115deg, var(--p1) 40%, transparent 40%), linear-gradient(65deg, var(--p1) 40%, transparent 40%);
     background-position:left top,right top; background-size:55% 100%,55% 100%; background-repeat:no-repeat; opacity:.9; }
  .s77 .deco:after { content:''; position:absolute; top:26%; left:0; right:0; height:35%; background:
     linear-gradient(115deg, var(--p2) 45%, transparent 45%), linear-gradient(65deg, var(--p2) 45%, transparent 45%);
     background-position:left top,right top; background-size:50% 100%,50% 100%; background-repeat:no-repeat; }
`;

export default function Etiquetas() {
  const { API, usuario } = useAuth();
  const gestaoMkt = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [temas, setTemas] = useState([]);
  const [temaId, setTemaId] = useState('');
  const [tam, setTam] = useState('6');
  const [fonte, setFonte] = useState('caderno');
  const [cadernos, setCadernos] = useState([]);
  const [cadernoId, setCadernoId] = useState('');
  const [validade, setValidade] = useState('');
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [gerenciar, setGerenciar] = useState(false);

  const carregarTemas = useCallback(() => API.get('/etiquetas/temas').then(r => { setTemas(r.data.temas || []); if (!temaId && r.data.temas?.[0]) setTemaId(r.data.temas[0].id); }).catch(() => {}), [API, temaId]);
  useEffect(() => {
    API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/etiquetas/cadernos').then(r => setCadernos(r.data.cadernos || [])).catch(e => setErro(e.response?.data?.erro || ''));
    carregarTemas();
  }, [API, carregarTemas]);

  const tema = temas.find(t => t.id === temaId);
  const cfg = tema?.config || {};
  // Ao escolher um tema, adota o tamanho de folha que ele foi desenhado (o Marketing definiu ao subir a arte).
  useEffect(() => { if (cfg.tamPadrao && SIZES[cfg.tamPadrao]) setTam(cfg.tamPadrao); }, [cfg.tamPadrao]);

  const carregarCaderno = useCallback((id) => {
    if (!id) { setItens([]); return; }
    API.get(`/etiquetas/caderno/${id}`, { params: { loja: loja || undefined } }).then(r => {
      setValidade(validadeTexto(r.data.caderno?.inicio, r.data.caderno?.validade));
      setItens((r.data.itens || []).map(i => ({ ...i, sel: true })));
    }).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar caderno.'));
  }, [API, loja]);
  const buscar = () => API.get('/etiquetas/buscar', { params: { q: busca, loja: loja || undefined } }).then(r => setItens(prev => [...prev, ...(r.data.itens || []).map(i => ({ ...i, sel: true }))]));
  const upd = (idx, k, v) => setItens(its => its.map((x, i) => i === idx ? { ...x, [k]: v } : x));
  const selecionados = itens.filter(i => i.sel && i.por > 0);

  const imprimir = () => {
    if (!selecionados.length || !tema) return;
    const sz = SIZES[tam]; const perPage = sz.cols * sz.rows;
    let paginas = '';
    for (let i = 0; i < selecionados.length; i += perPage) {
      paginas += `<div class="pagina">${selecionados.slice(i, i + perPage).map(it => tagHTML(it, cfg, validade)).join('')}</div>`;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>${CSS(sz)}</style></head>
      <body>${paginas}<script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  return (
    <div style={s.wrap}>
      <Banner emoji="🏷️" titulo="Etiquetas de Preço" cor="laranja" sub="Gere as placas de oferta a partir do caderno do ERP (ou busca), escolha o tema e o tamanho (folha A4) e imprima." />

      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">🏬 Minha loja</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          <select value={temaId} onChange={e => setTemaId(e.target.value)} style={s.inp}>{temas.map(t => <option key={t.id} value={t.id}>🎨 {t.nome}</option>)}</select>
          <select value={tam} onChange={e => setTam(e.target.value)} style={s.inp}>{Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          {gestaoMkt && <button onClick={() => setGerenciar(true)} style={s.btnMini}>🎨 Gerenciar temas</button>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['caderno', '📓 Caderno de oferta'], ['busca', '🔎 Buscar produto']].map(([v, l]) => <button key={v} onClick={() => setFonte(v)} style={{ ...s.chip, ...(fonte === v ? s.chipOn : {}) }}>{l}</button>)}
          {fonte === 'caderno' && <select value={cadernoId} onChange={e => { setCadernoId(e.target.value); carregarCaderno(e.target.value); }} style={{ ...s.inp, minWidth: 280 }}><option value="">Selecione o caderno…</option>{cadernos.map(c => <option key={c.id} value={c.id}>{c.nome} · val {dataBR(c.validade)} ({c.itens})</option>)}</select>}
          {fonte === 'busca' && <form onSubmit={e => { e.preventDefault(); buscar(); }} style={{ display: 'flex', gap: 6 }}><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome ou código de barras" style={{ ...s.inp, width: 260 }} /><button style={s.btn}>Adicionar</button></form>}
        </div>
        <div style={{ marginTop: 10 }}><label style={{ fontSize: 12, color: '#666' }}>Validade na placa:<input value={validade} onChange={e => setValidade(e.target.value)} placeholder="ex: SOMENTE NO DIA 7/7/2026" style={{ ...s.inp, width: 300, marginLeft: 6 }} /></label></div>
      </div>
      {erro && <div style={{ ...s.card, color: '#C0392B' }}>⚠️ {erro}</div>}

      {itens.length > 0 && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{selecionados.length} etiqueta(s) · {SIZES[tam].label}</div>
            <button onClick={imprimir} disabled={!selecionados.length} style={s.btn}>🖨️ Imprimir / PDF</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}><thead><tr>{['', 'Nome (editável)', 'Apresentação', 'De R$', 'Por R$'].map((h, i) => <th key={i} style={{ ...s.th, textAlign: i > 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{itens.map((it, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid #f0f0f0', opacity: it.sel ? 1 : 0.5 }}>
                  <td style={s.td}><input type="checkbox" checked={it.sel} onChange={e => upd(idx, 'sel', e.target.checked)} /></td>
                  <td style={s.td}><input value={it.nome} onChange={e => upd(idx, 'nome', e.target.value)} style={{ ...s.inp, width: 240 }} />{it.abreviado && <span title={it.original} style={s.tag}>abreviado</span>}</td>
                  <td style={s.td}><input value={it.unidade} onChange={e => upd(idx, 'unidade', e.target.value)} style={{ ...s.inp, width: 120 }} /></td>
                  <td style={s.td}><input type="number" step="0.01" value={it.de || ''} onChange={e => upd(idx, 'de', Number(e.target.value))} style={{ ...s.inp, width: 90, textAlign: 'right' }} /></td>
                  <td style={s.td}><input type="number" step="0.01" value={it.por || ''} onChange={e => upd(idx, 'por', Number(e.target.value))} style={{ ...s.inp, width: 90, textAlign: 'right' }} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {selecionados.length > 0 && tema && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Prévia — {tema.nome}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {selecionados.slice(0, 3).map((it, i) => (
              <div key={i} style={{ width: 240, aspectRatio: tam === '2' ? '210/148' : '105/99' }}>
                <style>{CSS(SIZES[tam])}</style>
                <div dangerouslySetInnerHTML={{ __html: tagHTML(it, cfg, validade) }} />
              </div>
            ))}
          </div>
          {selecionados.length > 3 && <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>+{selecionados.length - 3} — todas entram na impressão ({Math.ceil(selecionados.length / (SIZES[tam].cols * SIZES[tam].rows))} folha(s) A4).</div>}
        </div>
      )}

      {gerenciar && <GerenciarTemas API={API} temas={temas} onClose={() => setGerenciar(false)} onSaved={() => { carregarTemas(); }} />}
    </div>
  );
}

function GerenciarTemas({ API, temas, onClose, onSaved }) {
  const [nome, setNome] = useState('');
  const [bgImage, setBgImage] = useState('');
  const [corPreco, setCorPreco] = useState('#F26722');
  const [textoValidade, setTextoValidade] = useState('VÁLIDO {validade} OU ENQUANTO DURAR O ESTOQUE');
  const [tamPadrao, setTamPadrao] = useState('6');
  const [msg, setMsg] = useState('');
  const onFile = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 4 * 1024 * 1024) { setMsg('Imagem muito grande (máx 4MB).'); return; } const rd = new FileReader(); rd.onload = () => setBgImage(rd.result); rd.readAsDataURL(f); };
  const salvar = () => {
    if (!nome) { setMsg('Dê um nome ao tema.'); return; }
    const config = { corPreco, mostrarDe: true, sufixo: 'cada', textoValidade, tamPadrao };
    if (bgImage) config.bgImage = bgImage;
    API.post('/etiquetas/temas', { nome, config }).then(() => { setMsg('✅ Tema salvo.'); setNome(''); setBgImage(''); onSaved(); });
  };
  const sz = SIZES[tamPadrao];
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>🎨 Gerenciar temas de etiqueta</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Temas atuais: {temas.map(t => t.nome).join(', ')}.</div>
        <div style={{ borderTop: '1px solid #eee', paddingTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Novo tema</div>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do tema (ex: 7.7 Julho)" style={s.inp} />
          <label style={{ fontSize: 12, color: '#666' }}>Quantas etiquetas por folha
            <select value={tamPadrao} onChange={e => setTamPadrao(e.target.value)} style={{ ...s.inp, display: 'block', marginTop: 4 }}>
              {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></label>
          <label style={{ fontSize: 12, color: '#666' }}>Arte de <b>UMA etiqueta</b> (o tamanho de 1 placa, <b>não</b> a folha inteira). O sistema <b>replica ela automaticamente</b> nas {sz.cols * sz.rows} da folha e sobrepõe nome, preço e validade.
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'block', marginTop: 4 }} /></label>
          {bgImage && (
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Prévia da folha A4 — a sua arte replicada nas {sz.cols * sz.rows} etiquetas:</div>
              <div style={{ width: 210 * 0.9, height: 297 * 0.9, background: '#fff', border: '1px solid #ddd', display: 'grid', gridTemplateColumns: `repeat(${sz.cols},1fr)`, gridTemplateRows: `repeat(${sz.rows},1fr)`, gap: '1.8mm', padding: '3.6mm' }}>
                {Array.from({ length: sz.cols * sz.rows }).map((_, i) => (
                  <div key={i} style={{ backgroundImage: `url('${bgImage}')`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', borderRadius: 3, position: 'relative' }}>
                    <span style={{ position: 'absolute', bottom: '6%', right: '6%', fontSize: 9, fontWeight: 900, color: corPreco }}>R$ 9,99</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#666' }}>Cor do preço <input type="color" value={corPreco} onChange={e => setCorPreco(e.target.value)} /></label>
          </div>
          <input value={textoValidade} onChange={e => setTextoValidade(e.target.value)} placeholder="Texto de validade ({validade})" style={s.inp} />
          <div style={{ fontSize: 11, color: '#999' }}>Sem imagem, usa o estilo 7.7 embutido. Com imagem, a arte é sua e o sistema só preenche os dados (nome, preço, validade) em cima.</div>
          {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#2E6B45' : '#C0392B' }}>{msg}</div>}
          <button onClick={salvar} style={s.btn}>Salvar tema</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1360, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { fontSize: 11, textTransform: 'uppercase', color: '#999', padding: '8px 8px', borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', color: '#333' },
  tag: { fontSize: 10, background: '#FCF3E2', color: '#B7791F', borderRadius: 8, padding: '2px 6px', marginLeft: 6 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' },
};
