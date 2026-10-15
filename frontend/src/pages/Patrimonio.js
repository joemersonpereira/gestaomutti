import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Bloco de assinatura (canvas) — mouse e toque. Chama onChange(dataURL).
function SignaturePad({ onChange, height = 120 }) {
  const ref = useRef(null); const draw = useRef(false);
  const pos = e => { const c = ref.current, r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
  const start = e => { e.preventDefault(); draw.current = true; const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = e => { if (!draw.current) return; e.preventDefault(); const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (!draw.current) return; draw.current = false; onChange && onChange(ref.current.toDataURL('image/png')); };
  const limpar = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onChange && onChange(''); };
  return (
    <div>
      <canvas ref={ref} width={420} height={height} style={{ width: '100%', height, border: '1px dashed #ccc', borderRadius: 8, touchAction: 'none', background: '#fff' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button type="button" onClick={limpar} style={{ fontSize: 11, padding: '3px 8px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', marginTop: 4 }}>Limpar assinatura</button>
    </div>
  );
}

const brl = n => n ? 'R$ ' + Number(n).toLocaleString('pt-BR') : '';
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const ST = {
  disponivel: ['🟢', 'Disponível', '#1E874B'],
  emprestado: ['🔵', 'Emprestado', '#2E5C9E'],
  reservado: ['🟡', 'Reservado', '#B7791F'],
  manutencao: ['🛠️', 'Manutenção', '#B7791F'],
  baixado: ['⚫', 'Baixado', '#999'],
};

export default function Patrimonio() {
  const { API, usuario } = useAuth();
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Controladoria'].includes(usuario.funcao);
  const [d, setD] = useState(null);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(null); // 'nf' | 'mercado'
  const [reservar, setReservar] = useState(null);
  const [devolver, setDevolver] = useState(null);
  const [transferir, setTransferir] = useState(null);
  const [lojas, setLojas] = useState([]);
  const carregar = useCallback(() => API.get('/patrimonio').then(r => setD(r.data.patrimonios || [])).catch(() => setD([])), [API]);
  // "Administrativo" (ADM) é um setor, não uma loja do ERP — entra como opção fixa nas listas.
  useEffect(() => { carregar(); API.get('/compras/lojas').then(r => setLojas([...(r.data.lojas || []), { id: 'adm', nome: '🏢 Administrativo' }])).catch(() => setLojas([{ id: 'adm', nome: '🏢 Administrativo' }])); }, [API, carregar]);

  const lista = (d || []).filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.tombamento || '').includes(busca));
  const salvarNovo = f => API.post('/patrimonio', f).then(() => { setNovo(false); carregar(); });

  return (
    <div style={s.wrap}>
      <Banner emoji="🗄️" titulo="Patrimônio" cor="ciano" sub="Controle dos bens da loja. Empreste/reserve por período — ao vencer, o sistema cobra a devolução. Fila de espera automática." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar por nome ou tombamento" style={{ ...s.inp, flex: 1, maxWidth: 320 }} />
        {gestao && <>
          <button onClick={() => setNovo(true)} style={s.btn}>+ Cadastrar</button>
          <button onClick={() => setImportar('nf')} style={s.btnMini}>📄 Importar NF</button>
          <button onClick={() => setImportar('mercado')} style={s.btnMini}>📦 Do Meu Mercado</button>
        </>}
      </div>

      {novo && <FormNovo lojas={lojas} onSave={salvarNovo} onCancel={() => setNovo(false)} />}
      {importar === 'nf' && <ImportarNF API={API} lojas={lojas} onClose={() => setImportar(null)} onDone={() => { setImportar(null); carregar(); }} />}
      {importar === 'mercado' && <TransferirMercado API={API} lojas={lojas} onClose={() => setImportar(null)} onDone={() => { setImportar(null); carregar(); }} />}
      {!d && <div style={s.card}>Carregando…</div>}
      {d && lista.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Nenhum bem cadastrado ainda</div>
        <div style={{ fontSize: 12.5 }}>Cadastre um bem (botão <b>+ Cadastrar</b>), importe por <b>NF</b> ou traga <b>do Meu Mercado</b>. Depois, o botão <b>Reservar/Emprestar</b> aparece em cada bem — e quem quiser um bem ocupado entra na <b>fila</b>.</div>
      </div>}

      {lista.map(p => {
        const [emoji, label, cor] = ST[p.status] || ['•', p.status, '#666'];
        return (
          <div key={p.id} style={{ ...s.card, borderLeft: `4px solid ${cor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.nome} <span style={{ ...s.badge, background: cor + '18', color: cor }}>{emoji} {label}</span></div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                  {p.categoria ? p.categoria + ' · ' : ''}{p.tombamento ? 'nº ' + p.tombamento + ' · ' : ''}{p.loja || ''}{p.valor ? ' · ' + brl(p.valor) : ''}
                </div>
                {p.reserva && <div style={{ fontSize: 12, color: '#2E5C9E', marginTop: 4 }}>
                  🔵 Com <b>{p.reserva.colaborador_nome}</b> · {dBR(p.reserva.data_ini)} a {dBR(p.reserva.data_fim)}{p.reserva.finalidade ? ` · ${p.reserva.finalidade}` : ''}
                  {p.reserva.data_fim < new Date().toISOString().slice(0, 10) && <span style={{ color: '#C0392B', fontWeight: 700 }}> · vencido!</span>}
                </div>}
                {p.fila && p.fila.length > 0 && <div style={{ fontSize: 11.5, color: '#999', marginTop: 3 }}>⏳ Fila: {p.fila.map(f => f.colaborador_nome).join(' → ')}</div>}
                {p.reserva && p.reserva.recebedor_nome && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>✍️ Retirado por {p.reserva.recebedor_nome}{p.reserva.temAssinaturaRetirada ? ' (assinado)' : ''}</div>}
                {p.historico && p.historico.length > 0 && <div style={{ fontSize: 11, color: '#bbb', marginTop: 3 }}>
                  {p.historico[0].tipo === 'transferencia' ? `🔀 ${p.historico[0].deLoja || '—'} → ${p.historico[0].paraLoja}` : `${p.historico[0].tipo} · ${new Date(p.historico[0].criado_em + 'Z').toLocaleDateString('pt-BR')}`}
                </div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.status === 'disponivel' && <button onClick={() => setReservar(p)} style={s.btn}>Reservar/Emprestar</button>}
                {(p.status === 'emprestado' || p.status === 'reservado') && <>
                  <button onClick={() => setReservar(p)} style={s.btnMini}>Entrar na fila</button>
                  {gestao && <button onClick={() => setDevolver(p)} style={{ ...s.btn, background: '#1E874B' }}>↩️ Devolver</button>}
                </>}
                {gestao && <button onClick={() => setTransferir(p)} style={s.btnMini}>🔀 Transferir loja</button>}
              </div>
            </div>
          </div>
        );
      })}
      {reservar && <FormReserva API={API} patr={reservar} onClose={() => setReservar(null)} onSaved={() => { setReservar(null); carregar(); }} />}
      {devolver && <FormDevolver API={API} patr={devolver} onClose={() => setDevolver(null)} onSaved={() => { setDevolver(null); carregar(); }} />}
      {transferir && <FormTransferir API={API} patr={transferir} lojas={lojas} onClose={() => setTransferir(null)} onSaved={() => { setTransferir(null); carregar(); }} />}
    </div>
  );
}

function FormDevolver({ API, patr, onClose, onSaved }) {
  const { usuario } = useAuth();
  const [f, setF] = useState({ devolvedor_nome: patr.reserva?.colaborador_nome || '', recebedor_devolucao_nome: usuario.nome, assinatura: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const enviar = () => API.post(`/patrimonio/${patr.id}/devolver`, f).then(onSaved);
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={s.modal}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>↩️ Devolução — {patr.nome}</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
      <div style={{ display: 'grid', gap: 8 }}>
        <label style={s.lbl}>Quem está devolvendo<input value={f.devolvedor_nome} onChange={e => set('devolvedor_nome', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Quem recebeu de volta<input value={f.recebedor_devolucao_nome} onChange={e => set('recebedor_devolucao_nome', e.target.value)} style={s.inp} /></label>
        <div style={{ fontSize: 12, color: '#888' }}>Assinatura de quem devolveu:</div>
        <SignaturePad onChange={v => set('assinatura', v)} />
        <button onClick={enviar} style={s.btn}>Confirmar devolução</button>
      </div>
    </div></div>
  );
}

function FormTransferir({ API, patr, lojas, onClose, onSaved }) {
  const [loja, setLoja] = useState('');
  const [obs, setObs] = useState('');
  const enviar = () => { if (!loja) return; API.post(`/patrimonio/${patr.id}/transferir-loja`, { loja_id: loja, obs }).then(onSaved); };
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={s.modal}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>🔀 Transferir — {patr.nome}</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Loja atual: <b>{patr.loja || '—'}</b></div>
      <div style={{ display: 'grid', gap: 8 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Loja de destino…</option>{lojas.filter(l => l.id !== patr.loja_id).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} style={s.inp} />
        <button onClick={enviar} style={s.btn}>Transferir</button>
      </div>
    </div></div>
  );
}

function FormNovo({ lojas = [], onSave, onCancel }) {
  const [f, setF] = useState({ nome: '', categoria: '', tombamento: '', valor: '', loja_id: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <div style={{ ...s.card, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Cadastrar bem</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Nome do bem" value={f.nome} onChange={e => set('nome', e.target.value)} style={{ ...s.inp, flex: 1, minWidth: 200 }} />
        <select value={f.loja_id} onChange={e => set('loja_id', e.target.value)} style={s.inp}>
          <option value="">🏬 Loja onde ficará…</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Categoria" value={f.categoria} onChange={e => set('categoria', e.target.value)} style={{ ...s.inp, flex: 1 }} />
        <input placeholder="Nº tombamento" value={f.tombamento} onChange={e => set('tombamento', e.target.value)} style={s.inp} />
        <input placeholder="Valor R$" type="number" value={f.valor} onChange={e => set('valor', e.target.value)} style={{ ...s.inp, width: 110 }} />
      </div>
      <input placeholder="Descrição (opcional)" value={f.descricao || ''} onChange={e => set('descricao', e.target.value)} style={s.inp} />
      <div style={{ display: 'flex', gap: 8 }}><button onClick={() => f.nome && onSave(f)} style={s.btn}>Salvar</button><button onClick={onCancel} style={{ ...s.btn, background: '#999' }}>Cancelar</button></div>
      <div style={{ fontSize: 11, color: '#aaa' }}>💡 Também dá para importar por <b>NF do ERP</b> ou transferir <b>do Meu Mercado</b> (botões acima).</div>
    </div>
  );
}

function ImportarNF({ API, lojas, onClose, onDone }) {
  const [loja, setLoja] = useState(lojas[0]?.id || '');
  const [numero, setNumero] = useState('');
  const [nf, setNf] = useState(null);
  const [msg, setMsg] = useState('');
  const buscar = () => { setMsg(''); setNf(null); API.get('/patrimonio/nf-erp', { params: { numero, loja } }).then(r => { if (!r.data.encontrada) setMsg('NF não encontrada nessa loja.'); else setNf({ ...r.data, itens: r.data.itens.map(i => ({ ...i, sel: true })) }); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.')); };
  const importar = () => API.post('/patrimonio/importar-nf', { numero, loja_id: loja, itens: nf.itens.filter(i => i.sel) }).then(r => { setMsg(`✅ ${r.data.criados} bem(ns) cadastrado(s).`); setTimeout(onDone, 700); });
  const upd = (i, k, v) => setNf(n => ({ ...n, itens: n.itens.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>📄 Importar patrimônio de NF do ERP</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <input placeholder="Número da NF" value={numero} onChange={e => setNumero(e.target.value)} style={s.inp} />
        <button onClick={buscar} style={s.btn}>Buscar</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : '#C0392B' }}>{msg}</div>}
      {nf && <>
        <div style={{ fontSize: 12, color: '#666', margin: '6px 0' }}>Fornecedor: {nf.fornecedor || '—'} · selecione os itens que são patrimônio:</div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {nf.itens.map((it, i) => (
            <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 12.5, borderTop: i ? '1px solid #f2f2f2' : 'none' }}>
              <input type="checkbox" checked={it.sel} onChange={e => upd(i, 'sel', e.target.checked)} />
              <span style={{ flex: 1 }}>{it.descricao}</span>
              <span style={{ color: '#999' }}>qtd {it.quantidade}</span>
              <span style={{ color: '#999' }}>R$ {Number(it.valor).toFixed(2)}</span>
            </label>
          ))}
        </div>
        <button onClick={importar} style={{ ...s.btn, marginTop: 10 }}>Cadastrar selecionados</button>
      </>}
    </div></div>
  );
}

function TransferirMercado({ API, lojas, onClose, onDone }) {
  const [itens, setItens] = useState([]);
  const [sel, setSel] = useState('');
  const [qtd, setQtd] = useState(1);
  const [loja, setLoja] = useState(lojas[0]?.id || '');
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/patrimonio/mercado-itens').then(r => setItens(r.data.itens || [])).catch(() => {}); }, [API]);
  const transferir = () => { if (!sel) { setMsg('Escolha um item.'); return; } API.post('/patrimonio/transferir-mercado', { produto_id: sel, loja_id: loja, quantidade: qtd }).then(r => { setMsg(r.data.ok ? `✅ ${r.data.criados} bem(ns) transferido(s).` : ('⚠️ ' + r.data.erro)); if (r.data.ok) setTimeout(onDone, 700); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.')); };
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={s.modal}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>📦 Transferir do Meu Mercado</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
      <div style={{ display: 'grid', gap: 8 }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={s.inp}><option value="">Item do Meu Mercado…</option>{itens.map(i => <option key={i.id} value={i.id}>{i.nome} (estoque {i.estoque})</option>)}</select>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={s.lbl}>Qtd<input type="number" min="1" value={qtd} onChange={e => setQtd(Number(e.target.value))} style={{ ...s.inp, width: 80 }} /></label>
          <label style={{ ...s.lbl, flex: 1 }}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        </div>
        {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : '#C0392B' }}>{msg}</div>}
        <div style={{ fontSize: 11.5, color: '#999' }}>Dá baixa no estoque do Meu Mercado e cria o bem no patrimônio.</div>
        <button onClick={transferir} style={s.btn}>Transferir</button>
      </div>
    </div></div>
  );
}

function FormReserva({ API, patr, onClose, onSaved }) {
  const disponivel = patr.status === 'disponivel';
  const [f, setF] = useState({ data_ini: '', data_fim: '', finalidade: '', recebedor_nome: '', assinatura: '' });
  const [msg, setMsg] = useState('');
  const [colabs, setColabs] = useState([]);
  const [sel, setSel] = useState([]); // colaboradores escolhidos (pode ser mais de um)
  const [q, setQ] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  useEffect(() => { API.get('/patrimonio/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  const toggle = c => setSel(x => x.some(y => y.id === c.id) ? x.filter(y => y.id !== c.id) : [...x, c]);
  const filtrados = q.length >= 1 ? colabs.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()) && !sel.some(y => y.id === c.id)).slice(0, 8) : [];
  const enviar = () => {
    if (!f.data_ini || !f.data_fim) { setMsg('Informe o período.'); return; }
    const nomes = sel.map(c => c.nome).join(', ');
    const body = { ...f, recebedor_nome: nomes || f.recebedor_nome, colaborador_id: sel[0]?.id, colaborador_nome: sel[0]?.nome };
    API.post(`/patrimonio/${patr.id}/reservar`, body).then(r => {
      if (r.data.fila) setMsg(`Item ocupado — você entrou na fila (posição ${r.data.posicao}).`);
      else onSaved();
    });
  };
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{patr.status === 'disponivel' ? 'Reservar / Emprestar' : 'Entrar na fila'} — {patr.nome}</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.lbl}>Início<input type="date" value={f.data_ini} onChange={e => set('data_ini', e.target.value)} style={s.inp} /></label>
            <label style={s.lbl}>Devolução<input type="date" value={f.data_fim} onChange={e => set('data_fim', e.target.value)} style={s.inp} /></label>
          </div>
          <input placeholder="Finalidade (opcional)" value={f.finalidade} onChange={e => set('finalidade', e.target.value)} style={s.inp} />
          {disponivel && <>
            <div style={s.lbl}>Quem está retirando/recebendo <span style={{ color: '#aaa' }}>(pode escolher mais de um)</span></div>
            {sel.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{sel.map(c => <span key={c.id} style={{ fontSize: 12, background: '#EEF2F7', borderRadius: 12, padding: '3px 8px' }}>{c.nome} <b onClick={() => toggle(c)} style={{ cursor: 'pointer', color: '#999' }}>✕</b></span>)}</div>}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 buscar colaborador…" style={s.inp} />
            {filtrados.length > 0 && <div style={{ border: '1px solid #eee', borderRadius: 8, maxHeight: 140, overflowY: 'auto' }}>{filtrados.map(c => <div key={c.id} onClick={() => { toggle(c); setQ(''); }} style={{ padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{c.nome}{c.loja ? <span style={{ color: '#aaa' }}> · {c.loja}</span> : ''}</div>)}</div>}
            <div style={{ fontSize: 12, color: '#888' }}>Assinatura de quem recebeu:</div>
            <SignaturePad onChange={v => set('assinatura', v)} />
          </>}
          {msg && <div style={{ fontSize: 12.5, color: '#B7791F' }}>{msg}</div>}
          <div style={{ fontSize: 11.5, color: '#999' }}>Ao vencer o período, o sistema gera uma tarefa de devolução automaticamente.</div>
          <button onClick={enviar} style={s.btn}>{disponivel ? 'Confirmar reserva' : 'Entrar na fila'}</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 12.5, padding: '7px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  badge: { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, marginLeft: 4 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 460 },
};
