import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// E-mail → Tarefa: cadastra remetentes e o responsável; e-mail desses remetentes vira tarefa.
export default function EmailTarefas() {
  const { API } = useAuth();
  const [status, setStatus] = useState(null);
  const [regras, setRegras] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [nova, setNova] = useState({ remetente: '', responsavel_id: '', rotulo: '' });
  const [msg, setMsg] = useState('');
  const [testando, setTestando] = useState(false);

  const carregar = useCallback(() => {
    API.get('/email/status').then(r => setStatus(r.data)).catch(() => {});
    API.get('/email/regras').then(r => setRegras(r.data.regras || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); API.get('/email/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API, carregar]);

  const addRegra = () => {
    if (!nova.remetente.trim()) return;
    API.post('/email/regras', nova).then(() => { setNova({ remetente: '', responsavel_id: '', rotulo: '' }); carregar(); });
  };
  const delRegra = id => API.delete(`/email/regras/${id}`).then(carregar);
  const testar = () => { setTestando(true); setMsg(''); API.post('/email/testar').then(r => setMsg(r.data.ok ? `✅ Conectado em ${r.data.usuario} — ${r.data.total} mensagens na caixa "${r.data.caixa}".` : `⚠️ ${r.data.erro}`)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha'))).finally(() => setTestando(false)); };
  const sincronizar = () => { setMsg('Sincronizando…'); API.post('/email/sincronizar').then(r => { setMsg(r.data.ok ? `✅ ${r.data.criadas} tarefa(s) criada(s) de ${r.data.verificados} e-mails verificados.` : `⚠️ ${r.data.erro}`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha'))); };

  const on = status?.habilitado;
  return (
    <div style={s.wrap}>
      <Banner emoji="📧" titulo="E-mail → Tarefa" cor="azul" sub="E-mails de remetentes cadastrados viram tarefa automaticamente, para o responsável certo." />

      {/* Status da conexão */}
      <div style={{ ...s.card, borderLeft: `4px solid ${on ? '#1E874B' : '#C0392B'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>{on ? '🟢 Conexão ativa' : '🔴 Conexão desativada'}</b>
          {status && <span style={{ fontSize: 12.5, color: '#666' }}>{status.host} · {status.usuario || '(sem usuário configurado)'} · pasta {status.pasta} · janela {status.dias} dias</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={testar} disabled={testando} style={s.btnMini}>{testando ? 'testando…' : 'Testar conexão'}</button>
            <button onClick={sincronizar} disabled={!on} style={{ ...s.btn, opacity: on ? 1 : 0.5 }}>Sincronizar agora</button>
          </div>
        </div>
        {status && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{status.tarefasCriadas} tarefa(s) já criadas por e-mail · {status.processados} e-mails processados.</div>}
        {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('✅') ? '#1E874B' : msg.startsWith('⚠️') ? '#C0392B' : '#666' }}>{msg}</div>}
        {!on && (
          <div style={{ ...s.info, marginTop: 10 }}>
            Para ativar, preencha no arquivo <code>backend/.env</code>: <b>EMAIL_USER</b> (seu e-mail Hostinger), <b>EMAIL_PASSWORD</b> (a senha da caixa) e mude <b>EMAIL_ENABLED=true</b>. Depois reinicie o servidor. Host e porta já vêm prontos (imap.hostinger.com:993). 💡 Recomendo uma caixa dedicada (ex.: <i>tarefas@seudominio</i>).
          </div>
        )}
      </div>

      {/* Cadastro de regras */}
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Remetentes que viram tarefa</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Só e-mails destes remetentes viram tarefa. Use o e-mail exato (<i>contato@fornecedor.com</i>) ou o domínio inteiro (<i>@fornecedor.com</i>). Cada um vai para o responsável escolhido.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input value={nova.remetente} onChange={e => setNova(n => ({ ...n, remetente: e.target.value }))} placeholder="e-mail ou @domínio" style={{ ...s.inp, flex: '1 1 220px' }} />
          <select value={nova.responsavel_id} onChange={e => setNova(n => ({ ...n, responsavel_id: e.target.value }))} style={{ ...s.inp, flex: '1 1 180px' }}>
            <option value="">Responsável (ou deixe em fila)</option>
            {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input value={nova.rotulo} onChange={e => setNova(n => ({ ...n, rotulo: e.target.value }))} placeholder="rótulo (opcional, ex.: Contador)" style={{ ...s.inp, flex: '1 1 160px' }} />
          <button onClick={addRegra} style={s.btn}>Adicionar</button>
        </div>

        {regras.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Nenhum remetente cadastrado ainda.</div>}
        {regras.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f2f2f2', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{r.rotulo ? `[${r.rotulo}] ` : ''}{r.remetente}</span>
            <span style={{ fontSize: 12, color: '#666' }}>→ {r.responsavel_nome || 'fila (sem responsável)'}</span>
            {!r.ativo && <span style={{ fontSize: 11, color: '#C0392B' }}>(inativo)</span>}
            <button onClick={() => delRegra(r.id)} style={{ ...s.btnMini, marginLeft: 'auto', color: '#C0392B' }}>remover</button>
          </div>
        ))}
      </div>

      <div style={{ ...s.info, fontSize: 11.5 }}>🔒 Segurança: o conteúdo do e-mail é tratado como <b>dado</b> — o sistema só cria a tarefa com o texto, nunca executa nada que esteja escrito no e-mail. A leitura é a cada 5 minutos e não marca/apaga nada na sua caixa.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 12 },
  inp: { padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { fontSize: 13, padding: '9px 16px', background: '#2C6FA6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  info: { background: '#F4F8FC', border: '1px solid #DCE9F5', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: '#33506B' },
};
