import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Card no Kanban (origem='campanha'): gerente dá ciência e COMPROVA a execução com
// fotos tiradas na hora (câmera) — cada uma com rótulo do tipo + IP e horário (gravados no servidor).
const TIPOS = ['Placa de preço', 'Vídeo na TV', 'Cartaz / banner', 'Ponta de gôndola', 'Vitrine', 'Exposição no PDV', 'Outro'];

export default function CampanhaComprovanteInline({ tarefa, onChange }) {
  const { API } = useAuth();
  const campanhaId = tarefa.referencia_id;
  const ehValidacao = /^Validar comprovante/i.test(tarefa.titulo || '');
  const lojaTarefa = tarefa.loja_id;
  const concluido = tarefa.status === 'concluido';
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState('');
  const [camAberta, setCamAberta] = useState(false);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [tipoOutro, setTipoOutro] = useState('');
  const [pendentes, setPendentes] = useState([]); // fotos tiradas, ainda não enviadas: {label, dado}
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const carregar = useCallback(() => {
    API.get(`/marketing/campanhas/${campanhaId}/loja`, { params: ehValidacao ? { loja_id: lojaTarefa } : {} })
      .then(r => setC(r.data)).catch(() => setC(false));
  }, [API, campanhaId, ehValidacao, lojaTarefa]);
  useEffect(() => { carregar(); }, [carregar]);

  const pararCam = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCamAberta(false);
  }, []);
  useEffect(() => () => pararCam(), [pararCam]);

  async function validar(aprovado) {
    try {
      await API.post(`/marketing/campanhas/${campanhaId}/validar`, { loja_id: lojaTarefa, aprovado });
      try { await API.patch(`/tarefas/${tarefa.id}/status`, { status: 'concluido' }); } catch (e) { /* segue */ }
      setMsg(aprovado ? '✅ Comprovação aceita.' : '✅ Reanálise solicitada à loja.');
      carregar(); onChange?.();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function darCiencia() {
    try { await API.post(`/marketing/campanhas/${campanhaId}/ciencia`); setMsg('✅ Ciência confirmada.'); carregar(); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function abrirCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; setCamAberta(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 50);
    } catch (e) { setMsg('Não foi possível acessar a câmera. Verifique a permissão.'); }
  }
  function tirarFoto() {
    const v = videoRef.current; if (!v) return;
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth || 640; cv.height = v.videoHeight || 480;
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    const label = tipo === 'Outro' ? (tipoOutro.trim() || 'Outro') : tipo;
    setPendentes(prev => [...prev, { label, dado: cv.toDataURL('image/jpeg', 0.6) }]);
    pararCam();
  }
  // Fallback: usa a câmera do aparelho via input (funciona em celular mesmo sem HTTPS)
  function fotoPorArquivo(fileList) {
    const file = (fileList || [])[0]; if (!file) return;
    const label = tipo === 'Outro' ? (tipoOutro.trim() || 'Outro') : tipo;
    const reader = new FileReader();
    reader.onload = () => setPendentes(prev => [...prev, { label, dado: reader.result }]);
    reader.readAsDataURL(file);
  }
  function removerPendente(i) { setPendentes(prev => prev.filter((_, idx) => idx !== i)); }
  async function enviar() {
    if (!pendentes.length) { setMsg('Tire ao menos uma foto antes de enviar.'); return; }
    try { const r = await API.post(`/marketing/campanhas/${campanhaId}/comprovante`, { fotos: pendentes }); setMsg(`✅ ${r.data.mensagem}`); setPendentes([]); carregar(); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao enviar.'); }
  }

  if (c === null) return <div style={s.box}>Carregando campanha…</div>;
  if (c === false) return null;

  // MODO VALIDADOR (Marketing): vê o comprovante da loja e aceita ou pede reanálise.
  if (ehValidacao) {
    return (
      <div style={s.box}>
        {c.descricao && <div style={{ fontSize: 12, color: '#444', marginBottom: 6 }}>{c.descricao}</div>}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#185FA5', marginBottom: 4 }}>Comprovante enviado pela loja</div>
        {c.comprovante_enviado_em && <div style={{ fontSize: 11, color: '#777', marginBottom: 6 }}>Enviado em {c.comprovante_enviado_em} (UTC)</div>}

        {(c.comprovante || []).length === 0
          ? <div style={{ fontSize: 12, color: '#999' }}>Nenhum comprovante registrado ainda.</div>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {c.comprovante.map((p, i) => (
                <a key={i} href={p.url || p.dado} target="_blank" rel="noreferrer" style={{ width: 104, textDecoration: 'none' }}>
                  {p.dado
                    ? <img src={p.dado} alt={p.label} style={{ width: 104, height: 78, objectFit: 'cover', borderRadius: 6 }} />
                    : <div style={{ width: 104, height: 78, borderRadius: 6, background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🔗 Link</div>}
                  <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{p.label}</div>
                  <div style={{ fontSize: 8, color: '#999' }}>{p.em} · IP {p.ip || '—'}</div>
                </a>
              ))}
            </div>
          )}

        {!concluido && c.comprovante_status === 'enviado' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ ...s.btn, background: '#3B6D11' }} onClick={() => validar(true)}>✓ Aceitar comprovação</button>
            <button style={{ ...s.btn, background: '#993C1D' }} onClick={() => validar(false)}>↺ Pedir reanálise</button>
          </div>
        )}
        {c.comprovante_status === 'validado' && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 8 }}>✓ Comprovação aceita.</div>}
        {c.comprovante_status === 'rejeitado' && <div style={{ fontSize: 11, color: '#993C1D', marginTop: 8 }}>↺ Reanálise solicitada — a loja vai reenviar.</div>}

        {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
      </div>
    );
  }

  const podeComprovar = c.ciencia_em && c.comprovante_status !== 'validado';

  return (
    <div style={s.box}>
      {c.descricao && <div style={{ fontSize: 12, color: '#444', marginBottom: 6 }}>{c.descricao}</div>}

      {(c.midia || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {c.midia.map((m, i) => (
            <a key={i} href={m.url || m.dado} target="_blank" rel="noreferrer" download={m.tipo === 'link' ? undefined : m.nome}
              style={{ fontSize: 11, textDecoration: 'none', color: '#185FA5', background: '#E6F1FB', borderRadius: 6, padding: '3px 8px' }}>
              {m.tipo === 'link' ? '🔗 Material' : `📎 ${m.nome}`}
            </a>
          ))}
        </div>
      )}

      {/* Passo 1 - Ciencia */}
      {!c.ciencia_em
        ? <div>
            <button style={s.btn} onClick={darCiencia}>👀 Dar ciência</button>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Depois de dar ciência, abre aqui a opção de <strong>comprovar a execução com foto</strong>.</div>
          </div>
        : <div style={{ fontSize: 11, color: '#3B6D11', marginBottom: 6 }}>✓ Ciência em {c.ciencia_em} (UTC)</div>}

      {/* Passo 2 - Comprovar execucao com foto na hora */}
      {podeComprovar && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#185FA5', marginBottom: 4 }}>Comprovar execução</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>Tire a foto na hora. O sistema grava IP e horário automaticamente.</div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <select style={s.sel} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {tipo === 'Outro' && <input style={s.inp} placeholder="Descreva o tipo" value={tipoOutro} onChange={e => setTipoOutro(e.target.value)} />}
          </div>

          {!camAberta && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={s.btn} onClick={abrirCam}>📷 Abrir câmera</button>
              <label style={{ ...s.ghost, cursor: 'pointer' }}>
                📲 Foto pela câmera do celular
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { fotoPorArquivo(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
          )}
          {camAberta && (
            <div>
              <video ref={videoRef} style={{ width: '100%', maxWidth: 320, borderRadius: 8, background: '#000' }} muted playsInline />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button style={s.btn} onClick={tirarFoto}>📸 Tirar foto ({tipo === 'Outro' ? (tipoOutro || 'Outro') : tipo})</button>
                <button style={s.ghost} onClick={pararCam}>Cancelar</button>
              </div>
            </div>
          )}

          {pendentes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Fotos a enviar:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {pendentes.map((p, i) => (
                  <div key={i} style={{ position: 'relative', width: 90 }}>
                    <img src={p.dado} alt={p.label} style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ fontSize: 9, color: '#444', textAlign: 'center', marginTop: 2 }}>{p.label}</div>
                    <button onClick={() => removerPendente(i)} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: '#993C1D', color: '#fff', cursor: 'pointer', fontSize: 10, lineHeight: '18px', padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              <button style={{ ...s.btn, marginTop: 8 }} onClick={enviar}>✅ Enviar {pendentes.length} comprovante(s)</button>
            </div>
          )}
        </div>
      )}

      {/* Status atual */}
      {c.comprovante_status === 'enviado' && <div style={{ fontSize: 11, color: '#854F0B', marginTop: 8 }}>⏳ Comprovante enviado em {c.comprovante_enviado_em} (UTC) — aguardando validação do Marketing.</div>}
      {c.comprovante_status === 'validado' && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 8 }}>✓ Comprovante validado pelo Marketing.</div>}
      {c.comprovante_status === 'rejeitado' && <div style={{ fontSize: 11, color: '#993C1D', marginTop: 8 }}>✕ Comprovante rejeitado — tire novas fotos e reenvie.</div>}

      {/* Comprovantes já registrados */}
      {(c.comprovante || []).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Comprovantes registrados:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {c.comprovante.map((p, i) => (
              <a key={i} href={p.url || p.dado} target="_blank" rel="noreferrer" style={{ width: 96, textDecoration: 'none' }}>
                {p.dado
                  ? <img src={p.dado} alt={p.label} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6 }} />
                  : <div style={{ width: 96, height: 72, borderRadius: 6, background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🔗 Link</div>}
                <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{p.label}</div>
                <div style={{ fontSize: 8, color: '#999' }}>{p.em} · IP {p.ip || '—'}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#F4F7FB', border: '1px solid #DBE6F0', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  btn: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
  ghost: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', color: '#666', cursor: 'pointer' },
  sel: { fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 8 },
  inp: { fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 8, flex: 1, minWidth: 120 },
};
