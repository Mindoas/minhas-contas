// =========================================================
// Registro por voz: reconhecimento (navegador) + interpretação
// Ex.: "Gastei cinquenta reais na farmácia no pix"
//      "Recebi mil e quinhentos da aposentadoria"
// =========================================================
(function (global) {
  'use strict';

  function normalizar(t) {
    return String(t || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/r\$\s*/g, ' ')
      .replace(/[^\w\s.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------- Números por extenso ----------
  const NUMEROS = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
    quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
    dezessete: 17, dezoito: 18, dezenove: 19,
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cincoenta: 50,
    sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
    cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
    quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
    seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
    oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900
  };

  function numeroDeDigitos(tok) {
    if (!/^\d[\d.,]*$/.test(tok)) return null;
    tok = tok.replace(/[.,]$/, '');
    if (tok.includes(',')) return parseFloat(tok.replace(/\./g, '').replace(',', '.'));
    if (/^\d{1,3}(\.\d{3})+$/.test(tok)) return parseFloat(tok.replace(/\./g, ''));
    return parseFloat(tok);
  }

  function ehNumero(tok) {
    return tok === 'mil' || tok in NUMEROS || numeroDeDigitos(tok) !== null;
  }

  // Separa o texto em "trechos numéricos" e calcula cada um
  function extrairValor(texto) {
    const toks = texto.split(' ');
    const trechos = [];
    let i = 0;
    while (i < toks.length) {
      if (!ehNumero(toks[i])) { i++; continue; }
      let total = 0, atual = 0, temDigito = false;
      while (i < toks.length) {
        const t = toks[i];
        if (t === 'e' && i + 1 < toks.length && ehNumero(toks[i + 1]) && i > 0 && ehNumero(toks[i - 1])) { i++; continue; }
        if (!ehNumero(t)) break;
        if (t === 'mil') { atual = (atual || 1) * 1000; total += atual; atual = 0; }
        else if (t in NUMEROS) atual += NUMEROS[t];
        else { atual += numeroDeDigitos(t); temDigito = true; }
        i++;
      }
      const prox = toks[i] || '';
      trechos.push({
        valor: total + atual,
        temDigito,
        centavos: /^centavos?$/.test(prox),
        reais: /^(reais|real|conto|contos|pila)$/.test(prox)
      });
    }

    const centavos = trechos.find(t => t.centavos && t.valor < 100);
    const candidatos = trechos.filter(t => !t.centavos && t.valor > 0);
    let principal =
      candidatos.find(t => t.reais) ||
      candidatos.find(t => t.temDigito) ||
      candidatos.sort((a, b) => b.valor - a.valor)[0];

    let valor = principal ? principal.valor : 0;
    if (centavos) valor += centavos.valor / 100;
    valor = Math.round(valor * 100) / 100;
    return valor > 0 ? valor : null;
  }

  // ---------- Palavras-chave ----------
  const CHAVES_ENTRADA = /\b(recebi|ganhei|entrou|caiu|depositaram|depositou|me deram|me pagaram|me mandaram|recebimento)\b/;
  const CHAVES_GASTO = /\b(gastei|paguei|comprei|saiu|gasto|pagamento|pagar)\b/;

  // nome normalizado da categoria padrão -> palavras que a identificam
  const PALAVRAS_CATEGORIA = {
    gasto: {
      'mercado': ['mercado', 'supermercado', 'compras', 'feira', 'sacolao', 'hortifruti', 'atacadao', 'mercearia'],
      'medicacao': ['farmacia', 'remedio', 'remedios', 'medicamento', 'medicamentos', 'medicacao', 'drogaria', 'drogasil'],
      'energia': ['luz', 'energia', 'eletrica', 'cpfl', 'enel'],
      'agua': ['agua', 'saneamento', 'sabesp'],
      'gas': ['gas', 'botijao'],
      'internet telefone': ['internet', 'telefone', 'celular', 'wifi', 'recarga', 'credito'],
      'padaria acougue': ['padaria', 'pao', 'paes', 'acougue', 'carne', 'frango'],
      'consultas e exames': ['consulta', 'medico', 'medica', 'exame', 'exames', 'dentista', 'laboratorio', 'fisioterapia'],
      'transporte': ['onibus', 'uber', 'taxi', 'gasolina', 'combustivel', 'passagem', 'transporte', 'metro', 'estacionamento'],
      'aluguel condominio': ['aluguel', 'condominio'],
      'manutencao da casa': ['conserto', 'encanador', 'eletricista', 'manutencao', 'reforma', 'pedreiro', 'material', 'construcao'],
      'animais': ['racao', 'veterinario', 'pet', 'cachorro', 'gato', 'petshop'],
      'lazer': ['passeio', 'cinema', 'restaurante', 'lazer', 'viagem', 'lanche', 'pizza', 'festa'],
      'outros': []
    },
    entrada: {
      'aposentadoria': ['aposentadoria', 'aposentado', 'inss', 'beneficio'],
      'pensao': ['pensao'],
      'salario': ['salario', 'pagamento', 'trabalho'],
      'aluguel recebido': ['aluguel', 'inquilino'],
      'ajuda de familiar': ['ajuda', 'filho', 'filha', 'neto', 'neta', 'familia', 'familiar', 'sobrinho', 'sobrinha', 'presente'],
      'outros': []
    }
  };

  function contemPalavra(texto, palavra) {
    return new RegExp('\\b' + palavra + '\\b').test(texto);
  }

  function acharCategoria(texto, categorias, tipo) {
    const daqueleTipo = categorias.filter(c => c.tipo === tipo && c.ativa !== false);
    // 1) nome da categoria (inclusive as criadas pelo usuário)
    for (const c of daqueleTipo) {
      const partes = normalizar(c.nome).split(/[\s/]+/).filter(p => p.length >= 4 && p !== 'outros');
      if (partes.some(p => contemPalavra(texto, p))) return c;
    }
    // 2) palavras-chave das categorias padrão
    const mapa = PALAVRAS_CATEGORIA[tipo] || {};
    for (const c of daqueleTipo) {
      const palavras = mapa[normalizar(c.nome)] || [];
      if (palavras.some(p => contemPalavra(texto, p))) return c;
    }
    return null;
  }

  function acharForma(texto) {
    if (contemPalavra(texto, 'pix')) return 'pix';
    if (/\b(debito|cartao)\b/.test(texto)) return 'debito';
    if (/\b(dinheiro|especie|vivo|nota)\b/.test(texto)) return 'dinheiro';
    return null;
  }

  function interpretar(fala, categorias) {
    const texto = normalizar(fala);
    categorias = categorias || [];

    let tipo = null;
    if (CHAVES_ENTRADA.test(texto)) tipo = 'entrada';
    else if (CHAVES_GASTO.test(texto)) tipo = 'gasto';

    let categoria = null;
    if (tipo) categoria = acharCategoria(texto, categorias, tipo);
    else {
      categoria = acharCategoria(texto, categorias, 'gasto');
      if (categoria) tipo = 'gasto';
      else {
        categoria = acharCategoria(texto, categorias, 'entrada');
        tipo = categoria ? 'entrada' : 'gasto';
      }
    }

    return {
      texto: fala,
      tipo,
      valor: extrairValor(texto),
      categoria,
      forma: tipo === 'gasto' ? acharForma(texto) : null
    };
  }

  // ---------- Reconhecimento de voz do navegador ----------
  const Reconhecedor = global.SpeechRecognition || global.webkitSpeechRecognition;

  function suportado() { return !!Reconhecedor; }

  function ouvir({ aoParcial, aoFinal, aoErro }) {
    const r = new Reconhecedor();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else parcial += e.results[i][0].transcript;
      }
      if (aoParcial) aoParcial(final + parcial);
    };
    r.onerror = (e) => { if (aoErro) aoErro(e.error); };
    r.onend = () => { if (aoFinal) aoFinal(final.trim()); };
    r.start();
    return r;
  }

  const Voz = { interpretar, extrairValor, normalizar, suportado, ouvir };
  global.Voz = Voz;
  if (typeof module !== 'undefined') module.exports = Voz;
})(typeof window !== 'undefined' ? window : globalThis);
