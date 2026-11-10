import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const hoje = new Date();
const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIPO_LBL = { premiacao: 'Premiação', perfumaria: 'Perfumaria', kits: 'Kits', unidades: 'Unidades', vitaminas: 'Vitaminas' };

export default function PremiacaoFechamento() {
  const { API } = useAuth();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dados, setDados] = useState({ linhas: [], resumo: {}, relatorios: [], cfg: {} });
  const [cfg, setCfg] = useState({ uv_valor_un: 0, kit_min: 100, kit_alto: 250, kit_baixo: 120 });
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [contas, setContas] = useState([]);

  const carregar = useCallback(() => {
    setCarregando(true);
    API.get('/premiacao-fechamento', { params: { mes, ano } }).then(r => {
      setDados(r.data); setCfg({ ...cfg, ...r.data.cfg });
    }).catch(() => setMsg('Erro ao carregar.')).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const carregarContas = useCallback(() => { API.get('/premiacao-fechamento/contas').then(r => setContas(r.data.contas || [])).catch(() => {}); }, [API]);
  useEffect(() => { carregarContas(); }, [carregarContas]);

  async function subirIds(files) {
    const lista = Array.from(files || []); if (!lista.length) return;
    setMsg(''); let at = 0; const nao = []; const erros = [];
    for (const f of lista) {
      try {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        const r = await API.post('/premiacao-fechamento/importar-ids', { conteudoBase64: b64, nomeArquivo: f.name });
        at += r.data.atualizados; nao.push(...(r.data.nao_achados || []));
      } catch (e) { erros.push(`${f.name}: ${e.response?.data?.erro || 'erro'}`); }
    }
    setMsg(`✅ ${at} ID(s)/vínculo(s) preenchidos no cadastro.` + (nao.length ? ` ⚠️ ${nao.length} CPF(s) sem colaborador no sistema (outras razões sociais ou cadastro faltando).` : '') + (erros.length ? ' ' + erros.join(' · ') : ''));
    carregar(); carregarContas();
  }
  async function salvarConta(c) {
    try { const r = await API.post('/premiacao-fechamento/contas', c); setContas(r.data.contas || []); setMsg('✅ Conta Pay X salva.'); }
    catch { setMsg('Erro ao salvar a conta.'); }
  }

  async function subirArquivos(files) {
    setMsg('');
    const lista = Array.from(files || []);
    if (!lista.length) return;
    let ok = 0; const erros = [];
    for (const f of lista) {
      try {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        const r = await API.post('/premiacao-fechamento/importar', { conteudoBase64: b64, nomeArquivo: f.name });
        ok++;
        // se o relatório for de outro período, pula pra ele
        if (r.data.mes && (r.data.mes !== mes || r.data.ano !== ano)) { setMes(r.data.mes); setAno(r.data.ano); }
      } catch (e) { erros.push(`${f.name}: ${e.response?.data?.erro || 'erro'}`); }
    }
    setMsg((ok ? `✅ ${ok} relatório(s) importado(s). ` : '') + (erros.length ? '⚠️ ' + erros.join(' · ') : ''));
    carregar();
  }

  async function salvarLinha(l, patch) {
    if (fechado) return;
    const body = {
      mes, ano, colaborador_id: l.colaborador_id,
      premiacao_pct: l.premiacao_pct, meta_bateu: l.meta_bateu, gestao_valor: l.gestao_valor,
      dif_caixa: l.dif_caixa, outros_desc: l.outros_desc, obs: l.obs, ...patch,
    };
    // recálculo local pra resposta imediata
    setDados(d => ({ ...d, linhas: d.linhas.map(x => x === l ? recalc({ ...x, ...patch }) : x) }));
    try { await API.post('/premiacao-fechamento/item', body); } catch { setMsg('Erro ao salvar linha.'); }
  }
  function recalc(l) {
    const premiacao_valor = l.premiacao_pct != null ? round(l.premiacao_venda * l.premiacao_pct / 100) : 0;
    const gestao_valor = l.gestao ? (Number(l.gestao_valor) || 0) : 0;
    const bruto = round(premiacao_valor + l.perfumaria_valor + l.vitaminas_valor + l.unidades_valor + l.kits_valor + gestao_valor);
    const descontos = round((Number(l.dif_caixa) || 0) + (Number(l.outros_desc) || 0));
    return { ...l, premiacao_valor, gestao_valor, bruto, descontos, liquido: round(bruto - descontos) };
  }

  async function salvarCfg() {
    try { const r = await API.post('/premiacao-fechamento/config', cfg); setCfg(r.data.cfg); setMsg('✅ Valores salvos.'); carregar(); }
    catch { setMsg('Erro ao salvar valores.'); }
  }

  const fechado = !!dados.fechado;
  async function fecharMes(reabrir) {
    if (!reabrir && !window.confirm('Fechar o mês trava todas as decisões e os relatórios deste período. Continuar?')) return;
    try { await API.post('/premiacao-fechamento/' + (reabrir ? 'reabrir' : 'fechar'), { mes, ano }); setMsg(reabrir ? '🔓 Mês reaberto.' : '🔒 Mês fechado.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao mudar o status.'); }
  }
  async function exportarCarga() {
    try {
      const r = await API.get('/premiacao-fechamento/exportar', { params: { mes, ano }, responseType: 'blob' });
      const semId = Number(r.headers['x-sem-id'] || 0);
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data);
      a.download = `carga_premiacao_${String(mes).padStart(2, '0')}_${ano}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
      setMsg(semId ? `✅ Carga gerada. ⚠️ ${semId} colaborador(es) pagáveis SEM ID Premiação no cadastro — preencha o ID para não sair em branco.` : '✅ Carga gerada no modelo Pay X Virtual.');
    } catch { setMsg('Erro ao exportar a carga.'); }
  }

  const linhas = dados.linhas
    .filter(l => !filtro || String(l.nome).toLowerCase().includes(filtro.toLowerCase()))
    .filter(l => !soPendentes || l.premiacao_venda > 0 && l.premiacao_pct == null);

  return (
    <div style={s.wrap}>
      <Banner emoji="💵" titulo="Fechamento de Premiação" cor="verde" sub="Suba os relatórios do ERP, escolha os % e os descontos, e feche o prêmio por colaborador." />

      {/* período + upload */}
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={s.sel} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          <input style={{ ...s.sel, width: 90 }} type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
          <label style={{ ...s.upload, opacity: fechado ? 0.45 : 1, pointerEvents: fechado ? 'none' : 'auto' }}>
            ⬆️ Subir relatórios (Premiação, Perfumaria, Kits, Unidades, Vitaminas)
            <input type="file" multiple accept=".xls,.xlsx,.csv" style={{ display: 'none' }} disabled={fechado} onChange={e => subirArquivos(e.target.files)} />
          </label>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['premiacao', 'perfumaria', 'kits', 'unidades', 'vitaminas'].map(t => {
              const tem = (dados.relatorios || []).includes(t);
              return <span key={t} style={{ ...s.chip, ...(tem ? s.chipOn : {}) }}>{tem ? '✓ ' : '○ '}{TIPO_LBL[t]}</span>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          {fechado
            ? <span style={{ ...s.chip, background: '#FBE7E2', borderColor: '#A3372A', color: '#A3372A', fontWeight: 700 }}>🔒 Mês fechado{dados.fechado_por ? ' · ' + dados.fechado_por : ''}</span>
            : <span style={{ ...s.chip, ...s.chipOn }}>🔓 Em aberto</span>}
          <label style={{ ...s.btnSec, opacity: fechado ? 0.45 : 1, pointerEvents: fechado ? 'none' : 'auto' }}>
            🎟️ Importar IDs/vínculos (cargas)
            <input type="file" multiple accept=".xls,.xlsx" style={{ display: 'none' }} disabled={fechado} onChange={e => subirIds(e.target.files)} />
          </label>
          <button style={s.btnSec} onClick={exportarCarga} disabled={!dados.relatorios.length}>⬇️ Exportar carga (Pay X Virtual)</button>
          {fechado
            ? <button style={s.btnSec} onClick={() => fecharMes(true)}>🔓 Reabrir mês</button>
            : <button style={s.btn} onClick={() => fecharMes(false)} disabled={!dados.relatorios.length}>🔒 Fechar mês</button>}
        </div>
        {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith('✅') || msg.startsWith('🔒') || msg.startsWith('🔓') ? '#0C5A43' : '#993C1D' }}>{msg}</div>}
      </div>

      {/* valores cadastráveis */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Valores do fechamento</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Campo label="R$/unidade (Unidades vendidas)" v={cfg.uv_valor_un} on={v => setCfg({ ...cfg, uv_valor_un: v })} step="0.01" />
          <Campo label="Kit caixa — mínimo (un)" v={cfg.kit_min} on={v => setCfg({ ...cfg, kit_min: v })} />
          <Campo label="Kit caixa — ≥ mínimo (R$)" v={cfg.kit_alto} on={v => setCfg({ ...cfg, kit_alto: v })} step="0.01" />
          <Campo label="Kit caixa — < mínimo (R$)" v={cfg.kit_baixo} on={v => setCfg({ ...cfg, kit_baixo: v })} step="0.01" />
          <button style={s.btn} onClick={salvarCfg}>Salvar valores</button>
        </div>
        <div style={{ fontSize: 11, color: '#7a8a8c', marginTop: 6 }}>As vitaminas são pagas por faixa de quantidade (R$/unidade) — edite abaixo quando precisar.</div>
      </div>

      <FaixasVitaminas API={API} onSalvo={carregar} />

      {/* contas Pay X por CNPJ */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🏦 Contas Pay X (uma carga por CNPJ)</div>
        <div style={{ fontSize: 11, color: '#7a8a8c', marginBottom: 10 }}>Cada conta vira uma aba no export. Produto, código e taxa saem no cabeçalho da carga — ajuste aqui se precisar. Capturadas ao importar as cargas.</div>
        {contas.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma conta ainda. Importe as cargas preenchidas (botão acima) para capturar os CNPJs.</div>}
        {contas.map((c, i) => (
          <div key={c.cnpj} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, width: 150 }}>{c.cnpj_fmt || c.cnpj}</span>
            <input style={{ ...s.inNum, width: 190, textAlign: 'left' }} value={c.empresa_nome || ''} placeholder="Empresa" onChange={e => setContas(cs => cs.map((x, j) => j === i ? { ...x, empresa_nome: e.target.value } : x))} />
            <input style={{ ...s.inNum, width: 170, textAlign: 'left' }} value={c.produto || ''} placeholder="Produto" onChange={e => setContas(cs => cs.map((x, j) => j === i ? { ...x, produto: e.target.value } : x))} />
            <input style={{ ...s.inNum, width: 60, textAlign: 'left' }} value={c.codigo || ''} placeholder="Cód" onChange={e => setContas(cs => cs.map((x, j) => j === i ? { ...x, codigo: e.target.value } : x))} />
            <span style={{ fontSize: 11, color: '#7a8a8c' }}>Taxa</span>
            <input style={{ ...s.inNum, width: 64 }} type="number" step="0.01" value={c.taxa_adm ?? ''} placeholder="%" onChange={e => setContas(cs => cs.map((x, j) => j === i ? { ...x, taxa_adm: e.target.value } : x))} />
            <span style={{ fontSize: 11, color: '#7a8a8c' }}>%</span>
            <button style={s.btnSec} onClick={() => salvarConta(contas[i])}>Salvar</button>
          </div>
        ))}
      </div>

      {/* resumo */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat t="Colaboradores" v={dados.resumo.colaboradores || 0} />
        <Stat t="Prêmio bruto" v={brl(dados.resumo.bruto)} acc="#0E7C5A" />
        <Stat t="Descontos" v={brl(dados.resumo.descontos)} acc="#A3372A" />
        <Stat t="Líquido a pagar" v={brl(dados.resumo.liquido)} acc="#0E7C5A" forte />
        {dados.resumo.sem_cadastro ? <Stat t="Sem cadastro" v={dados.resumo.sem_cadastro} acc="#B45309" /> : null}
      </div>

      {/* tabela */}
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <input style={{ ...s.sel, width: 220 }} placeholder="Buscar colaborador…" value={filtro} onChange={e => setFiltro(e.target.value)} />
          <label style={{ fontSize: 12, color: '#444', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} /> Só quem falta escolher o %
          </label>
          {carregando && <span style={{ fontSize: 12, color: '#999' }}>carregando…</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a8a8c' }}>{linhas.length} linha(s)</span>
        </div>
        {dados.relatorios.length === 0 && <div style={{ fontSize: 13, color: '#999', padding: 10 }}>Nenhum relatório importado para {String(mes).padStart(2, '0')}/{ano}. Suba os arquivos acima.</div>}
        {dados.relatorios.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead>
                <tr>
                  <th style={s.th}>Colaborador</th>
                  <th style={s.thR}>Venda</th>
                  <th style={s.thC}>%</th>
                  <th style={s.thR}>Premiação</th>
                  <th style={s.thR}>Perfum.</th>
                  <th style={s.thR}>Vitam.</th>
                  <th style={s.thR}>Unid.</th>
                  <th style={s.thR}>Kits</th>
                  <th style={s.thC}>Gestão</th>
                  <th style={s.thR}>Dif. caixa</th>
                  <th style={s.thR}>Outros</th>
                  <th style={s.thR}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.colaborador_id || 'x' + i} style={{ borderTop: '1px solid #f0f2f4', background: l.sem_cadastro ? '#FBF6EC' : 'transparent' }}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{l.nome}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        {l.loja_nome && <span style={s.tag}>{l.loja_nome}</span>}
                        {l.perfumista && <span style={{ ...s.tag, ...s.tagPink }}>perfum.</span>}
                        {l.caixa && <span style={{ ...s.tag, ...s.tagGreen }}>caixa</span>}
                        {l.gestao && <span style={{ ...s.tag, ...s.tagAmber }}>{l.gestao === 'gerente' ? 'gerente' : 'liderança'}</span>}
                        {l.sem_cadastro && <span style={{ ...s.tag, ...s.tagWarn }}>sem cadastro</span>}
                        {l.inativo && <span style={{ ...s.tag, ...s.tagWarn }}>inativo</span>}
                      </div>
                    </td>
                    <td style={s.tdR}>{l.premiacao_venda ? brl(l.premiacao_venda) : '—'}</td>
                    <td style={s.tdC}>
                      {l.premiacao_venda > 0 && !l.sem_cadastro ? (
                        <select style={s.selMini} disabled={fechado} value={l.premiacao_pct ?? ''} onChange={e => salvarLinha(l, { premiacao_pct: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">—</option><option value="3">3%</option><option value="4">4%</option><option value="5">5%</option>
                        </select>
                      ) : '—'}
                    </td>
                    <td style={{ ...s.tdR, fontWeight: 700, color: l.premiacao_valor ? '#0E7C5A' : '#bbb' }}>{l.premiacao_valor ? brl(l.premiacao_valor) : '—'}</td>
                    <td style={s.tdR} title={l.perfumaria_venda ? `${brl(l.perfumaria_venda)} × ${l.perfumaria_pct}%` : ''}>{l.perfumaria_valor ? brl(l.perfumaria_valor) : '—'}</td>
                    <td style={s.tdR} title={l.vitaminas_qtd ? `${l.vitaminas_qtd} un × ${brl(l.vitaminas_un)}` : ''}>{l.vitaminas_valor ? brl(l.vitaminas_valor) : '—'}</td>
                    <td style={s.tdR} title={l.unidades_qtd ? `${l.unidades_qtd} un` : ''}>{l.unidades_valor ? brl(l.unidades_valor) : '—'}</td>
                    <td style={s.tdR} title={l.kits_qtd ? `${l.kits_qtd} kits` : ''}>{l.kits_valor ? brl(l.kits_valor) : (l.kits_qtd ? l.kits_qtd + 'un' : '—')}</td>
                    <td style={s.tdC}>
                      {l.gestao && !l.sem_cadastro ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                          <label style={{ fontSize: 10, color: '#444', display: 'flex', gap: 3, alignItems: 'center' }}>
                            <input type="checkbox" disabled={fechado} checked={!!l.meta_bateu} onChange={e => salvarLinha(l, { meta_bateu: e.target.checked })} /> bateu
                          </label>
                          <input style={{ ...s.inNum, width: 74 }} type="number" disabled={fechado} placeholder="R$" value={l.gestao_valor || ''} onChange={e => salvarLinha(l, { gestao_valor: Number(e.target.value) || 0 })} />
                        </div>
                      ) : '—'}
                    </td>
                    <td style={s.tdR}>{!l.sem_cadastro ? <input style={s.inNum} type="number" disabled={fechado} placeholder="0" value={l.dif_caixa || ''} onChange={e => salvarLinha(l, { dif_caixa: Number(e.target.value) || 0 })} /> : '—'}</td>
                    <td style={s.tdR}>{!l.sem_cadastro ? <input style={s.inNum} type="number" disabled={fechado} placeholder="0" value={l.outros_desc || ''} onChange={e => salvarLinha(l, { outros_desc: Number(e.target.value) || 0 })} /> : '—'}</td>
                    <td style={{ ...s.tdR, fontWeight: 800, color: '#13233a' }}>{brl(l.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={s.info}>💡 A base vem dos relatórios "Análise de Plano de Remuneração" do ERP (os que você baixa). Suba os 5 e o sistema cruza com o cadastro. Só o 💄 perfumista recebe perfumaria, só o 💰 caixa recebe kits, e o 🏅 gerente/liderança recebe a premiação de gestão (marque "bateu" e informe o valor). Linhas em bege são nomes do relatório sem cadastro no sistema — ajuste o cadastro (ou marque os marcadores) para entrarem no cálculo.</div>
    </div>
  );
}

const round = n => Math.round((Number(n) || 0) * 100) / 100;

// Editor das faixas de vitaminas (R$/unidade por quantidade) — mesma tabela usada no cálculo.
function FaixasVitaminas({ API, onSalvo }) {
  const [faixas, setFaixas] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get('/regras/vitaminas').then(r => setFaixas(r.data.faixas || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const set = (i, campo, v) => setFaixas(fs => fs.map((f, j) => j === i ? { ...f, [campo]: v } : f));
  const add = () => setFaixas(fs => [...fs, { min_un: '', valor: '' }]);
  const rem = i => setFaixas(fs => fs.filter((_, j) => j !== i));
  async function salvar() {
    const lista = faixas.map(f => ({ min_un: parseInt(f.min_un, 10) || 0, valor: Number(f.valor) || 0 }));
    const r = await API.post('/regras/vitaminas', { faixas: lista });
    setFaixas(r.data.faixas || []); setMsg('✅ Faixas salvas.'); setTimeout(() => setMsg(''), 2500);
    if (onSalvo) onSalvo();
  }
  const ordenadas = [...faixas].sort((a, b) => (parseInt(a.min_un, 10) || 0) - (parseInt(b.min_un, 10) || 0));
  const fmt = (f, i, arr) => {
    const min = parseInt(f.min_un, 10) || 0;
    const prox = arr[i + 1] ? (parseInt(arr[i + 1].min_un, 10) || 0) : null;
    if (min === 0) return prox ? `até ${prox - 1} un` : 'qualquer qtd';
    return prox ? `de ${min} a ${prox - 1} un` : `${min}+ un`;
  };

  return (
    <div style={s.card}>
      <button onClick={() => setAberto(a => !a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0E7C5A', padding: 0 }}>
        💊 Faixas de vitaminas (R$/unidade) {aberto ? '▲' : '▼'}
      </button>
      {aberto && (
        <div style={{ marginTop: 10 }}>
          {ordenadas.map((f, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#7a8a8c' }}>a partir de</span>
              <input style={{ ...s.inNum, width: 70, textAlign: 'left' }} type="number" value={f.min_un} onChange={e => set(faixas.indexOf(f), 'min_un', e.target.value)} placeholder="un" />
              <span style={{ fontSize: 11, color: '#7a8a8c' }}>un →</span>
              <input style={{ ...s.inNum, width: 90, textAlign: 'left' }} type="number" step="0.01" value={f.valor} onChange={e => set(faixas.indexOf(f), 'valor', e.target.value)} placeholder="R$/un" />
              <span style={{ flex: 1, fontSize: 12, color: '#555' }}>{fmt(f, i, arr)} → <strong>{brl(f.valor)}/un</strong></span>
              <button onClick={() => rem(faixas.indexOf(f))} style={{ border: 'none', background: 'none', color: '#A3372A', cursor: 'pointer', fontSize: 15 }} title="Remover">✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <button onClick={add} style={{ fontSize: 12, padding: '5px 11px', background: '#fff', color: '#0E7C5A', border: '1px solid #0E7C5A', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>+ faixa</button>
            <button style={s.btn} onClick={salvar}>Salvar faixas</button>
            {msg && <span style={{ fontSize: 12, color: '#0C5A43' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, v, on, step }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#5d6b6e' }}>
      {label}
      <input style={s.inNum} type="number" step={step || '1'} value={v ?? ''} onChange={e => on(e.target.value === '' ? '' : Number(e.target.value))} />
    </label>
  );
}
function Stat({ t, v, acc, forte }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecf1', borderRadius: 14, padding: '12px 16px', minWidth: 150, boxShadow: '0 1px 3px rgba(16,24,40,.05)', borderLeft: `4px solid ${acc || '#cbd3d6'}` }}>
      <div style={{ fontSize: 11, color: '#7a8a8c', fontWeight: 600 }}>{t}</div>
      <div style={{ fontSize: forte ? 22 : 18, fontWeight: 800, color: acc || '#13233a', marginTop: 2 }}>{v}</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1280, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #e9ecf1', borderRadius: 16, boxShadow: '0 1px 3px rgba(16,24,40,.06)', padding: '1rem', marginBottom: 12 },
  sel: { padding: '8px 10px', fontSize: 13, border: '1px solid #dfe3e8', borderRadius: 10, background: '#fff' },
  selMini: { padding: '4px 6px', fontSize: 12, border: '1px solid #dfe3e8', borderRadius: 8, background: '#fff' },
  inNum: { width: 80, padding: '5px 7px', fontSize: 12, border: '1px solid #dfe3e8', borderRadius: 8, textAlign: 'right', boxSizing: 'border-box' },
  upload: { fontSize: 12.5, fontWeight: 700, padding: '9px 15px', borderRadius: 10, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#0E7C5A,#0C6A7E)', boxShadow: '0 8px 16px -8px rgba(14,124,90,.5)' },
  btn: { fontSize: 13, fontWeight: 700, padding: '9px 16px', background: 'linear-gradient(135deg,#0E7C5A,#0C6A7E)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  btnSec: { fontSize: 12.5, fontWeight: 600, padding: '8px 14px', background: '#fff', color: '#0E7C5A', border: '1px solid #0E7C5A', borderRadius: 10, cursor: 'pointer' },
  chip: { fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid #dfe3e8', color: '#8a979a', background: '#fff' },
  chipOn: { background: '#E7F4EF', borderColor: '#0E7C5A', color: '#0C5A43', fontWeight: 600 },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#7a8a8c', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' },
  thR: { textAlign: 'right', padding: '6px 8px', color: '#7a8a8c', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' },
  thC: { textAlign: 'center', padding: '6px 8px', color: '#7a8a8c', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' },
  td: { padding: '7px 8px', verticalAlign: 'top' },
  tdR: { padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' },
  tdC: { padding: '7px 8px', textAlign: 'center', verticalAlign: 'middle' },
  tag: { fontSize: 9, padding: '1px 6px', borderRadius: 5, background: '#eef2f1', color: '#5d6b6e' },
  tagPink: { background: '#FBEAF3', color: '#9E3B7A' }, tagGreen: { background: '#E7F4EF', color: '#0C5A43' },
  tagAmber: { background: '#FBF3E2', color: '#8A5A12' }, tagWarn: { background: '#FBE7E2', color: '#A3372A' },
  info: { background: '#E7F4EF', borderLeft: '3px solid #0E7C5A', borderRadius: '0 10px 10px 0', padding: '11px 13px', fontSize: 12, color: '#0C5A43', lineHeight: 1.6 },
};
