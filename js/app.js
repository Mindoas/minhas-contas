// =========================================================
// Minhas Contas — lógica principal
// =========================================================
(function () {
  'use strict';

  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  const FORMAS = {
    pix:      { nome: 'Pix',              icone: '📱' },
    dinheiro: { nome: 'Dinheiro',         icone: '💵' },
    debito:   { nome: 'Cartão de débito', icone: '💳' }
  };
  const TAMANHOS_FONTE = [17, 19, 21, 23, 26];
  const ICONES = ['🛒','💊','💡','🚰','🔥','🌐','🍞','🩺','🚌','🏠','🔧','🐶','🎉','📦',
                  '👴','📄','💼','🏘️','🤝','👕','✂️','⛪','🎁','📚','🚗','⛽','🧴','🧹',
                  '🥩','🍎','☕','📺','💇','🦷','👓','🏥'];
  const CORES = ['#5b9a68','#d16b6b','#d9a441','#4a90b8','#d9824a','#6b7fc4','#b0855a','#c46b9a','#5aa3a3','#8a7bc4','#7a8a99','#8a94a6'];
  const TEMPO_BLOQUEIO_MS = 5 * 60 * 1000;

  const estado = {
    usuario: null,
    categorias: [],
    cache: {},               // lançamentos já carregados, por id
    mesHist: new Date(),
    mesRel: new Date(),
    filtroTipo: 'todos',
    filtroCat: '',
    catTipoAjuste: 'gasto',
    registro: null,
    pin: { modo: 'entrar', digitado: '', primeiro: '', tentativas: 0, depois: 'tela-inicio' },
    escondidoEm: null
  };

  // ---------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inicioMes = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const fimMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const nomeMes = (d) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
  const doisDig = (n) => String(n).padStart(2, '0');
  const dataInput = (d) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
  const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ehMesAtual = (d) => { const h = new Date(); return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth(); };

  function rotuloDia(d) {
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    if (mesmoDia(d, hoje)) return 'Hoje';
    if (mesmoDia(d, ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function rotuloDiaHora(iso) {
    const d = new Date(iso);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dia = rotuloDia(d);
    return (dia === 'Hoje' || dia === 'Ontem') ? `${dia}, ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
  }

  const armazenamento = {
    ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
    gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
    apagar(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } }
  };

  const categoria = (id) => estado.categorias.find((c) => c.id === id) || { nome: 'Sem categoria', icone: '❔', cor: '#8a94a6' };
  const fundoIcone = (cor) => `${cor}22`;

  function mensagemErro(erro) {
    const m = String(erro?.message || erro || '');
    if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
    if (/failed to fetch|network/i.test(m)) return 'Sem conexão com a internet. Tente de novo.';
    return 'Algo deu errado. Tente de novo.';
  }

  // ---------------------------------------------------------
  // Aviso (toast) e janela (modal)
  // ---------------------------------------------------------
  let avisoTimer = null;
  function mostrarAviso(texto, { acao, aoAcao, aoFechar, duracao = 3500 } = {}) {
    clearTimeout(avisoTimer);
    const aviso = $('aviso'), botao = $('aviso-acao');
    $('aviso-texto').textContent = texto;
    botao.classList.toggle('oculto', !acao);
    botao.textContent = acao || '';
    botao.onclick = () => { clearTimeout(avisoTimer); aviso.classList.add('oculto'); aoAcao && aoAcao(); };
    aviso.classList.remove('oculto');
    avisoTimer = setTimeout(() => { aviso.classList.add('oculto'); aoFechar && aoFechar(); }, duracao);
  }

  function abrirModal({ titulo, corpo = '', botoes = [] }) {
    $('modal-titulo').textContent = titulo;
    $('modal-corpo').innerHTML = corpo;
    const caixa = $('modal-botoes');
    caixa.innerHTML = '';
    botoes.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn ${b.classe || 'btn-secundario'}`;
      el.innerHTML = b.texto;
      el.onclick = b.acao || fecharModal;
      caixa.appendChild(el);
    });
    if ($('aviso-acao').classList.contains('oculto')) $('aviso').classList.add('oculto');
    $('modal').classList.remove('oculto');
  }
  function fecharModal() { $('modal').classList.add('oculto'); }

  function confirmar(titulo, corpo, textoSim = 'Sim', classeSim = 'btn-primario') {
    return new Promise((resolver) => {
      abrirModal({
        titulo, corpo: `<p style="text-align:center">${corpo}</p>`,
        botoes: [
          { texto: textoSim, classe: classeSim, acao: () => { fecharModal(); resolver(true); } },
          { texto: 'Não, voltar', classe: 'btn-secundario', acao: () => { fecharModal(); resolver(false); } }
        ]
      });
    });
  }

  // ---------------------------------------------------------
  // Navegação entre telas
  // ---------------------------------------------------------
  function mostrarTela(id) {
    $$('.tela').forEach((t) => t.classList.toggle('ativa', t.id === id));
    const comNav = $(id).classList.contains('com-nav');
    $('nav-inferior').classList.toggle('oculto', !comNav);
    $$('#nav-inferior button').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === id));
    window.scrollTo(0, 0);
    if (id === 'tela-inicio') carregarInicio();
    if (id === 'tela-historico') carregarHistorico();
    if (id === 'tela-relatorios') carregarRelatorios();
    if (id === 'tela-ajustes') renderAjustes();
  }
  $$('#nav-inferior button').forEach((b) => b.addEventListener('click', () => mostrarTela(b.dataset.tela)));

  // ---------------------------------------------------------
  // Tamanho da letra
  // ---------------------------------------------------------
  function aplicarFonte() {
    let i = parseInt(armazenamento.ler('fonte') ?? '1', 10);
    if (isNaN(i) || i < 0 || i >= TAMANHOS_FONTE.length) i = 1;
    document.documentElement.style.setProperty('--fonte-base', `${TAMANHOS_FONTE[i]}px`);
    return i;
  }
  function mudarFonte(delta) {
    const i = Math.min(TAMANHOS_FONTE.length - 1, Math.max(0, aplicarFonte() + delta));
    armazenamento.gravar('fonte', String(i));
    aplicarFonte();
  }
  $('btn-fonte-mais').onclick = () => mudarFonte(1);
  $('btn-fonte-menos').onclick = () => mudarFonte(-1);

  // ---------------------------------------------------------
  // Teclado numérico (reutilizado no PIN e no valor)
  // ---------------------------------------------------------
  function montarTeclado(el, teclas, aoTocar) {
    el.innerHTML = '';
    teclas.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (t === '') { b.style.visibility = 'hidden'; b.tabIndex = -1; }
      b.className = 'tecla' + (t === '⌫' ? ' tecla-apagar' : '');
      b.textContent = t;
      if (t === '⌫') b.setAttribute('aria-label', 'Apagar');
      b.addEventListener('click', () => aoTocar(t));
      el.appendChild(b);
    });
  }

  // ---------------------------------------------------------
  // Login (e-mail e senha — só na primeira vez)
  // ---------------------------------------------------------
  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    const erro = $('login-erro');
    erro.textContent = '';
    if (!email || !senha) { erro.textContent = 'Preencha o e-mail e a senha.'; return; }
    const botao = e.submitter || $('form-login').querySelector('button');
    botao.disabled = true; botao.textContent = 'Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    botao.disabled = false; botao.textContent = 'Entrar';
    if (error) { erro.textContent = mensagemErro(error); return; }
    $('login-senha').value = '';
    aposLogin(data.user);
  });

  async function sair() {
    if (estado.usuario) armazenamento.apagar(`pin_${estado.usuario.id}`);
    await sb.auth.signOut();
    estado.usuario = null;
    estado.categorias = [];
    estado.cache = {};
    mostrarTela('tela-login');
  }
  $('btn-sair').onclick = async () => {
    if (await confirmar('Sair da conta?', 'Para entrar de novo será preciso o e-mail e a senha.', 'Sim, sair', 'btn-perigo')) sair();
  };

  // ---------------------------------------------------------
  // PIN de 4 números (guardado neste aparelho, só o "resumo")
  // ---------------------------------------------------------
  async function resumoPin(pin) {
    const texto = `${estado.usuario.id}:${pin}`;
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0; for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0; return `x${h}`;
  }
  const chavePin = () => `pin_${estado.usuario.id}`;

  function abrirPin(modo, depois = 'tela-inicio') {
    Object.assign(estado.pin, { modo, digitado: '', primeiro: '', depois });
    const textos = {
      entrar:    ['Digite sua senha', 'São 4 números.'],
      criar:     ['Crie uma senha', 'Escolha 4 números fáceis de lembrar.'],
      confirmar: ['Digite de novo', 'Para confirmar a senha.']
    };
    $('pin-titulo').textContent = textos[modo][0];
    $('pin-sub').textContent = textos[modo][1];
    $('pin-erro').textContent = '';
    $('btn-esqueci-pin').classList.toggle('oculto', modo !== 'entrar');
    atualizarBolinhas();
    mostrarTela('tela-pin');
  }
  function atualizarBolinhas() {
    $$('#pin-bolinhas span').forEach((s, i) => s.classList.toggle('cheia', i < estado.pin.digitado.length));
  }

  montarTeclado($('teclado-pin'), ['1','2','3','4','5','6','7','8','9','','0','⌫'], async (t) => {
    const p = estado.pin;
    if (t === '⌫') { p.digitado = p.digitado.slice(0, -1); atualizarBolinhas(); return; }
    if (p.digitado.length >= 4) return;
    p.digitado += t;
    atualizarBolinhas();
    if (p.digitado.length < 4) return;

    await new Promise((r) => setTimeout(r, 150));
    if (p.modo === 'criar') {
      const primeiro = p.digitado;
      abrirPin('confirmar', p.depois);
      estado.pin.primeiro = primeiro;
    } else if (p.modo === 'confirmar') {
      if (p.digitado !== p.primeiro) {
        abrirPin('criar', p.depois);
        $('pin-erro').textContent = 'Os números não bateram. Vamos começar de novo.';
        return;
      }
      armazenamento.gravar(chavePin(), await resumoPin(p.digitado));
      mostrarAviso('✅ Senha criada!');
      desbloqueado(p.depois);
    } else {
      if (await resumoPin(p.digitado) === armazenamento.ler(chavePin())) {
        p.tentativas = 0;
        desbloqueado(p.depois);
      } else {
        p.tentativas++;
        p.digitado = '';
        atualizarBolinhas();
        if (p.tentativas >= 5) {
          mostrarAviso('Muitas tentativas. Entre com e-mail e senha.');
          sair();
          return;
        }
        $('pin-erro').textContent = 'Senha errada. Tente de novo.';
      }
    }
  });

  $('btn-esqueci-pin').onclick = async () => {
    if (await confirmar('Esqueceu a senha?', 'Sem problema. Você vai entrar de novo com o e-mail e a senha da conta e depois criar outros 4 números.', 'Entendi, continuar')) sair();
  };
  $('btn-trocar-pin').onclick = () => abrirPin('criar', 'tela-ajustes');

  // Bloqueia de novo se o app ficar fechado por muito tempo
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { estado.escondidoEm = Date.now(); return; }
    if (estado.usuario && estado.escondidoEm && Date.now() - estado.escondidoEm > TEMPO_BLOQUEIO_MS
        && armazenamento.ler(chavePin()) && !$('tela-pin').classList.contains('ativa')) {
      fecharModal();
      abrirPin('entrar', 'tela-inicio');
    }
    estado.escondidoEm = null;
  });

  async function aposLogin(usuario) {
    estado.usuario = usuario;
    if (armazenamento.ler(chavePin())) abrirPin('entrar');
    else abrirPin('criar');
  }

  async function desbloqueado(destino) {
    if (!estado.categorias.length) await carregarCategorias();
    mostrarTela(destino);
  }

  // ---------------------------------------------------------
  // Categorias
  // ---------------------------------------------------------
  async function carregarCategorias() {
    const { data, error } = await sb.from('categorias').select('*').order('ordem').order('nome');
    if (error) { mostrarAviso(mensagemErro(error)); return; }
    estado.categorias = data;
  }

  // ---------------------------------------------------------
  // Item de lista (lançamento)
  // ---------------------------------------------------------
  function itemHTML(l) {
    const c = categoria(l.categoria_id);
    const sinal = l.tipo === 'gasto' ? '−' : '+';
    const cor = l.tipo === 'gasto' ? 'cor-gasto' : 'cor-entrada';
    const partes = [rotuloDiaHora(l.data)];
    if (l.forma_pagamento) partes.push(FORMAS[l.forma_pagamento].nome);
    if (l.foto_path) partes.push('📎 foto');
    return `<li><button class="item" type="button" data-id="${l.id}">
      <span class="item-icone" style="background:${fundoIcone(c.cor)}" aria-hidden="true">${c.icone}</span>
      <span class="item-meio">
        <span class="item-nome">${escapar(l.descricao || c.nome)}</span>
        <span class="item-info">${escapar(partes.join(' · '))}</span>
      </span>
      <span class="item-valor ${cor}">${sinal} ${moeda(l.valor)}</span>
    </button></li>`;
  }
  function ligarItens(raiz) {
    $$('.item[data-id]', raiz).forEach((b) => b.addEventListener('click', () => abrirDetalhe(Number(b.dataset.id))));
  }
  function guardarNoCache(lista) { lista.forEach((l) => { estado.cache[l.id] = l; }); }

  // ---------------------------------------------------------
  // Início
  // ---------------------------------------------------------
  async function carregarInicio() {
    const agora = new Date();
    const h = agora.getHours();
    $('saudacao').textContent = h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
    $('inicio-mes').textContent = nomeMes(agora);

    const [mes, ultimos] = await Promise.all([
      sb.from('lancamentos').select('tipo, valor')
        .gte('data', inicioMes(agora).toISOString()).lt('data', fimMes(agora).toISOString()),
      sb.from('lancamentos').select('*').order('data', { ascending: false }).limit(5)
    ]);
    if (mes.error || ultimos.error) { mostrarAviso(mensagemErro(mes.error || ultimos.error)); return; }

    let entrou = 0, saiu = 0;
    mes.data.forEach((l) => { if (l.tipo === 'entrada') entrou += Number(l.valor); else saiu += Number(l.valor); });
    $('res-entrou').textContent = moeda(entrou);
    $('res-saiu').textContent = moeda(saiu);
    const sobra = $('res-sobrou');
    sobra.textContent = moeda(entrou - saiu);
    sobra.className = 'resumo-valor ' + (entrou - saiu < 0 ? 'cor-gasto' : 'cor-entrada');

    guardarNoCache(ultimos.data);
    const lista = $('lista-ultimos');
    lista.innerHTML = ultimos.data.length
      ? ultimos.data.map(itemHTML).join('')
      : '<li class="vazio">Nada registrado ainda.<br>Toque em "Registrar gasto" para começar.</li>';
    ligarItens(lista);
  }

  // ---------------------------------------------------------
  // Registro passo a passo
  // ---------------------------------------------------------
  function passosDoRegistro() {
    return estado.registro.tipo === 'gasto'
      ? ['valor', 'categoria', 'forma', 'confirmar']
      : ['valor', 'categoria', 'confirmar'];
  }

  function novoRegistro(tipo, extra = {}) {
    estado.registro = {
      tipo, valorTexto: '', categoria_id: null, forma: null, descricao: '',
      data: dataInput(new Date()), dataOriginal: null,
      fotoArquivo: null, fotoPreviaUrl: null, fotoPathExistente: null, removerFotoExistente: false,
      editandoId: null, passo: 'valor', falado: null,
      ...extra
    };
    $('reg-descricao').value = estado.registro.descricao;
    $('reg-data').value = estado.registro.data;
    $('reg-data').max = dataInput(new Date());
    $('reg-erro').textContent = '';
    $('input-camera').value = ''; $('input-galeria').value = '';
    const falado = $('reg-voz');
    falado.classList.toggle('oculto', !estado.registro.falado);
    falado.textContent = estado.registro.falado ? `🎤 Você disse: "${estado.registro.falado}"` : '';
    mostrarTela('tela-registro');
    history.pushState({ registro: true }, '');
    irParaPasso(estado.registro.passo);
  }

  function irParaPasso(passo) {
    const r = estado.registro;
    r.passo = passo;
    const passos = passosDoRegistro();
    $$('.passo').forEach((p) => p.classList.toggle('ativo', p.id === `passo-${passo}`));
    $('reg-passos').textContent = `Passo ${passos.indexOf(passo) + 1} de ${passos.length}`;
    window.scrollTo(0, 0);

    if (passo === 'valor') {
      $('titulo-valor').textContent = r.tipo === 'gasto' ? 'Quanto você gastou?' : 'Quanto você recebeu?';
      atualizarVisor();
    }
    if (passo === 'categoria') renderGradeCategorias();
    if (passo === 'forma') $$('.btn-forma').forEach((b) => b.classList.toggle('selecionada', b.dataset.forma === r.forma));
    if (passo === 'confirmar') renderConfirmacao();
  }

  function voltarPasso() {
    const passos = passosDoRegistro();
    const i = passos.indexOf(estado.registro.passo);
    if (i <= 0) { sairDoRegistro(); return; }
    irParaPasso(passos[i - 1]);
  }
  function sairDoRegistro() {
    if (estado.registro?.fotoPreviaUrl) URL.revokeObjectURL(estado.registro.fotoPreviaUrl);
    estado.registro = null;
    mostrarTela('tela-inicio');
  }
  $('reg-voltar').onclick = () => {
    const ultimoPasso = passosDoRegistro().indexOf(estado.registro.passo) <= 0;
    if (ultimoPasso && history.state?.registro) history.back(); else voltarPasso();
  };
  // Botão "voltar" do celular
  window.addEventListener('popstate', () => {
    if (!$('tela-registro').classList.contains('ativa') || !estado.registro) return;
    const i = passosDoRegistro().indexOf(estado.registro.passo);
    if (i <= 0) sairDoRegistro();
    else { voltarPasso(); history.pushState({ registro: true }, ''); }
  });

  $('btn-novo-gasto').onclick = () => novoRegistro('gasto');
  $('btn-nova-entrada').onclick = () => novoRegistro('entrada');

  // ---- Valor ----
  function valorNumerico() {
    const t = estado.registro.valorTexto;
    return t ? parseFloat(t.replace(',', '.')) : 0;
  }
  function textoDeValor(v) {
    const fixo = Number(v).toFixed(2);
    return fixo.endsWith('.00') ? fixo.slice(0, -3) : fixo.replace('.', ',');
  }
  function atualizarVisor() {
    const t = estado.registro.valorTexto || '0';
    const [inteiro, dec] = t.split(',');
    const inteiroFmt = Number(inteiro || 0).toLocaleString('pt-BR');
    $('visor-valor').textContent = `R$ ${inteiroFmt}${dec !== undefined ? ',' + dec : ''}`;
  }
  montarTeclado($('teclado-valor'), ['1','2','3','4','5','6','7','8','9',',','0','⌫'], (t) => {
    const r = estado.registro;
    let v = r.valorTexto;
    if (t === '⌫') v = v.slice(0, -1);
    else if (t === ',') { if (!v.includes(',')) v = (v || '0') + ','; }
    else {
      const [inteiro, dec] = v.split(',');
      if (dec !== undefined) { if (dec.length < 2) v += t; }
      else if (inteiro.length < 8) v = (inteiro === '0' ? '' : inteiro) + t;
    }
    r.valorTexto = v;
    atualizarVisor();
  });
  $('btn-valor-ok').onclick = () => {
    if (valorNumerico() <= 0) { mostrarAviso('Digite o valor primeiro 🙂'); return; }
    const passos = passosDoRegistro();
    // Se já estava tudo preenchido (veio de "corrigir"), volta direto para a confirmação
    const r = estado.registro;
    if (r.categoria_id && (r.tipo === 'entrada' || r.forma)) irParaPasso('confirmar');
    else irParaPasso(passos[1]);
  };

  // ---- Categoria ----
  function renderGradeCategorias() {
    const r = estado.registro;
    $('titulo-categoria').textContent = r.tipo === 'gasto' ? 'Com o que você gastou?' : 'De onde veio o dinheiro?';
    const cats = estado.categorias.filter((c) => c.tipo === r.tipo && (c.ativa || c.id === r.categoria_id));
    const grade = $('grade-categorias');
    grade.innerHTML = cats.map((c) => `
      <button class="btn-categoria ${c.id === r.categoria_id ? 'selecionada' : ''}" type="button" data-id="${c.id}">
        <span class="cat-icone" style="background:${fundoIcone(c.cor)}" aria-hidden="true">${c.icone}</span>
        <span>${escapar(c.nome)}</span>
      </button>`).join('');
    $$('.btn-categoria', grade).forEach((b) => b.addEventListener('click', () => {
      r.categoria_id = Number(b.dataset.id);
      if (r.tipo === 'gasto' && !r.forma) irParaPasso('forma');
      else irParaPasso('confirmar');
    }));
  }

  // ---- Forma de pagamento ----
  $$('.btn-forma').forEach((b) => b.addEventListener('click', () => {
    estado.registro.forma = b.dataset.forma;
    irParaPasso('confirmar');
  }));

  // ---- Confirmação ----
  function renderConfirmacao() {
    const r = estado.registro;
    const c = categoria(r.categoria_id);
    const verbo = r.tipo === 'gasto' ? 'Você gastou' : 'Você recebeu';
    let html = `
      <p class="conf-linha">${verbo}</p>
      <span class="conf-valor ${r.tipo === 'gasto' ? 'cor-gasto' : 'cor-entrada'}">${moeda(valorNumerico())}</span>
      <p class="conf-linha"><button class="btn-link" data-ir="valor" type="button">mudar valor</button></p>
      <p class="conf-linha">${r.tipo === 'gasto' ? 'com' : 'de'} <strong>${c.icone} ${escapar(c.nome)}</strong>
        <button class="btn-link" data-ir="categoria" type="button">mudar</button></p>`;
    if (r.tipo === 'gasto') {
      const f = FORMAS[r.forma];
      html += `<p class="conf-linha">pago com <strong>${f.icone} ${f.nome}</strong>
        <button class="btn-link" data-ir="forma" type="button">mudar</button></p>`;
    }
    $('confirmacao-resumo').innerHTML = html;
    $$('[data-ir]', $('confirmacao-resumo')).forEach((b) => b.addEventListener('click', () => irParaPasso(b.dataset.ir)));
    renderFoto();
  }

  // ---- Foto ----
  async function renderFoto() {
    const r = estado.registro;
    let url = null;
    if (r.fotoArquivo) url = r.fotoPreviaUrl;
    else if (r.fotoPathExistente && !r.removerFotoExistente) url = await urlDaFoto(r.fotoPathExistente);
    $('foto-previa').classList.toggle('oculto', !url);
    $('botoes-foto').classList.toggle('oculto', !!url);
    if (url) $('foto-previa-img').src = url;
  }
  function aoEscolherFoto(e) {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const r = estado.registro;
    if (r.fotoPreviaUrl) URL.revokeObjectURL(r.fotoPreviaUrl);
    r.fotoArquivo = arquivo;
    r.fotoPreviaUrl = URL.createObjectURL(arquivo);
    renderFoto();
  }
  $('input-camera').addEventListener('change', aoEscolherFoto);
  $('input-galeria').addEventListener('change', aoEscolherFoto);
  $('btn-remover-foto').onclick = () => {
    const r = estado.registro;
    if (r.fotoPreviaUrl) URL.revokeObjectURL(r.fotoPreviaUrl);
    r.fotoArquivo = null; r.fotoPreviaUrl = null;
    if (r.fotoPathExistente) r.removerFotoExistente = true;
    $('input-camera').value = ''; $('input-galeria').value = '';
    renderFoto();
  };

  // Reduz a foto antes de enviar (economiza internet e espaço)
  async function comprimirFoto(arquivo) {
    try {
      const imagem = await createImageBitmap(arquivo);
      const max = 1600;
      const escala = Math.min(1, max / Math.max(imagem.width, imagem.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(imagem.width * escala);
      canvas.height = Math.round(imagem.height * escala);
      canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
      if (!blob) throw new Error('falha');
      return { blob, ext: 'jpg', tipo: 'image/jpeg' };
    } catch {
      const ext = (arquivo.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      return { blob: arquivo, ext, tipo: arquivo.type || 'image/jpeg' };
    }
  }

  async function enviarFoto(arquivo) {
    const { blob, ext, tipo } = await comprimirFoto(arquivo);
    const id = window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const caminho = `${estado.usuario.id}/${id}.${ext}`;
    const { error } = await sb.storage.from(CONFIG.BUCKET_FOTOS).upload(caminho, blob, { contentType: tipo, upsert: false });
    if (error) throw error;
    return caminho;
  }

  const cacheUrls = {};
  async function urlDaFoto(caminho) {
    const guardado = cacheUrls[caminho];
    if (guardado && guardado.expira > Date.now()) return guardado.url;
    const { data, error } = await sb.storage.from(CONFIG.BUCKET_FOTOS).createSignedUrl(caminho, 3600);
    if (error) return null;
    cacheUrls[caminho] = { url: data.signedUrl, expira: Date.now() + 50 * 60 * 1000 };
    return data.signedUrl;
  }
  async function apagarFoto(caminho) {
    if (caminho) await sb.storage.from(CONFIG.BUCKET_FOTOS).remove([caminho]);
  }

  // ---- Salvar ----
  function calcularData(r) {
    const hoje = dataInput(new Date());
    if (r.editandoId && r.dataOriginal && dataInput(new Date(r.dataOriginal)) === r.data) return r.dataOriginal;
    if (r.data === hoje) return new Date().toISOString();
    const [a, m, d] = r.data.split('-').map(Number);
    return new Date(a, m - 1, d, 12, 0, 0).toISOString();
  }

  $('btn-salvar').onclick = async () => {
    const r = estado.registro;
    r.descricao = $('reg-descricao').value.trim();
    r.data = $('reg-data').value || dataInput(new Date());
    const erro = $('reg-erro');
    erro.textContent = '';
    if (r.data > dataInput(new Date())) { erro.textContent = 'O dia não pode ser no futuro.'; return; }

    const botao = $('btn-salvar');
    botao.disabled = true; botao.textContent = 'Salvando…';
    let fotoNova = null;
    try {
      if (r.fotoArquivo) fotoNova = await enviarFoto(r.fotoArquivo);

      let foto_path = r.fotoPathExistente;
      if (fotoNova) foto_path = fotoNova;
      else if (r.removerFotoExistente) foto_path = null;

      const linha = {
        tipo: r.tipo,
        valor: valorNumerico(),
        categoria_id: r.categoria_id,
        forma_pagamento: r.tipo === 'gasto' ? r.forma : null,
        descricao: r.descricao || null,
        foto_path,
        data: calcularData(r)
      };

      const { error } = r.editandoId
        ? await sb.from('lancamentos').update(linha).eq('id', r.editandoId)
        : await sb.from('lancamentos').insert(linha);
      if (error) throw error;

      // Foto antiga substituída ou removida: apaga do armazenamento
      if (r.fotoPathExistente && foto_path !== r.fotoPathExistente) apagarFoto(r.fotoPathExistente);

      const msg = r.editandoId ? '✅ Registro corrigido!' : (r.tipo === 'gasto' ? '✅ Gasto registrado!' : '✅ Dinheiro registrado!');
      const voltarPara = r.editandoId ? (r.voltarPara || 'tela-historico') : 'tela-inicio';
      if (r.fotoPreviaUrl) URL.revokeObjectURL(r.fotoPreviaUrl);
      estado.registro = null;
      if (history.state?.registro) history.replaceState(null, '');
      mostrarTela(voltarPara);
      mostrarAviso(msg);
    } catch (e) {
      if (fotoNova) apagarFoto(fotoNova);
      erro.textContent = mensagemErro(e);
    } finally {
      botao.disabled = false; botao.textContent = '✔ Sim, salvar';
    }
  };

  // ---------------------------------------------------------
  // Registro por voz
  // ---------------------------------------------------------
  let reconhecimento = null;
  $('btn-voz').onclick = () => {
    if (!Voz.suportado()) {
      abrirModal({
        titulo: 'Falar não está disponível',
        corpo: '<p style="text-align:center">Este navegador não permite usar o microfone para registrar.<br>Abra o site pelo <strong>Google Chrome</strong> para usar essa função.</p>',
        botoes: [{ texto: 'Entendi', classe: 'btn-primario' }]
      });
      return;
    }
    abrirModal({
      titulo: 'Pode falar',
      corpo: `<div class="voz-ouvindo">
        <div class="voz-circulo" aria-hidden="true">🎤</div>
        <p class="voz-texto" id="voz-texto"></p>
        <p class="voz-exemplo">Por exemplo:<br>"Gastei <strong>50 reais</strong> na <strong>farmácia</strong> no <strong>Pix</strong>"<br>"Recebi <strong>1.500</strong> da <strong>aposentadoria</strong>"</p>
      </div>`,
      botoes: [{ texto: 'Cancelar', classe: 'btn-secundario', acao: () => { reconhecimento?.abort(); reconhecimento = null; fecharModal(); } }]
    });
    let cancelado = false;
    try {
      reconhecimento = Voz.ouvir({
        aoParcial: (t) => { const el = $('voz-texto'); if (el) el.textContent = `"${t}"`; },
        aoErro: (codigo) => {
          cancelado = true;
          const msgs = {
            'not-allowed': 'Você precisa permitir o uso do microfone.',
            'service-not-allowed': 'Você precisa permitir o uso do microfone.',
            'no-speech': 'Não ouvi nada. Tente falar mais perto do celular.',
            'network': 'Para usar a voz é preciso estar com internet.',
            'audio-capture': 'Não encontrei o microfone.'
          };
          if (codigo === 'aborted') return;
          abrirModal({
            titulo: 'Não deu certo',
            corpo: `<p style="text-align:center">${msgs[codigo] || 'Não consegui entender. Tente de novo.'}</p>`,
            botoes: [
              { texto: '🎤 Tentar de novo', classe: 'btn-primario', acao: () => { fecharModal(); $('btn-voz').click(); } },
              { texto: 'Fechar', classe: 'btn-secundario' }
            ]
          });
        },
        aoFinal: (texto) => {
          if (cancelado || !reconhecimento) return;
          reconhecimento = null;
          if (!texto) {
            abrirModal({
              titulo: 'Não ouvi nada',
              corpo: '<p style="text-align:center">Toque em "Tentar de novo" e fale logo em seguida.</p>',
              botoes: [
                { texto: '🎤 Tentar de novo', classe: 'btn-primario', acao: () => { fecharModal(); $('btn-voz').click(); } },
                { texto: 'Fechar', classe: 'btn-secundario' }
              ]
            });
            return;
          }
          fecharModal();
          usarFala(texto);
        }
      });
    } catch {
      fecharModal();
      mostrarAviso('Não foi possível usar o microfone.');
    }
  };

  function usarFala(texto) {
    const res = Voz.interpretar(texto, estado.categorias);
    const extra = {
      falado: texto,
      valorTexto: res.valor ? textoDeValor(res.valor) : '',
      categoria_id: res.categoria ? res.categoria.id : null,
      forma: res.forma
    };
    if (!res.valor) extra.passo = 'valor';
    else if (!res.categoria) extra.passo = 'categoria';
    else if (res.tipo === 'gasto' && !res.forma) extra.passo = 'forma';
    else extra.passo = 'confirmar';
    novoRegistro(res.tipo, extra);
  }

  // ---------------------------------------------------------
  // Detalhe, correção e exclusão
  // ---------------------------------------------------------
  async function abrirDetalhe(id) {
    const l = estado.cache[id];
    if (!l) return;
    const c = categoria(l.categoria_id);
    const d = new Date(l.data);
    let corpo = `
      <p style="text-align:center;font-size:2rem;font-weight:800;margin:0 0 8px" class="${l.tipo === 'gasto' ? 'cor-gasto' : 'cor-entrada'}">
        ${l.tipo === 'gasto' ? '−' : '+'} ${moeda(l.valor)}</p>
      <div class="detalhe-linha"><span>Tipo</span><span>${l.tipo === 'gasto' ? 'Gasto' : 'Dinheiro recebido'}</span></div>
      <div class="detalhe-linha"><span>Categoria</span><span>${c.icone} ${escapar(c.nome)}</span></div>`;
    if (l.forma_pagamento) corpo += `<div class="detalhe-linha"><span>Pagamento</span><span>${FORMAS[l.forma_pagamento].icone} ${FORMAS[l.forma_pagamento].nome}</span></div>`;
    corpo += `<div class="detalhe-linha"><span>Dia</span><span>${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>`;
    if (l.descricao) corpo += `<div class="detalhe-linha"><span>Observação</span><span>${escapar(l.descricao)}</span></div>`;
    if (l.foto_path) corpo += `<p class="item-info" style="margin:12px 0 0;text-align:center">Carregando foto…</p><div id="detalhe-foto"></div>`;

    abrirModal({
      titulo: 'Detalhes',
      corpo,
      botoes: [
        { texto: '✏️ Corrigir', classe: 'btn-primario', acao: () => { fecharModal(); corrigir(l); } },
        { texto: '🗑️ Apagar', classe: 'btn-perigo-suave', acao: () => apagar(l) },
        { texto: 'Fechar', classe: 'btn-secundario' }
      ]
    });

    if (l.foto_path) {
      const url = await urlDaFoto(l.foto_path);
      const caixa = $('detalhe-foto');
      if (!caixa) return;
      caixa.previousElementSibling.remove();
      caixa.innerHTML = url
        ? `<a href="${url}" target="_blank" rel="noopener"><img class="detalhe-foto" src="${url}" alt="Foto da notinha"></a>
           <p class="item-info" style="text-align:center">Toque na foto para ampliar</p>`
        : '<p class="item-info" style="text-align:center">Não foi possível abrir a foto.</p>';
    }
  }

  function corrigir(l) {
    const telaAtual = $$('.tela.ativa')[0]?.id || 'tela-historico';
    novoRegistro(l.tipo, {
      editandoId: l.id,
      valorTexto: textoDeValor(l.valor),
      categoria_id: l.categoria_id,
      forma: l.forma_pagamento,
      descricao: l.descricao || '',
      data: dataInput(new Date(l.data)),
      dataOriginal: l.data,
      fotoPathExistente: l.foto_path,
      passo: 'confirmar',
      voltarPara: telaAtual
    });
    $('reg-descricao').value = l.descricao || '';
    $('reg-data').value = dataInput(new Date(l.data));
  }

  async function apagar(l) {
    const c = categoria(l.categoria_id);
    const ok = await confirmar('Apagar este registro?',
      `<strong>${moeda(l.valor)}</strong> — ${c.icone} ${escapar(c.nome)}`, '🗑️ Sim, apagar', 'btn-perigo');
    if (!ok) return;
    const { error } = await sb.from('lancamentos').delete().eq('id', l.id);
    if (error) { mostrarAviso(mensagemErro(error)); return; }
    delete estado.cache[l.id];
    recarregarTelaAtual();

    let desfeito = false;
    mostrarAviso('Registro apagado.', {
      acao: 'Desfazer',
      duracao: 7000,
      aoAcao: async () => {
        desfeito = true;
        const { id, created_at, user_id, ...dados } = l;
        const { error: e2 } = await sb.from('lancamentos').insert(dados);
        if (e2) { mostrarAviso(mensagemErro(e2)); return; }
        mostrarAviso('✅ Registro recuperado!');
        recarregarTelaAtual();
      },
      aoFechar: () => { if (!desfeito) apagarFoto(l.foto_path); }
    });
  }

  function recarregarTelaAtual() {
    const id = $$('.tela.ativa')[0]?.id;
    if (id === 'tela-inicio') carregarInicio();
    if (id === 'tela-historico') carregarHistorico();
    if (id === 'tela-relatorios') carregarRelatorios();
  }

  // ---------------------------------------------------------
  // Histórico
  // ---------------------------------------------------------
  function prepararNavMes(tela, chave, aoMudar) {
    $$(`#${tela} .btn-mes`).forEach((b) => b.addEventListener('click', () => {
      const d = estado[chave];
      const novo = new Date(d.getFullYear(), d.getMonth() + Number(b.dataset.mes), 1);
      if (novo > new Date()) { mostrarAviso('Esse mês ainda não chegou 🙂'); return; }
      estado[chave] = novo;
      aoMudar();
    }));
  }
  prepararNavMes('tela-historico', 'mesHist', () => carregarHistorico());
  prepararNavMes('tela-relatorios', 'mesRel', () => carregarRelatorios());

  $$('#tela-historico .filtro').forEach((b) => b.addEventListener('click', () => {
    estado.filtroTipo = b.dataset.filtro;
    estado.filtroCat = '';
    $$('#tela-historico .filtro').forEach((x) => x.classList.toggle('ativo', x === b));
    carregarHistorico();
  }));
  $('hist-categoria').addEventListener('change', (e) => { estado.filtroCat = e.target.value; carregarHistorico(); });

  function preencherSelectCategorias() {
    const sel = $('hist-categoria');
    const cats = estado.categorias.filter((c) => estado.filtroTipo === 'todos' || c.tipo === estado.filtroTipo);
    sel.innerHTML = '<option value="">Todas as categorias</option>' + cats.map((c) =>
      `<option value="${c.id}" ${String(c.id) === estado.filtroCat ? 'selected' : ''}>${c.icone} ${escapar(c.nome)}${estado.filtroTipo === 'todos' ? (c.tipo === 'gasto' ? ' (gasto)' : ' (entrada)') : ''}</option>`
    ).join('');
  }

  async function carregarHistorico() {
    const m = estado.mesHist;
    $('hist-mes').textContent = nomeMes(m);
    preencherSelectCategorias();
    const caixa = $('lista-historico');
    caixa.innerHTML = '<p class="vazio">Carregando…</p>';

    let q = sb.from('lancamentos').select('*')
      .gte('data', inicioMes(m).toISOString()).lt('data', fimMes(m).toISOString())
      .order('data', { ascending: false });
    if (estado.filtroTipo !== 'todos') q = q.eq('tipo', estado.filtroTipo);
    if (estado.filtroCat) q = q.eq('categoria_id', Number(estado.filtroCat));
    const { data, error } = await q;
    if (error) { caixa.innerHTML = `<p class="vazio">${mensagemErro(error)}</p>`; return; }
    guardarNoCache(data);

    if (!data.length) { caixa.innerHTML = '<p class="vazio">Nenhum registro neste mês.</p>'; return; }

    let entrou = 0, saiu = 0;
    data.forEach((l) => { if (l.tipo === 'entrada') entrou += Number(l.valor); else saiu += Number(l.valor); });
    let html = '<div class="cartao">';
    if (estado.filtroTipo !== 'gasto') html += `<div class="resumo-linha"><span class="resumo-rotulo">Entrou</span><strong class="cor-entrada">${moeda(entrou)}</strong></div>`;
    if (estado.filtroTipo !== 'entrada') html += `<div class="resumo-linha"><span class="resumo-rotulo">Saiu</span><strong class="cor-gasto">${moeda(saiu)}</strong></div>`;
    html += '</div>';

    let diaAtual = '';
    let aberto = false;
    data.forEach((l) => {
      const d = new Date(l.data);
      const chave = dataInput(d);
      if (chave !== diaAtual) {
        if (aberto) html += '</ul>';
        html += `<h3 class="dia-titulo">${rotuloDia(d)}</h3><ul class="lista">`;
        diaAtual = chave; aberto = true;
      }
      html += itemHTML(l);
    });
    if (aberto) html += '</ul>';
    caixa.innerHTML = html;
    ligarItens(caixa);
  }

  // ---------------------------------------------------------
  // Relatórios
  // ---------------------------------------------------------
  function somarPorCategoria(lista, tipo) {
    const mapa = {};
    lista.filter((l) => l.tipo === tipo).forEach((l) => { mapa[l.categoria_id] = (mapa[l.categoria_id] || 0) + Number(l.valor); });
    return Object.entries(mapa).map(([id, total]) => ({ cat: categoria(Number(id)), total })).sort((a, b) => b.total - a.total);
  }
  function barrasHTML(itens, total) {
    return itens.map(({ cat, total: v }) => {
      const pct = total ? Math.round((v / total) * 100) : 0;
      return `<div class="barra-item">
        <div class="barra-topo"><span>${cat.icone} ${escapar(cat.nome)}</span><span>${moeda(v)} <span class="barra-pct">(${pct}%)</span></span></div>
        <div class="barra-fundo"><div class="barra" style="width:${Math.max(pct, 2)}%;background:${cat.cor}"></div></div>
      </div>`;
    }).join('');
  }

  async function carregarRelatorios() {
    const m = estado.mesRel;
    const anterior = new Date(m.getFullYear(), m.getMonth() - 1, 1);
    $('rel-mes').textContent = nomeMes(m);
    const caixa = $('rel-conteudo');
    caixa.innerHTML = '<p class="vazio">Carregando…</p>';

    const { data, error } = await sb.from('lancamentos').select('tipo, valor, categoria_id, forma_pagamento, data')
      .gte('data', inicioMes(anterior).toISOString()).lt('data', fimMes(m).toISOString());
    if (error) { caixa.innerHTML = `<p class="vazio">${mensagemErro(error)}</p>`; return; }

    const doMes = data.filter((l) => new Date(l.data) >= inicioMes(m));
    const doAnterior = data.filter((l) => new Date(l.data) < inicioMes(m));
    if (!doMes.length) { caixa.innerHTML = '<p class="vazio">Nenhum registro neste mês.</p>'; return; }

    const soma = (lista, tipo) => lista.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0);
    const entrou = soma(doMes, 'entrada'), saiu = soma(doMes, 'gasto');
    const saiuAntes = soma(doAnterior, 'gasto');
    const gastos = somarPorCategoria(doMes, 'gasto');
    const entradas = somarPorCategoria(doMes, 'entrada');
    const nomeAnterior = anterior.toLocaleDateString('pt-BR', { month: 'long' });
    const verboMes = ehMesAtual(m) ? 'Neste mês' : `Em ${m.toLocaleDateString('pt-BR', { month: 'long' })}`;

    const frases = [];
    frases.push(`${verboMes} você gastou <strong>${moeda(saiu)}</strong> e recebeu <strong>${moeda(entrou)}</strong>.`);
    if (gastos.length) frases.push(`O que mais pesou foi <strong>${gastos[0].cat.icone} ${escapar(gastos[0].cat.nome)}</strong> (${moeda(gastos[0].total)}).`);
    if (saiuAntes > 0) {
      const dif = saiu - saiuAntes;
      if (Math.abs(dif) < 0.01) frases.push(`Você gastou o mesmo que em ${nomeAnterior}.`);
      else if (dif < 0) frases.push(`Isso é <strong>${moeda(-dif)} a menos</strong> que em ${nomeAnterior}. 👏`);
      else frases.push(`Isso é <strong>${moeda(dif)} a mais</strong> que em ${nomeAnterior}.`);
    }
    if (entrou - saiu < 0) frases.push('⚠️ Atenção: saiu mais dinheiro do que entrou.');

    const formas = {};
    doMes.filter((l) => l.tipo === 'gasto').forEach((l) => { formas[l.forma_pagamento] = (formas[l.forma_pagamento] || 0) + Number(l.valor); });

    let html = `
      <div class="cartao">${frases.map((f) => `<p class="frase">${f}</p>`).join('')}</div>
      <div class="cartao resumo">
        <div class="resumo-linha"><span class="resumo-rotulo">Dinheiro que entrou</span><strong class="resumo-valor cor-entrada">${moeda(entrou)}</strong></div>
        <div class="resumo-linha"><span class="resumo-rotulo">Dinheiro que saiu</span><strong class="resumo-valor cor-gasto">${moeda(saiu)}</strong></div>
        <div class="resumo-linha resumo-total"><span class="resumo-rotulo">Sobrou</span><strong class="resumo-valor ${entrou - saiu < 0 ? 'cor-gasto' : 'cor-entrada'}">${moeda(entrou - saiu)}</strong></div>
      </div>`;
    if (gastos.length) html += `<div class="cartao"><h2 class="secao-titulo">Para onde foi o dinheiro</h2>${barrasHTML(gastos, saiu)}</div>`;
    if (Object.keys(formas).length) {
      const itens = Object.entries(formas).sort((a, b) => b[1] - a[1])
        .map(([f, v]) => ({ cat: { icone: FORMAS[f].icone, nome: FORMAS[f].nome, cor: '#2f6f8f' }, total: v }));
      html += `<div class="cartao"><h2 class="secao-titulo">Como você pagou</h2>${barrasHTML(itens, saiu)}</div>`;
    }
    if (entradas.length) html += `<div class="cartao"><h2 class="secao-titulo">De onde veio o dinheiro</h2>${barrasHTML(entradas, entrou)}</div>`;
    caixa.innerHTML = html;
  }
  $('btn-imprimir').onclick = () => window.print();

  // ---------------------------------------------------------
  // Ajustes: categorias
  // ---------------------------------------------------------
  $$('[data-cat-tipo]').forEach((b) => b.addEventListener('click', () => {
    estado.catTipoAjuste = b.dataset.catTipo;
    $$('[data-cat-tipo]').forEach((x) => x.classList.toggle('ativo', x === b));
    renderAjustes();
  }));

  function renderAjustes() {
    aplicarFonte();
    const lista = $('lista-cat-ajustes');
    const cats = estado.categorias.filter((c) => c.tipo === estado.catTipoAjuste);
    lista.innerHTML = cats.map((c) => `<li><button class="item ${c.ativa ? '' : 'inativa'}" type="button" data-cat="${c.id}">
        <span class="item-icone" style="background:${fundoIcone(c.cor)}" aria-hidden="true">${c.icone}</span>
        <span class="item-meio"><span class="item-nome">${escapar(c.nome)}</span>
        <span class="item-info">${c.ativa ? 'Aparece na lista' : 'Escondida'}</span></span>
        <span aria-hidden="true">✏️</span></button></li>`).join('');
    $$('[data-cat]', lista).forEach((b) => b.addEventListener('click', () => editarCategoria(estado.categorias.find((c) => c.id === Number(b.dataset.cat)))));
  }

  $('btn-nova-categoria').onclick = () => editarCategoria(null);

  function editarCategoria(cat) {
    const nova = !cat;
    let icone = cat ? cat.icone : '📦';
    abrirModal({
      titulo: nova ? 'Nova categoria' : 'Editar categoria',
      corpo: `
        <label class="campo-rotulo" for="cat-nome">Nome</label>
        <input id="cat-nome" type="text" maxlength="40" value="${escapar(cat ? cat.nome : '')}" placeholder="Ex.: Roupas">
        <p class="campo-rotulo">Ícone</p>
        <div class="icones-escolha" id="cat-icones">${ICONES.map((i) => `<button type="button" data-icone="${i}" class="${i === icone ? 'selecionada' : ''}">${i}</button>`).join('')}</div>
        <p class="erro" id="cat-erro"></p>`,
      botoes: [
        { texto: '✔ Salvar', classe: 'btn-sucesso', acao: salvar },
        ...(nova ? [] : [{ texto: cat.ativa ? '🙈 Esconder da lista' : '👁️ Mostrar de novo', classe: 'btn-secundario', acao: alternarAtiva }]),
        { texto: 'Cancelar', classe: 'btn-secundario' }
      ]
    });
    $$('#cat-icones button').forEach((b) => b.addEventListener('click', () => {
      icone = b.dataset.icone;
      $$('#cat-icones button').forEach((x) => x.classList.toggle('selecionada', x === b));
    }));

    async function salvar() {
      const nome = $('cat-nome').value.trim();
      if (!nome) { $('cat-erro').textContent = 'Escreva um nome.'; return; }
      const res = nova
        ? await sb.from('categorias').insert({
            nome, icone, tipo: estado.catTipoAjuste, ordem: 50,
            cor: CORES[estado.categorias.length % CORES.length]
          })
        : await sb.from('categorias').update({ nome, icone }).eq('id', cat.id);
      if (res.error) { $('cat-erro').textContent = mensagemErro(res.error); return; }
      fecharModal();
      await carregarCategorias();
      renderAjustes();
      mostrarAviso('✅ Categoria salva!');
    }
    async function alternarAtiva() {
      const { error } = await sb.from('categorias').update({ ativa: !cat.ativa }).eq('id', cat.id);
      if (error) { mostrarAviso(mensagemErro(error)); return; }
      fecharModal();
      await carregarCategorias();
      renderAjustes();
      mostrarAviso(cat.ativa ? 'Categoria escondida.' : 'Categoria visível de novo.');
    }
  }

  // ---------------------------------------------------------
  // Início do app
  // ---------------------------------------------------------
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && estado.usuario) { estado.usuario = null; mostrarTela('tela-login'); }
  });

  async function iniciar() {
    aplicarFonte();
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) aposLogin(session.user);
    else mostrarTela('tela-login');
  }
  iniciar();
})();
