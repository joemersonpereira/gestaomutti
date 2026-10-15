import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const TIPO_LABEL = { holerite: 'Holerite', informe: 'Informe de rendimento' };
const mascaraCpf = c => String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.$3-$4');
const ST = {
  ok: { txt: 'Será entregue', cor: '#3B6D11', bg: '#EAF3DE' },
  ja_existe: { txt: 'Já possui (será ignorado)', cor: '#8A6D1D', bg: '#FBF0DA' },
  nao_encontrado: { txt: 'CPF não cadastrado', cor: '#993C1D', bg: '#FCEBEB' },
  ambiguo: { txt: 'CPF em +1 cadastro', cor: '#993C1D', bg: '#FCEBEB' },
};

export default function DocumentosRH() {
  const { API } = useAuth();
  const [tipo, setTipo] = useState('holerite');
  const [competencia, setCompetencia] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [previa, setPrevia] = useState(null);
  const [msg, setMsg] = useState('');
  const [lotes, setLotes] = useState([]);

  const carregarLotes = useCallback(() => { API.get('/documentos/lotes').then(r => setLotes(r.data.lotes || [])).catch(() => {}); }, [API]);
  useEffect(() => { carregarLotes(); }, [carregarLotes]);

  const lerBase64 = file => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).replace(/^data:.*;base64,/, ''));
    fr.onerror = rej; fr.readAsDataURL(file);
  });

  async function analisar() {
    setMsg('');
    if (!arquivo) { setMsg('Selecione o PDF.'); return; }
    if (!competencia.trim()) { setMsg(tipo === 'informe' ? 'Informe o ano (ex.: 2025).' : 'Informe a competência (ex.: 2026-06).'); return; }
    setAnalisando(true); setPrevia(null);
    try {
      const base64 = await lerBase64(arquivo);
      const r = await API.post('/documentos/analisar', { tipo, competencia: competencia.trim(), arquivo_nome: arquivo.name, base64 });
      setPrevia(r.data);
    } catch (e) { setMsg(e.response?.data?.erro || 'Falha ao analisar o PDF.'); }
    finally { setAnalisando(false); }
  }

  async function confirmar() {
    if (!previa) return;
    try {
      const r = await API.post(`/documentos/lote/${previa.lote_id}/confirmar`, {});
      setMsg('✅ ' + r.data.mensagem);
      setPrevia(null); setArquivo(null); setCompetencia(''); carregarLotes();
    } catch (e) { setMsg(e.response?.data?.erro || 'Falha ao distribuir.'); }
  }
  async function cancelar() {
    if (!previa) return;
    try { await API.post(`/documentos/lote/${previa.lote_id}/cancelar`, {}); } catch { /* ignore */ }
    setPrevia(null);
  }

  const podeConfirmar = previa && previa.resumo.distribuir > 0;

  const COLS = [
    { k: 'paginas', label: 'Página(s)', get: i => (i.paginas || [])[0] || 0, tipo: 'num', center: true },
    { k: 'cpf', label: 'CPF', get: i => i.cpf || '', tipo: 'txt', center: true },
    { k: 'colaborador', label: 'Colaborador', get: i => i.colaborador_nome || '', tipo: 'txt' },
    { k: 'status', label: 'Situação', get: i => (ST[i.status] || ST.ok).txt, tipo: 'txt', center: true },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(previa?.itens, COLS, { col: 'paginas', dir: 'asc' });

  return (
    <div style={s.wrap}>
      <Banner emoji="📄" titulo="Holerites e informes (RH)" cor="azul" />
      <div style={s.sub}>Suba o PDF (individual ou lote). O sistema reconhece o CPF em cada página e distribui só as páginas de cada pessoa. <strong>Nada é entregue antes de você conferir a prévia.</strong></div>

      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.rot}>Tipo</label>
            <select style={s.campo} value={tipo} onChange={e => { setTipo(e.target.value); setPrevia(null); }}>
              <option value="holerite">Holerite (mês)</option>
              <option value="informe">Informe de rendimento (ano)</option>
            </select>
          </div>
          <div>
            <label style={s.rot}>{tipo === 'informe' ? 'Ano (ex.: 2025)' : 'Competência (ex.: 2026-06)'}</label>
            <input style={s.campo} value={competencia} onChange={e => setCompetencia(e.target.value)} placeholder={tipo === 'informe' ? '2025' : '2026-06'} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={s.rot}>Arquivo PDF</label>
            <input type="file" accept="application/pdf" onChange={e => { setArquivo(e.target.files[0]); setPrevia(null); }} style={{ fontSize: 12 }} />
          </div>
          <button style={s.btn} onClick={analisar} disabled={analisando}>{analisando ? 'Analisando…' : 'Analisar'}</button>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 10 }}>{msg}</div>}
      </div>

      {previa && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Prévia da distribuição</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>
            {previa.total_paginas} páginas · {previa.total_pessoas} CPF(s) reconhecido(s) ·
            <strong style={{ color: '#3B6D11' }}> {previa.resumo.distribuir} a entregar</strong>
            {previa.resumo.ja_existem > 0 && <span style={{ color: '#8A6D1D' }}> · {previa.resumo.ja_existem} já possuem</span>}
            {previa.resumo.nao_encontrados > 0 && <span style={{ color: '#993C1D' }}> · {previa.resumo.nao_encontrados} sem cadastro</span>}
            {previa.resumo.ambiguos > 0 && <span style={{ color: '#993C1D' }}> · {previa.resumo.ambiguos} ambíguos</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#f7f9fb' }}>
                {COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}
              </tr></thead>
              <tbody>
                {linhas.map((i, k) => {
                  const st = ST[i.status] || ST.ok;
                  return (
                    <tr key={k} style={{ borderTop: '1px solid #f2f2f2' }}>
                      <td style={s.tdc}>{(i.paginas || []).join(', ')}</td>
                      <td style={s.tdc}>{mascaraCpf(i.cpf)}</td>
                      <td style={{ padding: '6px' }}>{i.colaborador_nome || <span style={{ color: '#bbb' }}>—</span>}</td>
                      <td style={s.tdc}><span style={{ fontSize: 10, fontWeight: 700, color: st.cor, background: st.bg, padding: '2px 7px', borderRadius: 6 }}>{st.txt}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {previa.pendencias_paginas?.length > 0 && (
            <div style={{ fontSize: 12, color: '#993C1D', background: '#FCEBEB', border: '1px solid #F3C9BE', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>
              ⚠️ <strong>{previa.pendencias_paginas.length} página(s) NÃO serão entregues</strong> — não foi possível reconhecer o CPF (página sem CPF ou com mais de um).
              <div style={{ fontSize: 11, marginTop: 2 }}>Páginas: <strong>{previa.pendencias_paginas.map(p => p.pagina).join(', ')}</strong>. Confira essas páginas manualmente e, se preciso, suba de novo só elas com o CPF legível.</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ ...s.btn, ...(podeConfirmar ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }} disabled={!podeConfirmar} onClick={confirmar}>
              Confirmar e distribuir ({previa.resumo.distribuir})
            </button>
            <button style={s.btnSec} onClick={cancelar}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Distribuições recentes</div>
        {lotes.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma ainda.</div>}
        {lotes.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
            <span>{TIPO_LABEL[l.tipo]} <strong>{l.competencia}</strong> <span style={{ color: '#bbb' }}>· {String(l.criado_em).slice(0, 10).split('-').reverse().join('/')}</span></span>
            <span style={{ color: '#666' }}>
              {l.status === 'previa' ? <em style={{ color: '#8A6D1D' }}>prévia não confirmada</em> : <>{l.distribuidos} entregues · <strong style={{ color: '#3B6D11' }}>{l.cientes} cientes</strong></>}
              {l.nao_encontrados > 0 && <span style={{ color: '#993C1D' }}> · {l.nao_encontrados} s/ cadastro</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  rot: { display: 'block', fontSize: 11, color: '#666', marginBottom: 3 },
  campo: { padding: '7px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnSec: { fontSize: 13, padding: '8px 14px', background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  th: { padding: '8px 6px', fontSize: 11, color: '#777', textAlign: 'center' },
  tdc: { padding: '6px', textAlign: 'center' },
};
