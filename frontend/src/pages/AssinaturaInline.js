import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Historico } from './CienciaGestaoInline';

// Card de assinatura/ciência (origem='assinatura'): titular assina com foto da câmera;
// RH baixa o PDF (foto+IP+hora) — e só aí a tarefa conclui.
export default function AssinaturaInline({ assinaturaId, onChange }) {
  const { API } = useAuth();
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState('');
  const [camAberta, setCamAberta] = useState(false);
  const [foto, setFoto] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const carregar = useCallback(() => {
    API.get(`/assinaturas/${assinaturaId}`).then(r => setA(r.data)).catch(() => setA(false));
  }, [API, assinaturaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const pararCam = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCamAberta(false);
  }, []);
  useEffect(() => () => pararCam(), [pararCam]);

  async function abrirCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream; setCamAberta(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 50);
    } catch (e) { setMsg('Não foi possível acessar a câmera. Verifique a permissão.'); }
  }
  function tirarFoto() {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 320; c.height = v.videoHeight || 240;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setFoto(c.toDataURL('image/jpeg', 0.7));
    pararCam();
  }
  async function assinar() {
    if (!foto) { setMsg('Tire a foto da ciência primeiro.'); return; }
    try { await API.post(`/assinaturas/${assinaturaId}/assinar`, { foto }); setMsg('✅ Assinatura registrada.'); setFoto(''); onChange?.(); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao assinar.'); }
  }
  async function baixarPdf() {
    try {
      const r = await API.get(`/assinaturas/${assinaturaId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const link = document.createElement('a'); link.href = url; link.download = `ciencia-${assinaturaId.slice(0, 8)}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setMsg('✅ Documento baixado — tarefa concluída.'); onChange?.(); carregar();
    } catch (e) { setMsg('Erro ao baixar o PDF (o servidor precisa da lib pdfkit instalada).'); }
  }

  if (a === null) return <div style={s.box}>Carregando…</div>;
  if (a === false) return null;

  return (
    <div style={s.box}>
      {a.texto && <div style={{ fontSize: 12, color: '#444', marginBottom: 8 }}>{a.texto}</div>}

      {/* Titular ainda não assinou */}
      {a.sou_titular && !a.assinado && (
        <div>
          <div style={{ fontSize: 12, color: '#185FA5', marginBottom: 6 }}>Confirme a ciência com uma foto sua.</div>
          {!foto && !camAberta && <button style={s.btn} onClick={abrirCam}>📷 Abrir câmera</button>}
          {camAberta && (
            <div>
              <video ref={videoRef} style={{ width: '100%', maxWidth: 280, borderRadius: 8, background: '#000' }} muted playsInline />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button style={s.btn} onClick={tirarFoto}>Tirar foto</button>
                <button style={s.ghost} onClick={pararCam}>Cancelar</button>
              </div>
            </div>
          )}
          {foto && (
            <div>
              <img src={foto} alt="ciência" style={{ width: '100%', maxWidth: 220, borderRadius: 8 }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button style={s.btn} onClick={assinar}>✍️ Assinar ciência</button>
                <button style={s.ghost} onClick={() => setFoto('')}>Refazer</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Já assinado */}
      {a.assinado && (
        <div>
          <div style={{ fontSize: 12, color: '#3B6D11', fontWeight: 600 }}>✓ Assinado</div>
          <div style={{ fontSize: 11, color: '#777' }}>{a.assinado_em} (UTC){a.ip ? ` · IP ${a.ip}` : ''}</div>
          {a.foto_base64 && <img src={a.foto_base64} alt="ciência" style={{ width: 120, borderRadius: 8, marginTop: 6 }} />}
          {a.sou_rh && !a.baixado && <div style={{ marginTop: 8 }}><button style={s.btn} onClick={baixarPdf}>⬇️ Baixar documento (PDF)</button>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>A tarefa só conclui após o RH baixar e arquivar o documento.</div></div>}
          {a.baixado && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 6 }}>📁 Arquivado{a.baixado_por_nome ? ` por ${a.baixado_por_nome}` : ''} em {a.baixado_em} (UTC){a.sou_rh ? ' · ' : ''}{a.sou_rh && <button style={s.linkBtn} onClick={baixarPdf}>baixar de novo</button>}</div>}
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
      <Historico hist={a.historico} />
    </div>
  );
}

const s = {
  box: { background: '#F4F7FB', border: '1px solid #DBE6F0', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  btn: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
  ghost: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', color: '#666', cursor: 'pointer' },
  linkBtn: { fontSize: 11, border: 'none', background: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline', padding: 0 },
};
