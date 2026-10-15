import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const ST = { aguardando: { l: 'Aguardando preenchimento', c: '#8A6D1D' }, preenchido: { l: 'Preenchido — revisar', c: '#185FA5' }, rejeitado: { l: 'Rejeitado', c: '#993C1D' } };

export default function AutoCadastroRH() {
  const { API, usuario } = useAuth();
  const ehRH = ['RH', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [itens, setItens] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [novoLink, setNovoLink] = useState('');
  const [convite, setConvite] = useState('');
  const [ver, setVer] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => { API.get('/autocadastro').then(r => setItens(r.data.itens || [])).catch(() => {}); }, [API]);
  useEffect(() => { if (ehRH) { carregar(); API.get('/referencias/funcoes').then(r => setFuncoes(r.data.funcoes || [])); API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])); } }, [API, ehRH, carregar]);
  if (!ehRH) return null;

  async function gerar() {
    const r = await API.post('/autocadastro', { convite_nome: convite });
    setNovoLink(`${window.location.origin}/autocadastro?t=${r.data.token}`); setConvite(''); carregar();
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🔗 Auto-cadastro por link</div>
      <div style={{ fontSize: 12, color: '#777', marginBottom: 10 }}>Gere um link, envie ao novo colaborador — ele preenche os dados e anexa os documentos. Depois é só conferir e aprovar.</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input value={convite} onChange={e => setConvite(e.target.value)} placeholder="Nome de referência (opcional)" style={inp} />
        <button onClick={gerar} style={btn('#111')}>Gerar link</button>
      </div>
      {novoLink && (
        <div style={{ background: '#EAF3FB', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#185FA5', fontWeight: 700, marginBottom: 4 }}>Link gerado — envie ao colaborador:</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input readOnly value={novoLink} style={{ ...inp, flex: 1, marginBottom: 0 }} onFocus={e => e.target.select()} />
            <button onClick={() => { navigator.clipboard?.writeText(novoLink); setMsg('Link copiado!'); setTimeout(() => setMsg(''), 1500); }} style={btn('#185FA5')}>Copiar</button>
          </div>
          {msg && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 4 }}>{msg}</div>}
        </div>
      )}

      {itens.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum auto-cadastro em andamento.</div>}
      {itens.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #f2f2f2', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{i.nome || i.convite_nome || 'Convite sem nome'}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{(ST[i.status] || {}).l}{i.docs ? ` · ${i.docs} doc(s)` : ''}{i.nome ? ` · ${i.cpf}` : ''}</div>
          </div>
          {i.status === 'preenchido' && <button onClick={() => API.get(`/autocadastro/${i.id}`).then(r => setVer(r.data))} style={btn('#185FA5')}>Revisar</button>}
          {i.status === 'aguardando' && <span style={{ fontSize: 11, color: '#8A6D1D' }}>aguardando…</span>}
          <button onClick={() => { if (window.confirm('Excluir este convite?')) API.delete(`/autocadastro/${i.id}`).then(carregar); }} style={{ ...btn('#eee'), color: '#993C1D' }}>✕</button>
        </div>
      ))}

      {ver && <Revisar API={API} d={ver} funcoes={funcoes} lojas={lojas} onClose={() => setVer(null)} onDone={() => { setVer(null); carregar(); }} />}
    </div>
  );
}

function Revisar({ API, d, funcoes, lojas, onClose, onDone }) {
  const [funcaoId, setFuncaoId] = useState(d.funcao_id || '');
  const [lojaId, setLojaId] = useState(d.loja_id || '');
  const [admissao, setAdmissao] = useState('');
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState('');
  async function aprovar() {
    setErro('');
    if (!funcaoId || !lojaId) { setErro('Escolha a função e a loja.'); return; }
    try { const r = await API.post(`/autocadastro/${d.id}/aprovar`, { funcao_id: funcaoId, loja_id: lojaId, admissao }); setRes(r.data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao aprovar.'); }
  }
  const linha = (k, v) => v ? <div style={{ fontSize: 13, padding: '2px 0' }}><span style={{ color: '#999' }}>{k}:</span> <strong>{v}</strong></div> : null;
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Revisar cadastro</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>
        {res ? (
          <div style={{ textAlign: 'center', padding: 10 }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontWeight: 700, color: '#3B6D11', margin: '6px 0' }}>Colaborador criado!</div>
            <div style={{ fontSize: 13, color: '#555' }}>Login: <strong>{res.email}</strong><br />Senha provisória: <strong>{res.senha_provisoria}</strong></div>
            <button onClick={onDone} style={{ ...btn('#111'), marginTop: 12 }}>Concluir</button>
          </div>
        ) : (
          <>
            {linha('Nome', d.nome)}{linha('CPF', d.cpf)}{linha('RG', d.rg)}{linha('Nascimento', d.nascimento)}{linha('Telefone', d.telefone)}{linha('E-mail', d.email)}{linha('Endereço', d.endereco)}
            {d.documentos?.length > 0 && (
              <div style={{ margin: '8px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Documentos</div>
                {d.documentos.map(doc => (
                  <a key={doc.id} href={`/api/autocadastro/${d.id}/doc/${doc.id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, background: '#EAF3FB', color: '#185FA5', borderRadius: 6, padding: '4px 10px', margin: '0 6px 6px 0', textDecoration: 'none' }}>📄 {doc.nome}</a>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1px solid #eee', marginTop: 8, paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Definir e aprovar:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)} style={{ ...inp, flex: 1 }}><option value="">Função…</option>{funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
                <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ ...inp, flex: 1 }}><option value="">Loja…</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
                <input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)} title="Admissão" style={{ ...inp, width: 150 }} />
              </div>
              {erro && <div style={{ fontSize: 12, color: '#993C1D', marginBottom: 6 }}>{erro}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { if (window.confirm('Rejeitar este cadastro?')) API.post(`/autocadastro/${d.id}/rejeitar`, {}).then(onDone); }} style={btn('#eee')}><span style={{ color: '#993C1D' }}>Rejeitar</span></button>
                <button onClick={aprovar} style={btn('#3B6D11')}>Aprovar e criar</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inp = { border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' };
const btn = c => ({ fontSize: 12, padding: '8px 12px', background: c, color: c === '#eee' ? '#555' : '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 });
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 };
const modal = { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 480, maxHeight: '86vh', overflowY: 'auto' };
