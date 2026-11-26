// Regras do Assistente Financeiro (versão 3, 26/11/2026).
// Funções puras, sem banco: recebem dados e devolvem decisões. Testadas em test/regras.test.js.

export const TIPOS = ["lembrete", "link", "vencida", "atraso"]; // ordem de avanço
const OFFSET = { lembrete: -1, pedido_link: -1, link: 0, vencida: 1, atraso: 3 };
export const FORMAS = {
  pix: "Pix", boleto_c6: "Boleto C6", boleto_stone: "Boleto Stone", cartao: "Cartão (C6 Pay)",
  cartao_recorrente: "Cartão recorrente", link: "Link de pagamento", outra: "Outra",
};

// ---------- datas (AAAA-MM-DD, sem fuso) ----------
export function hojeFortaleza(agora = new Date()) {
  // America/Fortaleza = UTC-3 o ano todo
  return new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}
export function horaFortaleza(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(11, 16);
}
const toD = (s) => new Date(s + "T00:00:00Z");
const toS = (d) => d.toISOString().slice(0, 10);
export function somaDias(s, n) { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return toS(d); }
export function diasEntre(a, b) { return Math.round((toD(b) - toD(a)) / 86400e3); }
export function diaSemana(s) { return toD(s).getUTCDay(); } // 0 dom ... 6 sáb
export function ehDiaUtil(s) { const w = diaSemana(s); return w !== 0 && w !== 6; }
function diaUtil(s, paraTras) { while (!ehDiaUtil(s)) s = somaDias(s, paraTras ? -1 : 1); return s; }
export function dataAlvo(venc, tipo) {
  return diaUtil(somaDias(venc, OFFSET[tipo]), ["lembrete", "pedido_link", "link"].includes(tipo));
}

// ---------- formato ----------
export function brl(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function br(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : ""; }
export function primeiroNome(n) { return String(n || "").replace("[TESTE]", "").trim().split(/\s+/)[0] || ""; }
export function normaliza(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export const MODELOS = {
  lembrete: "Olá, {nome}! Passando para lembrar que amanhã, {data}, vence {desc} ({curso}), no valor de R$ {valor}. Se já fez o pagamento, pode desconsiderar esta mensagem. Qualquer dúvida, estamos à disposição. Obrigada!",
  link: "Olá, {nome}! Hoje, {data}, vence {desc} ({curso}), no valor de R$ {valor}, como combinamos na sua negociação. Segue o link de pagamento: {link} . Se tiver qualquer dúvida, é só responder. Obrigada!",
  pedido_link: "Elayne, amanhã ({data}) vence {desc} de {nomeCompleto} ({curso}), R$ {valor}, combinada por link de pagamento. Pode gerar o link e me enviar hoje, para eu mandar para ela no dia do vencimento? Obrigada!",
  vencida: "Olá, {nome}! {Desc} ({curso}), no valor de R$ {valor}, venceu em {data} e ainda não identificamos o pagamento. Se já pagou, envie o comprovante por aqui para conferirmos. Se precisar do boleto ou da chave Pix, é só responder. Obrigada!",
  atraso: "Olá, {nome}! {Desc} ({curso}), no valor de R$ {valor}, com vencimento em {data}, está em atraso há {dias} dias. Pedimos, por gentileza, a regularização. Se já pagou, envie o comprovante para conferirmos; se precisar do boleto ou da chave Pix, é só responder por aqui. Obrigada!",
};
function preenche(t, v) { return t.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? "")); }

// ---------- bloqueios ----------
export function bloqueio(aluna, parcela, fonteDoDia, hoje) {
  if (aluna.responsavel === "juridico") return "jurídico (o financeiro não cobra em paralelo)";
  if (aluna.situacao_mentoria === "pausada" || aluna.situacao_mentoria === "cancelada") return `R5 pendente (mentoria ${aluna.situacao_mentoria})`;
  if (aluna.promessa_ate && (!hoje || aluna.promessa_ate >= hoje)) return `R3 pendente (promessa de pagamento até ${br(aluna.promessa_ate)})`;
  if (aluna.promessa_ate) return "R3 pendente (promessa vencida: Bruna decide a retomada)";
  if (Number(aluna.em_analise_jaciara)) return "R4 pendente (em análise por Jaciara)";
  if (parcela.status === "a_conferir") return "comprovante em conferência";
  if (parcela.forma === "cartao_recorrente") return "cartão recorrente: só cobrar se a cobrança for recusada (P16 pendente)";
  if (!fonteDoDia) return "R6: conferência não é de hoje; reconferir antes de enviar";
  return null;
}

function aberta(p) { return p.status === "aberta" || p.status === "a_conferir"; }
function saldo(p) { return Math.max(0, Number(p.valor) - Number(p.valor_pago || 0)); }

/**
 * Monta as mensagens do dia.
 * alunas: [{id, nome, telefone, situacao_mentoria, responsavel, promessa_ate, em_analise_jaciara,
 *           parcelas: [{id, numero, vencimento, valor, valor_pago, forma, status, link_pagamento, curso}]}]
 * jaFeitas: Set de "parcelaId|tipo" já preparadas/enviadas (não repetir).
 * jaHoje: Set de ids de alunas que já têm mensagem hoje (uma por aluna por dia).
 * Retorna { mensagens: [...], bloqueadas: [...] }.
 */
export function planejar(alunas, hoje, jaFeitas, fonteDoDia = true, elayne = "Elayne", jaHoje = new Set()) {
  const porAlunaTipo = new Map();
  const internos = [];
  const bloqueadas = [];
  if (!ehDiaUtil(hoje)) return { mensagens: [], bloqueadas: [] };
  for (const a of alunas) {
    for (const p of a.parcelas || []) {
      if (!aberta(p)) continue;
      const venc = p.vencimento;
      const link = p.forma === "link";
      const ja = new Set([...TIPOS, "pedido_link"].filter((t) => jaFeitas.has(`${p.id}|${t}`)));
      if (link && hoje === dataAlvo(venc, "pedido_link") && hoje < venc && !ja.has("pedido_link") && !p.link_pagamento
          && !bloqueio(a, p, true, hoje)) {
        internos.push({ aluna: a, tipo: "pedido_link", destino: elayne, parcelas: [p] });
      }
      let devido = null;
      if (link && hoje === dataAlvo(venc, "link") && hoje <= venc) devido = "link";
      else if (!link && hoje === dataAlvo(venc, "lembrete") && hoje < venc) devido = "lembrete";
      else if (hoje >= dataAlvo(venc, "atraso")) devido = ja.has("atraso") ? null : "atraso";
      else if (hoje >= dataAlvo(venc, "vencida") && hoje > venc) devido = (ja.has("vencida") || ja.has("atraso")) ? null : "vencida";
      if (!devido || ja.has(devido)) continue;
      let motivo = bloqueio(a, p, fonteDoDia, hoje);
      if (!motivo && devido === "link" && !p.link_pagamento) motivo = `link de pagamento ainda não recebido de ${elayne}`;
      if (!motivo && !a.telefone) motivo = "aluna sem telefone cadastrado";
      if (motivo) { bloqueadas.push({ aluna: a, tipo: devido, parcelas: [p], motivo }); continue; }
      const k = `${a.id}|${devido}`;
      if (!porAlunaTipo.has(k)) porAlunaTipo.set(k, { aluna: a, tipo: devido, destino: "aluna", parcelas: [] });
      porAlunaTipo.get(k).parcelas.push(p);
    }
  }
  // uma mensagem por aluna por dia: fica a mais avançada (e nenhuma se ela já tem mensagem hoje)
  const porAluna = new Map();
  for (const item of porAlunaTipo.values()) {
    if (jaHoje.has(item.aluna.id)) continue;
    const atual = porAluna.get(item.aluna.id);
    if (!atual || TIPOS.indexOf(item.tipo) > TIPOS.indexOf(atual.tipo)) porAluna.set(item.aluna.id, item);
  }
  const mensagens = [...porAluna.values(), ...internos].map((it) => montar(it, hoje));
  return { mensagens, bloqueadas: bloqueadas.map((b) => ({ ...montar(b, hoje), motivo: b.motivo })) };
}

function montar(item, hoje) {
  const { aluna: a, tipo, parcelas: ps } = item;
  const desc = ps.length === 1 ? `a parcela ${ps[0].numero}` : `as parcelas ${ps.map((p) => p.numero).join(", ")}`;
  const cursos = [...new Set(ps.map((p) => p.curso).filter(Boolean))].join(", ");
  const links = ps.map((p) => p.link_pagamento).filter(Boolean);
  let texto = preenche(MODELOS[tipo], {
    nome: primeiroNome(a.nome), nomeCompleto: a.nome, curso: cursos, desc, Desc: desc[0].toUpperCase() + desc.slice(1),
    valor: brl(ps.reduce((s, p) => s + saldo(p), 0)), data: ps.map((p) => br(p.vencimento)).join(", "),
    dias: diasEntre(ps.map((p) => p.vencimento).sort()[0], hoje), link: links.join(" "),
  });
  if (ps.length > 1) texto = texto.replace(" vence ", " vencem ").replace(" venceu ", " venceram ").replace(" está ", " estão ");
  if ((tipo === "vencida" || tipo === "atraso") && links.length) texto = texto.replace(" Obrigada!", ` Link de pagamento: ${links.join(" ")} . Obrigada!`);
  return {
    chave: `${a.id}|${ps.map((p) => p.id).join(",")}|${tipo}`,
    aluna_id: a.id, aluna: a.nome, telefone: item.destino === "aluna" ? a.telefone : null,
    tipo, destino: item.destino, parcela_ids: ps.map((p) => p.id), texto,
  };
}

// ---------- inadimplência ----------
export function faixa(d) {
  return d <= 15 ? "até 15 dias" : d <= 30 ? "16 a 30 dias" : d <= 60 ? "31 a 60 dias" : "mais de 60 dias";
}
export function inadimplencia(alunas, hoje) {
  const fin = [], jur = [];
  for (const a of alunas) {
    const venc = (a.parcelas || []).filter((p) => aberta(p) && p.vencimento < hoje);
    if (!venc.length) continue;
    const dias = diasEntre(venc.map((p) => p.vencimento).sort()[0], hoje);
    const r = {
      id: a.id, nome: a.nome, cursos: [...new Set(venc.map((p) => p.curso))].join(", "), parcelas: venc.length,
      valor: venc.reduce((s, p) => s + saldo(p), 0), dias, faixa: faixa(dias),
      a_conferir: venc.filter((p) => p.status === "a_conferir").length,
      contatos: a.contatos || [], obs: [a.promessa_ate ? `promessa até ${br(a.promessa_ate)}` : "", Number(a.em_analise_jaciara) ? "em análise por Jaciara" : "", a.situacao_mentoria !== "ativa" ? `mentoria ${a.situacao_mentoria}` : ""].filter(Boolean).join("; "),
    };
    (a.responsavel === "juridico" ? jur : fin).push(r);
  }
  fin.sort((x, y) => y.dias - x.dias);
  jur.sort((x, y) => y.dias - x.dias);
  return { financeiro: fin, juridico: jur };
}

export function textoInadimplencia(dados, hoje, fontes, corte = 30) {
  const { financeiro: f, juridico: j } = dados;
  const soma = (xs) => brl(xs.reduce((s, r) => s + r.valor, 0));
  const L = [`*Relatório de inadimplência – ${br(hoje)}*`, `Fontes: ${fontes || "não informadas"}`,
    `Alunas com parcela vencida: ${f.length} · total vencido R$ ${soma(f)}`,
    `Acima de ${corte} dias (corte provisório, regra R1 pendente): ${f.filter((r) => r.dias > corte).length}`, ""];
  for (const r of f) {
    L.push(`${r.dias > corte ? "🔴" : "🟡"} ${r.nome} (${r.cursos}): ${r.parcelas} parcela(s), R$ ${brl(r.valor)}, ${r.dias} dias de atraso (${r.faixa})`
      + (r.contatos.length ? `; contatos: ${r.contatos.join(", ")}` : "") + (r.obs ? `; ${r.obs}` : "")
      + (r.a_conferir ? `; ${r.a_conferir} com comprovante a conferir` : ""));
  }
  if (j.length) L.push("", `Com o jurídico (fora da cobrança do financeiro): ${j.length} · R$ ${soma(j)}`);
  return L.join("\n");
}

// Resposta a uma mensagem do grupo do Setor Financeiro
export function responderGrupo(msg, autor, autorizados, dados, hoje, fontes, corte = 30) {
  const t = normaliza(msg);
  if (!t.includes("inadimpl")) return null;
  if (!autorizados.map(normaliza).includes(normaliza(autor))) return null;
  const palavras = t.replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  for (const r of [...dados.financeiro, ...dados.juridico]) {
    if (palavras.includes(normaliza(primeiroNome(r.nome)))) {
      return `${r.nome} (${r.cursos}): ${r.parcelas} parcela(s) vencida(s), R$ ${brl(r.valor)}, ${r.dias} dias de atraso`
        + (dados.juridico.includes(r) ? " (com o jurídico)" : "") + `. Fontes: ${fontes}.`;
    }
  }
  const txt = textoInadimplencia(dados, hoje, fontes, corte);
  if (["desconto", "cancelar", "bloque", "perdoar", "juridico", "renegoci"].some((w) => t.includes(w))) {
    return txt + "\n\nDecisões sobre desconto, cancelamento, bloqueio, renegociação ou jurídico ficam com você; posso preparar o caso.";
  }
  return txt;
}

// ---------- relatório do dia (Elayne, 17h30) ----------
export function textoRelatorioDia(hoje, d, fontes) {
  const soma = (xs) => brl(xs.reduce((s, x) => s + Number(x.valor || 0), 0));
  const pag = d.pagamentos || [], conf = d.a_conferir || [], msgs = d.mensagens || [], bloq = d.bloqueadas || [];
  const amanha = d.vencem_amanha || [], novas = d.novas_alunas || [], inad = d.inadimplencia || [], links = d.links || {};
  const nomes = { lembrete: "lembretes", link: "links enviados", vencida: "avisos de vencida", atraso: "avisos de atraso" };
  const porTipo = {};
  for (const m of msgs) if (m.destino === "aluna" || !m.destino) porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1;
  const L = [`*Relatório do dia – ${br(hoje)}*`, `Fontes: ${fontes || "não informadas"}`, "",
    `✅ Pagamentos confirmados: ${pag.length} · R$ ${soma(pag)}`,
    ...pag.map((p) => `   • ${p.aluna}: R$ ${brl(p.valor)} – ${p.origem}`),
    `🔎 A conferir: ${conf.length} · R$ ${soma(conf)}`,
    ...conf.map((c) => `   • ${c.aluna || "sem identificação"}: R$ ${brl(c.valor)} – ${c.motivo}`),
    "💬 Mensagens para alunas: " + (Object.entries(porTipo).map(([t, n]) => `${n} ${nomes[t] || t}`).join(", ") || "nenhuma")];
  if (bloq.length) L.push(`⛔ Não enviadas: ${bloq.length} (` + bloq.map((b) => `${b.aluna}: ${b.motivo}`).join("; ") + ")");
  if (links.pedidos || links.faltando) L.push(`🔗 Links: ${links.pedidos || 0} pedidos, ${links.recebidos || 0} recebidos, ${links.faltando || 0} faltando`);
  L.push(`🆕 Novas alunas cadastradas: ${novas.length}` + (novas.length ? ` (${novas.join(", ")})` : ""));
  L.push(`📅 Vencem amanhã: ${amanha.length} · R$ ${soma(amanha)}`);
  L.push(`🔴 Inadimplência: ${inad.length} alunas · R$ ${soma(inad)} · acima de 30 dias: ${inad.filter((i) => i.dias > 30).length}`);
  if ((d.pendencias || []).length) L.push("", "Pendências para amanhã:", ...d.pendencias.map((p) => `   • ${p}`));
  return L.join("\n");
}

// ---------- parcelas a partir da negociação ----------
export function gerarParcelas({ valor_total, entrada = 0, forma_entrada, venc_entrada, n_parcelas, primeiro_venc, intervalo_dias = 30, forma, mensal = true }) {
  const out = [];
  if (Number(entrada) > 0) out.push({ numero: "Entrada", vencimento: venc_entrada || primeiro_venc, valor: round2(entrada), forma: forma_entrada || forma });
  const n = Number(n_parcelas) || 0;
  if (n > 0) {
    const resto = round2(Number(valor_total) - Number(entrada || 0));
    const base = Math.floor((resto / n) * 100) / 100;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? round2(resto - base * (n - 1)) : base;
      out.push({ numero: `${i + 1}/${n}`, vencimento: mensal ? somaMeses(primeiro_venc, i) : somaDias(primeiro_venc, i * Number(intervalo_dias)), valor: v, forma });
    }
  }
  return out;
}
function round2(v) { return Math.round(Number(v) * 100) / 100; }
export function somaMeses(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return toS(alvo);
}

// ---------- importação ----------
export function lerCSV(texto) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const parse = (l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur.trim()); cur = ""; } else cur += c;
    }
    out.push(cur.trim()); return out;
  };
  const cab = parse(linhas[0]).map((h) => normaliza(h).replace(/\s+/g, "_"));
  return linhas.slice(1).map((l) => { const v = parse(l); return Object.fromEntries(cab.map((h, i) => [h, v[i] ?? ""])); });
}
export function lerValor(s) {
  if (typeof s === "number") return s;
  const t = String(s || "").replace(/[R$\s]/g, "");
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}
export function lerData(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Sugere a parcela de um pagamento do extrato: mesmo valor (saldo), nome parecido, vencimento até 40 dias antes/10 depois
export function sugerirParcela(pagamento, parcelasAbertas) {
  const nome = normaliza(pagamento.pagador || "");
  const cand = parcelasAbertas.filter((p) => Math.abs(saldo(p) - pagamento.valor) < 0.01
    && diasEntre(p.vencimento, pagamento.data) <= 40 && diasEntre(p.vencimento, pagamento.data) >= -10);
  const porNome = cand.filter((p) => nome && normaliza(p.aluna_nome).split(/\s+/).filter((w) => w.length > 2).some((w) => nome.includes(w)));
  if (porNome.length === 1) return { parcela: porNome[0], confianca: "alta" };
  if (cand.length === 1 && !nome) return { parcela: cand[0], confianca: "media" };
  return { parcela: null, candidatas: (porNome.length ? porNome : cand).slice(0, 5) };
}

// Projeção mensal das parcelas em aberto
export function projecao(parcelas, hoje) {
  const m = new Map();
  for (const p of parcelas) {
    if (!aberta(p)) continue;
    const mes = p.vencimento.slice(0, 7);
    const r = m.get(mes) || { mes, total: 0, vencido: 0, porForma: {} };
    const s = saldo(p);
    r.total += s; if (p.vencimento < hoje) r.vencido += s;
    r.porForma[p.forma] = (r.porForma[p.forma] || 0) + s;
    m.set(mes, r);
  }
  return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}
