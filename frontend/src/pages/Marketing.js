import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

export default function Marketing() {
  const { API, usuario } = useAuth();
  const [camps, setCamps] = useState(null);
  const [novo, setNovo] = useState(false);
  const ehMkt = ['Marketing', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const ehLoja = ['Gerente', 'Vendedor', 'Caixa'].includes(usuario.funcao);

  const carregar = useCallback(() => { API.get('/marketing/campanhas').then(r => setCamps(r.data.campanhas)); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (camps === null) return <div style={s.load}>Carregando…</div>;

  return (
    <div style={s.wrap}>
      <Banner emoji="📣" titulo="Marketing" cor="laranja" sub="Campanhas e ações">
        {ehMkt && <button onClick={() => setNovo(true)} style={{ fontSize: 12.5, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#B4530E', cursor: 'pointer', fontWeight: 700 }}>+ Nova campanha</button>}
      </Banner>
      {novo && <NovaCampanha API={API} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); carregar(); }} />}

      {camps.length === 0 && <div style={s.card}>Nenhuma campanha.</div>}
      {camps.map(c => (
        <div key={c.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{c.tipo === 'acao' ? '🎬' : '📣'} {c.titulo}</span>
            <span style={{ ...s.tag, background: '#E6F1FB', color: '#185FA5' }}>{c.status}</span>
          </div>
          {c.descricao && <div style={{ fontSize: 12, color: '#666', margin: '4px 0' }}>{c.descricao}</div>}
          {(c.midia || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
              {c.midia.map((m, i) => (
                <a key={i} href={m.url || m.dado} target="_blank" rel="noreferrer" download={m.tipo === 'link' ? undefined : m.nome}
                  style={{ fontSize: 11, textDecoration: 'none', color: '#185FA5', background: '#E6F1FB', borderRadius: 6, padding: '3px 8px' }}>
                  {m.tipo === 'link' ? '🔗' : m.tipo?.startsWith('image') ? '🖼️' : m.tipo?.startsWith('video') ? '🎞️' : m.tipo?.startsWith('audio') ? '🎵' : '📄'} {m.tipo === 'link' ? 'Link' : m.nome}
                </a>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#999' }}>{c.com_ciencia}/{c.total_lojas} com ciência · {c.comprovantes_ok}/{c.total_lojas} comprovantes ok</div>

          {ehLoja && c.lojas.map(l => (
            <div key={l.loja_id} style={s.lojaRow}>
              <span style={{ fontSize: 12, flex: 1 }}>{l.loja_nome}</span>
              {!l.ciencia_em
                ? <button style={s.btnSm} onClick={() => API.post(`/marketing/campanhas/${c.id}/ciencia`).then(carregar)}>Dar ciência</button>
                : !l.comprovante_status
                  ? <button style={s.btnSm} onClick={() => { const url = prompt('Link do comprovante (opcional):') || ''; API.post(`/marketing/campanhas/${c.id}/comprovante`, { url }).then(carregar); }}>Enviar comprovante</button>
                  : <span style={{ ...s.tag, ...(l.comprovante_status === 'validado' ? { background: '#EAF3DE', color: '#3B6D11' } : l.comprovante_status === 'rejeitado' ? { background: '#FCEBEB', color: '#993C1D' } : { background: '#FAEEDA', color: '#854F0B' }) }}>{l.comprovante_status}</span>}
            </div>
          ))}

          {ehMkt && c.lojas.filter(l => l.comprovante_status === 'enviado').map(l => (
            <div key={l.loja_id} style={{ ...s.lojaRow, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, flex: 1 }}>{l.loja_nome} — validar?</span>
                <button style={s.btnOk} onClick={() => API.post(`/marketing/campanhas/${c.id}/validar`, { loja_id: l.loja_id, aprovado: true }).then(carregar)}>✓</button>
                <button style={s.btnBad} onClick={() => API.post(`/marketing/campanhas/${c.id}/validar`, { loja_id: l.loja_id, aprovado: false }).then(carregar)}>✕</button>
              </div>
              {(l.comprovante || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {l.comprovante.map((p, i) => (
                    <a key={i} href={p.url || p.dado} target="_blank" rel="noreferrer" style={{ width: 96, textDecoration: 'none' }}>
                      {p.dado
                        ? <img src={p.dado} alt={p.label} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 96, height: 72, borderRadius: 6, background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🔗 Link</div>}
                      <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{p.label}</div>
                      <div style={{ fontSize: 8, color: '#999' }}>{p.em} · IP {p.ip || '—'}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function NovaCampanha({ API, onClose, onSaved }) {
  const [f, setF] = useState({ tipo: 'campanha', titulo: '', descricao: '', prazo_ciencia: 5, midia: [] });
  const [lojas, setLojas] = useState([]);
  const [sel, setSel] = useState([]);
  const [erroMidia, setErroMidia] = useState('');
  useEffect(() => { API.get('/config/lojas').then(r => setLojas(r.data.lojas)).catch(() => API.get('/painel/supervisor').then(r => setLojas(r.data.lojas.map(l => ({ id: l.loja_id, nome: l.loja }))))); }, [API]);

  function lerArquivos(fileList) {
    setErroMidia('');
    const arr = Array.from(fileList || []);
    arr.forEach(file => {
      if (file.size > 15 * 1024 * 1024) { setErroMidia(`"${file.name}" tem mais de 15 MB. Para vídeos grandes, use o campo de link em vez do anexo.`); return; }
      const reader = new FileReader();
      reader.onload = () => setF(prev => ({ ...prev, midia: [...(prev.midia || []), { nome: file.name, tipo: file.type, dado: reader.result }] }));
      reader.readAsDataURL(file);
    });
  }
  function removerMidia(i) { setF(prev => ({ ...prev, midia: prev.midia.filter((_, idx) => idx !== i) })); }
  function addLink() {
    const url = window.prompt('Cole o link do vídeo/arquivo (YouTube, Drive, etc.):') || '';
    if (!url.trim()) return;
    setF(prev => ({ ...prev, midia: [...(prev.midia || []), { nome: url.trim(), tipo: 'link', url: url.trim() }] }));
  }
  async function salvar() {
    if (!f.titulo || !sel.length) return;
    await API.post('/marketing/campanhas', { ...f, lojas: sel }); onSaved();
  }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Nova campanha</div>
        <select style={s.input} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
          <option value="campanha">Campanha</option><option value="acao">Ação de loja</option>
        </select>
        <input style={s.input} placeholder="Título" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} />
        <textarea style={s.input} placeholder="Descrição" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} />
        <div style={{ fontSize: 12, color: '#666', margin: '6px 0 2px' }}>Prazo de ciência (dias) — prazo para a loja confirmar que viu</div>
        <input style={s.input} type="number" min="1" value={f.prazo_ciencia} onChange={e => setF({ ...f, prazo_ciencia: e.target.value })} />

        <div style={{ fontSize: 12, color: '#666', margin: '8px 0 4px' }}>Anexos (PDF, imagem, vídeo ou áudio)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...s.chip, cursor: 'pointer' }}>
            📎 Adicionar arquivo
            <input type="file" multiple accept=".pdf,image/*,video/*,audio/*" style={{ display: 'none' }} onChange={e => { lerArquivos(e.target.files); e.target.value = ''; }} />
          </label>
          <button type="button" style={s.chip} onClick={addLink}>🔗 Adicionar link</button>
        </div>
        {erroMidia && <div style={{ fontSize: 11, color: '#993C1D', marginTop: 4 }}>{erroMidia}</div>}
        {(f.midia || []).length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {f.midia.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#F4F7FB', borderRadius: 6, padding: '4px 8px' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.tipo === 'link' ? '🔗' : m.tipo?.startsWith('image') ? '🖼️' : m.tipo?.startsWith('video') ? '🎞️' : m.tipo?.startsWith('audio') ? '🎵' : '📄'} {m.nome}</span>
                <button type="button" onClick={() => removerMidia(i)} style={{ border: 'none', background: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Arquivos até 15 MB ficam salvos na campanha. Para vídeos grandes, prefira o link.</div>
        <div style={{ fontSize: 12, color: '#666', margin: '6px 0' }}>Lojas:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {lojas.map(l => (
            <button key={l.id} onClick={() => setSel(sel.includes(l.id) ? sel.filter(x => x !== l.id) : [...sel, l.id])}
              style={{ ...s.chip, ...(sel.includes(l.id) ? { background: '#111', color: '#fff', borderColor: '#111' } : {}) }}>{l.nome}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button style={s.btn} onClick={salvar}>Criar</button>
          <button style={s.btnGhost} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 6 },
  lojaRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid #f5f5f5' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnGhost: { fontSize: 13, padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  btnSm: { fontSize: 11, padding: '4px 10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  btnOk: { fontSize: 12, padding: '4px 10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  btnBad: { fontSize: 12, padding: '4px 10px', background: '#993C1D', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, maxWidth: 420, width: '100%', maxHeight: '85vh', overflow: 'auto' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  chip: { fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 16, background: 'none', cursor: 'pointer' },
};
