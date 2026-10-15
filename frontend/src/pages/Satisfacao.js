import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const COR = { azul: '#185FA5', ok: '#3B6D11', warn: '#B8860B', bad: '#993C1D' };
const corNota = n => n == null ? '#999' : n >= 85 ? COR.ok : n >= 70 ? COR.warn : COR.bad;

export default function Satisfacao() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    if (ehGestao) API.get('/referencias/lojas').then(r => {
      const ls = r.data.lojas || []; setLojas(ls);
      setLojaId(id => id || (ls[0] && ls[0].id) || '');
    });
  }, [API, ehGestao]);

  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/satisfacao/resumo', { params: { loja_id: lojaId } }).then(r => setResumo(r.data)).catch(() => setResumo(null));
  }, [API, lojaId]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t); }, [carregar]);

  const lojaNome = (lojas.find(l => l.id === lojaId) || {}).nome || usuario.loja || '';
  const urlPublica = `${window.location.origin}/avaliar?loja=${lojaId}`;

  function imprimir() {
    const svg = document.getElementById('qr-loja');
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>QR ${lojaNome}</title></head>
      <body style="font-family:system-ui;text-align:center;padding:40px">
      <h1 style="color:#185FA5">${lojaNome}</h1>
      <h3>Avalie nosso atendimento 💚</h3>
      <div>${svg.outerHTML}</div>
      <p style="font-size:18px;margin-top:16px">Aponte a câmera do celular para o QR code</p>
      </body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300);
  }

  const card = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>⭐ Pesquisa de Satisfação</div>
          <div style={{ fontSize: 13, color: '#999' }}>O cliente escaneia o QR e avalia a loja · alimenta o indicador do gerente</div>
        </div>
        {ehGestao && lojas.length > 0 && (
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 }}>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 16 }}>
        {/* QR da loja */}
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>QR code da {lojaNome}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Imprima e deixe no balcão / caixa</div>
          <div style={{ display: 'inline-block', padding: 14, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
            {lojaId && <QRCodeSVG id="qr-loja" value={urlPublica} size={190} level="M" includeMargin />}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={imprimir} style={{ background: COR.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>🖨️ Imprimir QR</button>
            <button onClick={() => { navigator.clipboard?.writeText(urlPublica); }} style={{ background: '#eef2f6', color: '#334', border: '1px solid #dde', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>📋 Copiar link</button>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 10, wordBreak: 'break-all' }}>{urlPublica}</div>
        </div>

        {/* Resultado */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Resultado do mês</div>
          {!resumo || !resumo.total ? (
            <div style={{ color: '#999', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Ainda sem avaliações neste mês.<br />Divulgue o QR code no balcão. 🙂</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 44, fontWeight: 800, color: corNota(resumo.nota100) }}>{resumo.nota100}<span style={{ fontSize: 16, color: '#999' }}>/100</span></div>
                <div style={{ fontSize: 18 }}>{'★'.repeat(Math.round(resumo.media))}<span style={{ color: '#ddd' }}>{'★'.repeat(5 - Math.round(resumo.media))}</span> <span style={{ fontSize: 13, color: '#777' }}>{resumo.media} · {resumo.total} avaliaç{resumo.total > 1 ? 'ões' : 'ão'}</span></div>
              </div>
              <div style={{ marginTop: 12 }}>
                {resumo.distribuicao.map(d => (
                  <div key={d.estrela} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}>
                    <span style={{ fontSize: 12, width: 26, color: '#666' }}>{d.estrela}★</span>
                    <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${resumo.total ? (d.n / resumo.total) * 100 : 0}%`, background: d.estrela >= 4 ? COR.ok : d.estrela === 3 ? COR.warn : COR.bad }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#999', width: 24, textAlign: 'right' }}>{d.n}</span>
                  </div>
                ))}
              </div>
              {resumo.comentarios.length > 0 && (
                <div style={{ marginTop: 14, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>Comentários recentes</div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {resumo.comentarios.map((c, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f7f7f7' }}>
                        <span style={{ color: c.nota >= 4 ? COR.ok : c.nota === 3 ? COR.warn : COR.bad }}>{'★'.repeat(c.nota)}</span> {c.comentario}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <VendedoresSatisfacao API={API} lojaId={lojaId} card={card} />
      <GamificacaoAvaliacoes API={API} lojaId={lojaId} ehGestao={ehGestao} card={card} />
    </div>
  );
}

// 🏆 Gamificação — pontos por avaliação coletada (incentiva o vendedor a PEDIR que o cliente avalie)
function GamificacaoAvaliacoes({ API, lojaId, ehGestao, card }) {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState({ pontosPorAvaliacao: 0, pontosTop: 0, metaMes: 0 });
  const [msg, setMsg] = useState('');
  const [porLoja, setPorLoja] = useState(false); // false = rede toda
  const carregar = useCallback(() => {
    API.get('/satisfacao/gamificacao', { params: porLoja && lojaId ? { loja_id: lojaId } : {} })
      .then(r => { setD(r.data); if (r.data.config) setCfg(r.data.config); }).catch(() => setD(false));
  }, [API, lojaId, porLoja]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = () => API.put('/satisfacao/gamificacao/config', cfg).then(() => { setMsg('✅ Regras salvas.'); carregar(); setTimeout(() => setMsg(''), 2500); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const premiar = () => {
    if (!d) return; setMsg('Premiando…');
    API.post('/satisfacao/gamificacao/premiar', { ano: d.ano, mes: d.mes, loja_id: porLoja ? lojaId : null })
      .then(r => setMsg(r.data.ok ? `✅ ${r.data.premiados} vendedor(es) premiados (+${r.data.pontosTotal} pts).${r.data.campeao ? ' Campeão: ' + r.data.campeao.nome + '.' : ''}` : '⚠️ ' + r.data.erro))
      .then(() => setTimeout(() => setMsg(''), 4000)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const vend = d?.vendedores || [];
  const max = vend[0]?.avaliacoes || 1;
  const COLS = [
    { k: 'nome', label: 'Vendedor', get: v => v.nome || '', tipo: 'txt' },
    { k: 'loja', label: 'Loja', get: v => v.loja || '', tipo: 'txt' },
    { k: 'avaliacoes', label: 'Avaliações', get: v => v.avaliacoes || 0, tipo: 'num', right: true },
    { k: 'media', label: 'Média', get: v => v.media || 0, tipo: 'num', right: true },
    ...(cfg.metaMes ? [{ k: 'meta', label: 'Meta', get: v => v.avaliacoes || 0, tipo: 'num', right: true }] : []),
    ...(cfg.pontosPorAvaliacao ? [{ k: 'pontos', label: 'Pontos', get: v => v.pontos || 0, tipo: 'num', right: true }] : []),
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(vend, COLS, { col: 'avaliacoes', dir: 'desc' });
  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>🏆 Gamificação — avaliações coletadas</div>
          <div style={{ fontSize: 12, color: '#999' }}>Cada avaliação que o cliente deixa vale pontos pro vendedor. Incentive a equipe a <b>pedir a avaliação</b>! 💚</div>
        </div>
        {ehGestao && lojaId && <label style={{ fontSize: 11.5, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={porLoja} onChange={e => setPorLoja(e.target.checked)} /> só esta loja</label>}
      </div>

      {ehGestao && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', background: '#F7F9FB', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
        <label style={sG.fld}>Pontos por avaliação<input type="number" min="0" value={cfg.pontosPorAvaliacao} onChange={e => setCfg({ ...cfg, pontosPorAvaliacao: e.target.value })} style={sG.inp} /></label>
        <label style={sG.fld}>Bônus do campeão do mês<input type="number" min="0" value={cfg.pontosTop} onChange={e => setCfg({ ...cfg, pontosTop: e.target.value })} style={sG.inp} /></label>
        <label style={sG.fld}>Meta de avaliações/mês<input type="number" min="0" value={cfg.metaMes} onChange={e => setCfg({ ...cfg, metaMes: e.target.value })} style={sG.inp} /></label>
        <button onClick={salvar} style={sG.btn}>Salvar regras</button>
        <button onClick={premiar} style={{ ...sG.btn, background: '#B7791F' }} title="Credita os pontos do mês (idempotente)">🎁 Premiar o mês</button>
        <span style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12, color: msg.startsWith('⚠️') ? '#C0392B' : '#1E874B' }}>{msg}</span>
      </div>}

      {d && d.total > 0 && <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{d.total} avaliações coletadas em {String(d.mes).padStart(2, '0')}/{d.ano} {porLoja ? 'nesta loja' : 'na rede'}.</div>}
      {!vend.length ? <div style={{ fontSize: 13, color: '#aaa', padding: '10px 0' }}>Ainda sem avaliações com vendedor identificado neste mês. Peça aos vendedores para divulgar o QR! 🙂</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th style={sG.th}>#</th>
              <ThOrd c={COLS[0]} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} />
              <ThOrd c={COLS[1]} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} />
              <ThOrd c={COLS[2]} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} />
              <th style={sG.th}></th>
              <ThOrd c={COLS[3]} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} />
              {cfg.metaMes ? <ThOrd c={COLS.find(c => c.k === 'meta')} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} /> : null}
              {cfg.pontosPorAvaliacao ? <ThOrd c={COLS.find(c => c.k === 'pontos')} ordem={ordem} clicar={clicar} seta={seta} base={sG.th} /> : null}
            </tr></thead>
            <tbody>{linhas.map((v, i) => (
              <tr key={v.id} style={{ borderTop: '1px solid #f2f2f2', background: i === 0 ? '#FFFDF3' : '#fff' }}>
                <td style={{ ...sG.td, color: '#999' }}>{i === 0 ? '🏆' : i + 1}</td>
                <td style={{ ...sG.td, fontWeight: 600 }}>{v.nome}</td>
                <td style={{ ...sG.td, color: '#888' }}>{v.loja}</td>
                <td style={{ ...sG.td, textAlign: 'right', fontWeight: 700 }}>{v.avaliacoes}</td>
                <td style={{ ...sG.td, width: 120 }}><div style={{ background: '#EEF3FB', borderRadius: 5, height: 8 }}><div style={{ width: `${Math.round(100 * v.avaliacoes / max)}%`, height: '100%', background: i === 0 ? '#B7791F' : '#2E5C9E', borderRadius: 5 }} /></div></td>
                <td style={{ ...sG.td, textAlign: 'right', color: '#666' }}>{v.media != null ? '★ ' + v.media : '—'}</td>
                {cfg.metaMes ? <td style={{ ...sG.td, textAlign: 'right' }}>{v.bateuMeta ? <span style={{ color: '#1E874B', fontWeight: 700 }}>✓</span> : <span style={{ color: '#C0392B' }}>{v.avaliacoes}/{cfg.metaMes}</span>}</td> : null}
                {cfg.pontosPorAvaliacao ? <td style={{ ...sG.td, textAlign: 'right', color: '#B7791F', fontWeight: 700 }}>{v.pontos}</td> : null}
              </tr>))}</tbody>
          </table>
        </div>}
      <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>💡 Os pontos entram na loja de pontos (viram brinde). "Premiar o mês" credita uma vez por mês (não duplica). A avaliação é atribuída ao vendedor quando o cliente informa o CPF e há um único vendedor no dia.</div>
    </div>
  );
}
const sG = {
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '6px 8px', fontSize: 13, width: 90 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
};

function VendedoresSatisfacao({ API, lojaId, card }) {
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(null); // vendedor com QR aberto
  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/satisfacao/vendedores', { params: { loja_id: lojaId } }).then(r => setLista(r.data.vendedores || [])).catch(() => setLista([]));
  }, [API, lojaId]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t); }, [carregar]);

  function imprimirVend(v) {
    const url = `${window.location.origin}/avaliar-vendedor?v=${v.id}`;
    const holder = document.getElementById(`qrv-${v.id}`);
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>QR ${v.nome}</title></head>
      <body style="font-family:system-ui;text-align:center;padding:40px">
      <h1 style="color:#185FA5">${v.nome}</h1><h3>Avalie meu atendimento 💚</h3>
      <div>${holder ? holder.innerHTML : ''}</div>
      <p style="font-size:18px;margin-top:16px">Aponte a câmera do celular para o QR code</p>
      <p style="font-size:13px;color:#666">${url}</p></body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 300);
  }

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Satisfação por vendedor</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Cada vendedor tem seu QR. O cliente avalia o atendimento e só conta quando a compra dele com aquele vendedor é confirmada no caixa.</div>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar vendedor pelo nome…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 }} />
      {lista.length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Nenhum vendedor nesta loja.</div>}
      {lista.filter(v => v.nome.toLowerCase().includes(busca.toLowerCase().trim())).map(v => (
        <div key={v.id} style={{ borderTop: '1px solid #f2f2f2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{v.nome}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{v.avaliacoes} aval.{v.pendentes_hoje > 0 ? ` · ${v.pendentes_hoje} pend.` : ''}</div>
            <div style={{ fontSize: 18, fontWeight: 800, minWidth: 54, textAlign: 'right', color: corNota(v.nota100) }}>{v.nota100 == null ? '—' : v.nota100}</div>
            <button onClick={() => setSel(sel === v.id ? null : v.id)} style={{ fontSize: 12, background: '#eef2f6', color: '#334', border: '1px solid #dde', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>{sel === v.id ? 'Fechar' : 'QR'}</button>
          </div>
          {sel === v.id && (
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <div id={`qrv-${v.id}`} style={{ display: 'inline-block', padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
                <QRCodeSVG value={`${window.location.origin}/avaliar-vendedor?v=${v.id}`} size={170} level="M" includeMargin />
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => imprimirVend(v)} style={{ background: COR.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>🖨️ Imprimir crachá/QR</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
