// Sistema de controle de pagamento das alunas – Centro Liderar
// Cloudflare Worker + D1. Envio de WhatsApp: botão que abre o WhatsApp com o texto pronto (uma pessoa envia).
import * as R from "./regras.js";
import * as A from "./auth.js";
import * as D from "./db.js";
import { html, raw, esc, pagina, selo, dinheiro, data, forma, LOGO } from "./html.js";

const PERFIS = ["admin", "financeiro", "comercial", "juridico", "consulta"];
const FONTES = { c6: "C6 (extrato/boleto)", stone: "Stone (boleto)", c6pay: "C6 Pay (cartão)", conta_azul: "Conta Azul", comprovante: "Comprovante da aluna", planilha: "Planilha", manual: "Manual" };
const FONTES_CONFIRMAM = ["c6", "stone", "c6pay"];
const TIPO_MSG = { lembrete: "Lembrete (D-1)", pedido_link: "Pedido de link à Elayne (D-1)", link: "Link no dia", vencida: "Vencida (D+1)", atraso: "Atraso (D+3)" };

class Resp extends Error { constructor(r) { super("resp"); this.r = r; } }
const redirect = (to, cookie) => new Response(null, { status: 303, headers: { Location: to, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const proibido = () => new Response("Sem permissão para esta ação.", { status: 403 });
const exigir = (u, acao) => { if (!A.pode(u, acao)) throw new Resp(proibido()); };
const num = (v) => { const n = R.lerValor(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const waLink = (tel, texto) => tel ? `https://wa.me/${String(tel).replace(/\D/g, "")}?text=${encodeURIComponent(texto)}` : null;
const hojeDe = (url) => (url.searchParams.get("data") && R.lerData(url.searchParams.get("data"))) || R.hojeFortaleza();

function responder(corpoHtml, nonce, extra = {}) {
  return new Response(corpoHtml, {
    status: extra.status || 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Cache-Control": "no-store",
      "Strict-Transport-Security": "max-age=31536000",
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const nonce = A.aleatorio(12);
    try {
      if (req.method === "POST") {
        const origin = req.headers.get("Origin");
        let host = null; try { host = new URL(origin).host; } catch {}
        if (!host || host !== url.host) return new Response("Origem inválida.", { status: 403 });
      }
      const db = env.DB;
      const view = (titulo, corpo, u, aviso) => responder(pagina({ titulo, usuario: u, corpo, nonce, aviso, caminho: url.pathname }), nonce);
      const p = url.pathname;

      // ---------- rotas públicas ----------
      if (p === "/login") return await login(req, db, view, url);
      if (p === "/setup") return await setup(req, db, env, view);
      if (p === "/logout" && req.method === "POST") return redirect("/login", await A.encerrarSessao(db, req));

      const u = await A.usuarioDaSessao(db, req);
      if (!u) return redirect("/login");
      const form = req.method === "POST" ? await req.formData() : null;
      const f = (k) => (form?.get(k) ?? "").toString().trim();
      const avisoUrl = url.searchParams.get("ok") ? { tipo: "ok", texto: url.searchParams.get("ok") } : url.searchParams.get("erro") ? { tipo: "erro", texto: url.searchParams.get("erro") } : null;
      const ctx = { req, db, env, u, url, f, form, view, aviso: avisoUrl };

      let m;
      if (p === "/") return await painel(ctx);
      if (p === "/alunas") return await listaAlunas(ctx);
      if (p === "/alunas/nova") return await novaVenda(ctx);
      if ((m = p.match(/^\/alunas\/(\d+)$/))) return await detalheAluna(ctx, +m[1]);
      if ((m = p.match(/^\/alunas\/(\d+)\/editar$/)) && form) return await editarAluna(ctx, +m[1]);
      if ((m = p.match(/^\/alunas\/(\d+)\/decisao$/)) && form) return await novaDecisao(ctx, +m[1]);
      if ((m = p.match(/^\/parcelas\/(\d+)$/)) && form) return await editarParcela(ctx, +m[1]);
      if ((m = p.match(/^\/parcelas\/(\d+)\/pagamento$/)) && form) return await pagamentoParcela(ctx, +m[1]);
      if ((m = p.match(/^\/transacoes\/(\d+)$/)) && form) return await acaoTransacao(ctx, +m[1]);
      if (p === "/mensagens") return await mensagens(ctx);
      if (p === "/mensagens/gerar" && form) { exigir(u, "mensagens"); const r = await D.gerarFila(db, R.hojeFortaleza(), u.email); return redirect(`/mensagens?ok=${encodeURIComponent(`Fila gerada: ${r.mensagens} preparadas, ${r.bloqueadas} bloqueadas.${r.fonteDoDia ? "" : " Atenção: a conferência não é de hoje (R6), por isso as cobranças ficaram bloqueadas."}`)}`); }
      if ((m = p.match(/^\/mensagens\/(\d+)$/)) && form) return await statusMensagem(ctx, +m[1]);
      if (p === "/conferencia") return await conferencia(ctx);
      if (p === "/conferencia/importar" && form) return await importarExtrato(ctx);
      if (p === "/conferencia/feita" && form) { exigir(u, "pagamentos"); const quando = `${R.hojeFortaleza()} ${R.horaFortaleza()}`; await D.setConfig(db, "ultima_conferencia", quando); await D.auditar(db, u, "conferencia_feita", null, null, { quando }); return redirect("/conferencia?ok=" + encodeURIComponent("Conferência de hoje registrada.")); }
      if (p === "/inadimplencia") return await inadimplencia(ctx);
      if (p === "/grupo" && form) return await inadimplencia(ctx, f("pergunta"), f("autor"));
      if (p === "/relatorio-dia") return await relatorioDia(ctx);
      if (p === "/projecao") return await projecao(ctx);
      if (p === "/importar") return await importarParcelas(ctx);
      if (p === "/config") return await configuracoes(ctx);
      if (p.startsWith("/config/") && form) return await salvarConfig(ctx, p.slice(8));
      return view("Não encontrado", html`<h1>Página não encontrada</h1><p><a href="/">Voltar ao painel</a></p>`, u);
    } catch (e) {
      if (e instanceof Resp) return e.r;
      console.error(e);
      return new Response("Erro interno. A ação não foi concluída.", { status: 500 });
    }
  },

  // Rotina agendada (UTC): 11:40 = 8h40 Fortaleza (fila do dia); 20:30 = 17h30 (relatório do dia); seg 12:00 = 9h (inadimplência)
  async scheduled(evento, env) {
    const db = env.DB;
    const hoje = R.hojeFortaleza(new Date(evento.scheduledTime));
    if (!R.ehDiaUtil(hoje)) return;
    if (evento.cron === "40 11 * * 1-5") await D.gerarFila(db, hoje, "rotina 8h40");
    if (evento.cron === "30 20 * * 1-5") {
      const cfg = await D.config(db);
      await D.salvarRelatorio(db, "dia", hoje, R.textoRelatorioDia(hoje, await D.dadosRelatorioDia(db, hoje), D.fontesTexto(cfg)));
      await db.prepare("INSERT INTO execucoes (tipo, resumo, por) VALUES ('relatorio_dia', ?, 'rotina 17h30')").bind(hoje).run();
    }
    if (evento.cron === "0 12 * * 1") {
      const cfg = await D.config(db);
      const dados = R.inadimplencia(await D.alunasComParcelas(db), hoje);
      await D.salvarRelatorio(db, "inadimplencia", hoje, R.textoInadimplencia(dados, hoje, D.fontesTexto(cfg), Number(cfg.corte_inadimplencia_dias) || 30));
      await db.prepare("INSERT INTO execucoes (tipo, resumo, por) VALUES ('relatorio_inadimplencia', ?, 'rotina seg 9h')").bind(hoje).run();
    }
  },
};

// ================= login e primeiro acesso =================
async function login(req, db, view, url) {
  if (req.method === "POST") {
    const fd = await req.formData();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const senha = String(fd.get("senha") || "");
    if (await A.bloqueadoPorTentativas(db, email)) return view("Entrar", telaLogin("Muitas tentativas. Aguarde 15 minutos."), null);
    const u = await db.prepare("SELECT * FROM usuarios WHERE email = ? AND ativo = 1").bind(email).first();
    if (u) {
      const { hash } = await A.hashSenha(senha, u.senha_salt);
      if (A.iguais(hash, u.senha_hash)) {
        await D.auditar(db, u, "login");
        return redirect("/", await A.criarSessao(db, u.id));
      }
    }
    await A.registrarTentativa(db, email);
    return view("Entrar", telaLogin("E-mail ou senha incorretos."), null);
  }
  const vazio = !(await db.prepare("SELECT id FROM usuarios LIMIT 1").first());
  return view("Entrar", telaLogin(null, vazio), null);
}
function telaLogin(erro, vazio) {
  return html`<div class="login"><div class="logo">${raw(LOGO)}</div><h1>Contas a Receber</h1><p class="mut">Centro Liderar · Setor Financeiro</p><div class="caixa">
  ${erro ? html`<div class="aviso erro">${erro}</div>` : ""}
  <form method="post" action="/login" class="grade" data-col1>
  <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
  <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
  <button>Entrar</button></form>
  ${vazio ? html`<p class="mut peq">Nenhum usuário ainda. O primeiro acesso é feito em <a href="/setup">/setup</a> com o código de instalação.</p>` : ""}</div></div>`;
}
async function setup(req, db, env, view) {
  const existe = await db.prepare("SELECT id FROM usuarios LIMIT 1").first();
  if (existe) return redirect("/login");
  if (!env.SETUP_TOKEN) return view("Primeiro acesso", html`<div class="login"><div class="caixa"><p>Primeiro acesso desativado: o código de instalação (SETUP_TOKEN) não foi cadastrado no Cloudflare.</p></div></div>`, null);
  let erro = null;
  if (req.method === "POST") {
    const fd = await req.formData();
    const token = String(fd.get("token") || ""), email = String(fd.get("email") || "").trim().toLowerCase(), nome = String(fd.get("nome") || "").trim(), senha = String(fd.get("senha") || "");
    if (await A.bloqueadoPorTentativas(db, "setup")) erro = "Muitas tentativas. Aguarde 15 minutos.";
    else if (!A.iguais(await A.sha256(token), await A.sha256(env.SETUP_TOKEN))) { await A.registrarTentativa(db, "setup"); erro = "Código de instalação incorreto."; }
    else if (!email || !nome || !A.senhaValida(senha)) erro = "Preencha nome, e-mail e uma senha com pelo menos 10 caracteres.";
    else {
      const { hash, salt } = await A.hashSenha(senha);
      const r = await db.prepare("INSERT INTO usuarios (email, nome, perfil, senha_hash, senha_salt) VALUES (?, ?, 'admin', ?, ?)").bind(email, nome, hash, salt).run();
      await D.auditar(db, { email }, "primeiro_admin", "usuarios", r.meta.last_row_id);
      return redirect("/", await A.criarSessao(db, r.meta.last_row_id));
    }
  }
  return view("Primeiro acesso", html`<div class="login"><h1>Primeiro acesso</h1><div class="caixa">${erro ? html`<div class="aviso erro">${erro}</div>` : ""}
  <p class="mut peq">Crie a pessoa administradora. Depois disso esta página deixa de funcionar.</p>
  <form method="post" class="grade" data-col1>
  <label>Código de instalação<input name="token" type="password" required></label>
  <label>Nome<input name="nome" required></label><label>E-mail<input name="email" type="email" required></label>
  <label>Senha (mínimo 10 caracteres)<input name="senha" type="password" minlength="10" required></label><button>Criar acesso</button></form></div></div>`, null);
}

// ================= painel =================
async function painel({ db, u, view, aviso }) {
  const hoje = R.hojeFortaleza(), amanha = R.somaDias(hoje, 1), mes = hoje.slice(0, 7);
  const cfg = await D.config(db);
  const alunas = await D.alunasComParcelas(db);
  const inad = R.inadimplencia(alunas, hoje);
  const corte = Number(cfg.corte_inadimplencia_dias) || 30;
  const todas = alunas.flatMap((a) => a.parcelas.map((p) => ({ ...p, aluna: a })));
  const abertas = todas.filter((p) => p.status === "aberta" || p.status === "a_conferir");
  const saldo = (p) => p.valor - (p.valor_pago || 0);
  const soma = (xs) => xs.reduce((s, p) => s + saldo(p), 0);
  const vAmanha = abertas.filter((p) => p.vencimento === amanha), vHoje = abertas.filter((p) => p.vencimento === hoje);
  // Recebido no mês: parcelas pagas no mês (inclui as marcadas como pagas na planilha) + pagamentos confirmados ainda sem parcela
  const rp = await db.prepare("SELECT COALESCE(SUM(valor_pago),0) s, COUNT(*) n FROM parcelas WHERE status = 'paga' AND substr(pago_em,1,7) = ?").bind(mes).first();
  const rt = await db.prepare("SELECT COALESCE(SUM(valor),0) s, COUNT(*) n FROM transacoes WHERE status = 'confirmada' AND parcela_id IS NULL AND substr(data,1,7) = ?").bind(mes).first();
  const recebidoMes = { s: rp.s + rt.s, n: rp.n + rt.n };
  const previstoMes = todas.filter((p) => p.vencimento.slice(0, 7) === mes && p.status !== "transferida" && p.status !== "cancelada").reduce((s, p) => s + p.valor, 0);
  const aConferir = (await db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor),0) s FROM transacoes WHERE status = 'a_conferir'").first());
  const fila = (await db.prepare("SELECT status, COUNT(*) n FROM mensagens WHERE data_prevista = ? GROUP BY status").bind(hoje).all()).results;
  const nFila = (s) => fila.find((x) => x.status === s)?.n || 0;
  const conferidoHoje = (cfg.ultima_conferencia || "").slice(0, 10) === hoje;
  const linha = (p) => html`<tr><td><a href="/alunas/${p.aluna.id}">${p.aluna.nome}</a><div class="mut peq">${p.curso}</div></td><td>${p.numero}</td><td>${data(p.vencimento)}</td><td>${forma(p.forma)}</td><td class="num">${dinheiro(u, saldo(p))}</td><td>${selo(p.status)}</td></tr>`;
  const corpo = html`<h1>Painel de ${data(hoje)}</h1>
  ${!conferidoHoje ? html`<div class="aviso">A conferência de hoje ainda não foi registrada (última: ${cfg.ultima_conferencia || "nenhuma"}). Enquanto isso, as cobranças ficam bloqueadas pela regra R6. <a href="/conferencia">Ir para a conferência</a></div>` : ""}
  <div class="cards">
    <div class="card"><div class="r">Recebido no mês</div><div class="n">${dinheiro(u, recebidoMes.s)}</div><div class="r">${recebidoMes.n} pagamento(s) · previsto ${dinheiro(u, previstoMes)}</div></div>
    <div class="card"><div class="r">Vencem hoje / amanhã</div><div class="n">${vHoje.length} / ${vAmanha.length}</div><div class="r">${dinheiro(u, soma(vHoje))} / ${dinheiro(u, soma(vAmanha))}</div></div>
    <div class="card"><div class="r">Inadimplência</div><div class="n">${inad.financeiro.length} alunas</div><div class="r">${dinheiro(u, inad.financeiro.reduce((s, r) => s + r.valor, 0))} · ${inad.financeiro.filter((r) => r.dias > corte).length} acima de ${corte} dias</div></div>
    <div class="card"><div class="r">A conferir</div><div class="n">${aConferir.n}</div><div class="r">${dinheiro(u, aConferir.s)}</div></div>
    <div class="card"><div class="r">Mensagens de hoje</div><div class="n">${nFila("preparada")} a enviar</div><div class="r">${nFila("enviada")} enviadas · ${nFila("bloqueada")} bloqueadas</div></div>
  </div>
  <div class="caixa"><h2 class="t0">Vencem hoje e amanhã</h2>${vHoje.length + vAmanha.length ? html`<table><tr><th>Aluna</th><th>Parcela</th><th>Vencimento</th><th>Forma</th><th class="num">Saldo</th><th>Situação</th></tr>${[...vHoje, ...vAmanha].map(linha)}</table>` : html`<p class="mut">Nenhuma parcela.</p>`}</div>
  <div class="caixa"><h2 class="t0">Maiores atrasos</h2>${inad.financeiro.length ? html`<table><tr><th>Aluna</th><th>Curso</th><th class="num">Parcelas</th><th class="num">Valor vencido</th><th class="num">Dias</th><th>Faixa</th></tr>
    ${inad.financeiro.slice(0, 10).map((r) => html`<tr><td><a href="/alunas/${r.id}">${r.nome}</a></td><td>${r.cursos}</td><td class="num">${r.parcelas}</td><td class="num">${dinheiro(u, r.valor)}</td><td class="num">${r.dias}</td><td>${selo(r.dias > corte ? "vencida" : "pendente")} ${r.faixa}</td></tr>`)}</table>
    <p><a href="/inadimplencia">Ver relatório completo</a></p>` : html`<p class="mut">Nenhuma parcela vencida.</p>`}</div>`;
  return view("Painel", corpo, u, aviso);
}

// ================= alunas =================
async function listaAlunas({ db, u, url, view, aviso }) {
  const q = R.normaliza(url.searchParams.get("q") || ""), filtro = url.searchParams.get("filtro") || "";
  const hoje = R.hojeFortaleza();
  let alunas = await D.alunasComParcelas(db);
  if (u.perfil === "juridico") alunas = alunas.filter((a) => a.responsavel === "juridico");
  const linhas = alunas.map((a) => {
    const ab = a.parcelas.filter((p) => p.status === "aberta" || p.status === "a_conferir");
    const venc = ab.filter((p) => p.vencimento < hoje);
    const prox = ab.filter((p) => p.vencimento >= hoje)[0];
    return { a, saldo: ab.reduce((s, p) => s + p.valor - (p.valor_pago || 0), 0), vencido: venc.reduce((s, p) => s + p.valor - (p.valor_pago || 0), 0), nVenc: venc.length, prox, cursos: [...new Set(a.parcelas.map((p) => p.curso))].join(", ") };
  }).filter((r) => (!q || R.normaliza(r.a.nome + " " + r.cursos + " " + (r.a.telefone || "")).includes(q))
    && (!filtro || (filtro === "vencidas" && r.nVenc) || (filtro === "juridico" && r.a.responsavel === "juridico") || (filtro === "em_dia" && !r.nVenc) || filtro === r.a.situacao_mentoria));
  const corpo = html`<h1>Alunas</h1>
  <form class="busca" method="get"><input name="q" placeholder="Buscar por nome, curso ou telefone" value="${url.searchParams.get("q") || ""}">
  <select name="filtro"><option value="">Todas</option>${[["vencidas", "Com parcela vencida"], ["em_dia", "Em dia"], ["juridico", "No jurídico"], ["ativa", "Mentoria ativa"], ["pausada", "Pausada"], ["encerrada", "Encerrada"], ["cancelada", "Cancelada"]].map(([v, t]) => html`<option value="${v}" ${filtro === v ? raw("selected") : ""}>${t}</option>`)}</select>
  <button class="sec">Filtrar</button>${A.pode(u, "vender") ? html`<a class="botao" href="/alunas/nova">Nova venda</a>` : ""}</form>
  <div class="caixa"><table><tr><th>Aluna</th><th>Curso</th><th>Mentoria</th><th>Responsável</th><th class="num">Saldo</th><th class="num">Vencido</th><th>Próximo vencimento</th></tr>
  ${linhas.map((r) => html`<tr><td><a href="/alunas/${r.a.id}">${r.a.nome}</a></td><td>${r.cursos}</td><td>${selo(r.a.situacao_mentoria === "cancelada" ? "cancelada_m" : r.a.situacao_mentoria)}</td><td>${r.a.responsavel}</td>
  <td class="num">${dinheiro(u, r.saldo)}</td><td class="num">${r.nVenc ? html`<span class="selo erro">${A.pode(u, "valores") ? "R$ " + R.brl(r.vencido) : r.nVenc + " vencida(s)"}</span>` : html`<span class="mut">—</span>`}</td><td>${r.prox ? `${data(r.prox.vencimento)} · ${forma(r.prox.forma)}` : "—"}</td></tr>`)}
  </table>${linhas.length ? "" : html`<p class="mut">Nenhuma aluna encontrada.</p>`}</div>`;
  return view("Alunas", corpo, u, aviso);
}

function camposParcelamento() {
  return html`<label>Curso / mentoria<input name="curso" required placeholder="Ex.: Mentoria Diamante Business"></label>
  <label>Data da venda<input name="data_venda" type="date" value="${R.hojeFortaleza()}"></label>
  <label>Valor total (R$)<input name="valor_total" inputmode="decimal" required placeholder="6.000,00"></label>
  <label>Vendedora<input name="vendedora" placeholder="Lara"></label>
  <label>Origem<select name="origem"><option value="sistema">Sistema de vendas</option><option value="evento">Evento (MQA)</option><option value="planilha">Planilha</option><option value="manual">Manual</option></select></label>
  <label class="larga">Condição negociada (texto original do sistema de vendas)<textarea name="condicao" placeholder="Ex.: entrada de R$ 1.000 no cartão; restante em 5x por link de pagamento a cada 30 dias"></textarea></label>
  <label>Entrada (R$)<input name="entrada" inputmode="decimal" placeholder="0,00"></label>
  <label>Forma da entrada<select name="forma_entrada">${opcoesForma("cartao")}</select></label>
  <label>Vencimento da entrada<input name="venc_entrada" type="date"></label>
  <label>Nº de parcelas (sem a entrada)<input name="n_parcelas" type="number" min="0" max="60" value="0"></label>
  <label>Forma das parcelas<select name="forma">${opcoesForma("pix")}</select></label>
  <label>1º vencimento<input name="primeiro_venc" type="date"></label>
  <label>Repetição<select name="repeticao"><option value="mensal">Todo mês no mesmo dia</option><option value="dias">A cada N dias</option></select></label>
  <label>N dias (se "a cada N dias")<input name="intervalo" type="number" min="1" value="30"></label>
  <label>Quem gera a cobrança<input name="quem_gera" placeholder="Ex.: Elayne (link)"></label>`;
}
function opcoesForma(sel) { return Object.entries(R.FORMAS).map(([k, t]) => html`<option value="${k}" ${k === sel ? raw("selected") : ""}>${t}</option>`); }

async function criarContratacao(db, u, alunaId, f) {
  const valor_total = num(f("valor_total")), entrada = num(f("entrada") || "0") || 0, n = Number(f("n_parcelas") || 0);
  if (!f("curso") || !Number.isFinite(valor_total) || valor_total <= 0) return "Informe o curso e o valor total.";
  if (n > 0 && !R.lerData(f("primeiro_venc"))) return "Informe o 1º vencimento das parcelas.";
  if (entrada > 0 && !R.lerData(f("venc_entrada") || f("primeiro_venc"))) return "Informe o vencimento da entrada.";
  if (entrada > valor_total) return "A entrada é maior que o valor total.";
  const ps = R.gerarParcelas({ valor_total, entrada, forma_entrada: f("forma_entrada"), venc_entrada: R.lerData(f("venc_entrada")), n_parcelas: n,
    primeiro_venc: R.lerData(f("primeiro_venc")), intervalo_dias: Number(f("intervalo") || 30), mensal: f("repeticao") !== "dias", forma: f("forma") });
  if (!ps.length) return "Informe a entrada ou o número de parcelas.";
  const c = await db.prepare("INSERT INTO contratacoes (aluna_id, curso, data_venda, valor_total, condicao_negociada, vendedora, origem) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(alunaId, f("curso"), R.lerData(f("data_venda")), valor_total, f("condicao") || null, f("vendedora") || null, f("origem") || "manual").run();
  const cid = c.meta.last_row_id;
  const ins = db.prepare("INSERT INTO parcelas (contratacao_id, numero, vencimento, valor, forma, quem_gera) VALUES (?, ?, ?, ?, ?, ?)");
  await db.batch(ps.map((p) => ins.bind(cid, p.numero, p.vencimento, p.valor, p.forma, f("quem_gera") || (p.forma === "link" ? "Elayne" : null))));
  await D.auditar(db, u, "nova_contratacao", "contratacoes", cid, { aluna: alunaId, curso: f("curso"), valor_total, parcelas: ps.length });
  return null;
}

async function novaVenda({ db, u, f, form, view }) {
  exigir(u, "vender");
  let erro = null;
  if (form) {
    if (!f("nome")) erro = "Informe o nome da aluna.";
    else {
      const a = await db.prepare("INSERT INTO alunas (nome, telefone, email, obs) VALUES (?, ?, ?, ?)").bind(f("nome"), f("telefone").replace(/\D/g, "") || null, f("email") || null, f("obs") || null).run();
      const id = a.meta.last_row_id;
      erro = await criarContratacao(db, u, id, f);
      if (erro) { await db.prepare("DELETE FROM alunas WHERE id = ?").bind(id).run(); }
      else { await D.auditar(db, u, "nova_aluna", "alunas", id, { nome: f("nome") }); return redirect(`/alunas/${id}?ok=${encodeURIComponent("Venda cadastrada. Confira as parcelas geradas.")}`); }
    }
  }
  const corpo = html`<h1>Nova venda</h1><p class="mut">Cadastre exatamente como foi negociado. As parcelas são geradas pela condição e podem ser ajustadas uma a uma depois.</p>
  <div class="caixa"><form method="post" class="grade">
  <label>Nome da aluna<input name="nome" required value="${f("nome")}"></label>
  <label>WhatsApp (com DDD)<input name="telefone" inputmode="tel" placeholder="86 99999-9999" value="${f("telefone")}"></label>
  <label>E-mail<input name="email" type="email" value="${f("email")}"></label>
  <label class="larga">Observação da venda (combinados especiais)<input name="obs" value="${f("obs")}"></label>
  ${camposParcelamento()}<div class="larga"><button>Cadastrar venda</button></div></form></div>`;
  return view("Nova venda", corpo, u, erro ? { tipo: "erro", texto: erro } : null);
}

async function detalheAluna({ db, u, view, aviso, req }, id) {
  const a = (await D.alunasComParcelas(db, [id]))[0];
  if (!a) return view("Aluna", html`<h1>Aluna não encontrada</h1>`, u);
  if (u.perfil === "juridico" && a.responsavel !== "juridico") return proibido();
  const contr = (await db.prepare("SELECT * FROM contratacoes WHERE aluna_id = ? ORDER BY id").bind(id).all()).results;
  const parc = (await db.prepare("SELECT p.* FROM parcelas p JOIN contratacoes c ON c.id = p.contratacao_id WHERE c.aluna_id = ? ORDER BY p.vencimento").bind(id).all()).results;
  const trans = (await db.prepare(`SELECT t.*, (SELECT group_concat(e.fonte || ': ' || COALESCE(e.referencia,''), ' · ') FROM evidencias e WHERE e.transacao_id = t.id) ev,
    p.numero FROM transacoes t LEFT JOIN parcelas p ON p.id = t.parcela_id WHERE t.aluna_id = ? ORDER BY t.data DESC`).bind(id).all()).results;
  const msgs = (await db.prepare("SELECT * FROM mensagens WHERE aluna_id = ? ORDER BY data_prevista DESC, id DESC LIMIT 30").bind(id).all()).results;
  const dec = (await db.prepare("SELECT * FROM decisoes WHERE aluna_id = ? ORDER BY data DESC").bind(id).all()).results;
  const hoje = R.hojeFortaleza();
  const ed = A.pode(u, "editar"), pg = A.pode(u, "pagamentos");
  const saldo = parc.filter((p) => p.status === "aberta" || p.status === "a_conferir").reduce((s, p) => s + p.valor - p.valor_pago, 0);
  const pago = parc.reduce((s, p) => s + p.valor_pago, 0);
  const vencido = parc.filter((p) => (p.status === "aberta" || p.status === "a_conferir") && p.vencimento < hoje).reduce((s, p) => s + p.valor - p.valor_pago, 0);
  const corpo = html`<p><a href="/alunas">← Alunas</a></p><h1>${a.nome}</h1>
  <div class="cards"><div class="card"><div class="r">Pago (confirmado)</div><div class="n">${dinheiro(u, pago)}</div></div>
  <div class="card"><div class="r">Saldo em aberto</div><div class="n">${dinheiro(u, saldo)}</div></div>
  <div class="card"><div class="r">Vencido</div><div class="n">${dinheiro(u, vencido)}</div></div>
  <div class="card"><div class="r">Mentoria · responsável</div><div class="n n17">${a.situacao_mentoria} · ${a.responsavel}</div><div class="r">${a.telefone ? "WhatsApp " + a.telefone : "Sem telefone"}</div></div></div>
  ${ed ? html`<details class="caixa"><summary>Editar dados e situação</summary><form method="post" action="/alunas/${id}/editar" class="grade">
    <label>Nome<input name="nome" value="${a.nome}" required></label><label>WhatsApp<input name="telefone" value="${a.telefone || ""}"></label><label>E-mail<input name="email" value="${a.email || ""}"></label>
    <label>Situação da mentoria<select name="situacao_mentoria">${["ativa", "encerrada", "pausada", "cancelada"].map((s) => html`<option ${a.situacao_mentoria === s ? raw("selected") : ""}>${s}</option>`)}</select></label>
    <label>Responsável pela cobrança<select name="responsavel">${["financeiro", "juridico"].map((s) => html`<option ${a.responsavel === s ? raw("selected") : ""}>${s}</option>`)}</select></label>
    <label>Promessa de pagamento até (R3)<input name="promessa_ate" type="date" value="${a.promessa_ate || ""}"></label>
    <label>Em análise pela Jaciara (R4)<select name="em_analise_jaciara"><option value="0">Não</option><option value="1" ${a.em_analise_jaciara ? raw("selected") : ""}>Sim</option></select></label>
    <label class="larga">Observações<input name="obs" value="${a.obs || ""}"></label><div><button>Salvar</button></div></form></details>` : ""}
  ${contr.map((c) => html`<div class="caixa"><h2 class="t0">${c.curso} <span class="mut peq">· venda ${data(c.data_venda)} · ${dinheiro(u, c.valor_total)} · ${c.origem}${c.vendedora ? " · " + c.vendedora : ""}</span> ${selo(c.situacao)}</h2>
    ${c.condicao_negociada ? html`<p><b>Condição negociada:</b> ${c.condicao_negociada}</p>` : html`<p class="mut">Condição negociada não registrada.</p>`}
    ${c.saldo_transferido ? html`<p class="mut">Saldo transferido para nova contratação: ${dinheiro(u, c.saldo_transferido)} (transferido não é pago)</p>` : ""}
    <table><tr><th>Parcela</th><th>Vencimento</th><th>Forma</th><th class="num">Valor</th><th class="num">Pago</th><th>Situação</th><th>Link / obs.</th><th></th></tr>
    ${parc.filter((p) => p.contratacao_id === c.id).map((p) => html`<tr><td>${p.numero}</td><td>${data(p.vencimento)}${(p.status === "aberta" || p.status === "a_conferir") && p.vencimento < hoje ? html` <span class="selo erro">${R.diasEntre(p.vencimento, hoje)} dias</span>` : ""}</td>
      <td>${forma(p.forma)}${p.quem_gera ? html`<div class="mut peq">gera: ${p.quem_gera}</div>` : ""}</td><td class="num">${dinheiro(u, p.valor)}</td><td class="num">${dinheiro(u, p.valor_pago)}</td><td>${selo(p.status)}</td>
      <td class="peq">${p.link_pagamento ? html`<a href="${p.link_pagamento}" rel="noopener noreferrer" target="_blank">link</a> ` : ""}${p.obs || ""}</td>
      <td>${pg || ed ? html`<details><summary>Ações</summary>
        ${pg && p.status !== "paga" ? html`<form method="post" action="/parcelas/${p.id}/pagamento" class="grade" data-min260>
          <label>Valor recebido<input name="valor" inputmode="decimal" value="${R.brl(p.valor - p.valor_pago)}" required></label><label>Data<input name="data" type="date" value="${hoje}" required></label>
          <label>Fonte<select name="fonte">${Object.entries(FONTES).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
          <label>Referência (E2E, nosso número, NSU)<input name="referencia"></label><button>Registrar pagamento</button>
          <span class="mut peq">C6, Stone e C6 Pay confirmam. Conta Azul e comprovante ficam "a conferir".</span></form>` : ""}
        ${ed ? html`<form method="post" action="/parcelas/${p.id}" class="grade" data-min260>
          <label>Vencimento<input name="vencimento" type="date" value="${p.vencimento}"></label><label>Valor<input name="valor" value="${R.brl(p.valor)}"></label>
          <label>Forma<select name="forma">${opcoesForma(p.forma)}</select></label><label>Link de pagamento<input name="link_pagamento" type="url" value="${p.link_pagamento || ""}"></label>
          <label>Situação<select name="status">${["aberta", "paga", "a_conferir", "transferida", "cancelada"].map((s) => html`<option ${p.status === s ? raw("selected") : ""}>${s}</option>`)}</select></label>
          <label>Obs.<input name="obs" value="${p.obs || ""}"></label><button class="sec">Salvar parcela</button></form>` : ""}</details>` : ""}</td></tr>`)}</table></div>`)}
  ${A.pode(u, "vender") ? html`<details class="caixa"><summary>Nova contratação / renovação</summary><form method="post" action="/alunas/${id}/editar" class="grade"><input type="hidden" name="acao" value="contratacao">${camposParcelamento()}
    <label class="larga">Se for renegociação, transferir o saldo em aberto da contratação (opcional)<select name="transferir_de"><option value="">Não transferir</option>${contr.map((c) => html`<option value="${c.id}">${c.curso} (#${c.id})</option>`)}</select></label><div><button>Cadastrar</button></div></form></details>` : ""}
  <div class="caixa"><h2 class="t0">Pagamentos</h2>${trans.length ? html`<table><tr><th>Data</th><th class="num">Valor</th><th>Parcela</th><th>Evidências</th><th>Situação</th><th></th></tr>
    ${trans.map((t) => html`<tr><td>${data(t.data)}</td><td class="num">${dinheiro(u, t.valor)}</td><td>${t.numero || "—"}</td><td class="peq">${t.ev}</td><td>${selo(t.status)}</td>
    <td>${pg ? html`<div class="acoes">${t.status === "a_conferir" ? html`<form method="post" action="/transacoes/${t.id}"><input type="hidden" name="acao" value="confirmar"><button class="sec">Confirmar</button></form>` : ""}
    ${t.status !== "estornada" ? html`<form method="post" action="/transacoes/${t.id}" data-confirmar="Marcar este pagamento como estornado/cancelado?"><input type="hidden" name="acao" value="estornar"><button class="link">Estorno</button></form>` : ""}</div>` : ""}</td></tr>`)}</table>` : html`<p class="mut">Nenhum pagamento registrado.</p>`}</div>
  <div class="caixa"><h2 class="t0">Mensagens</h2>${msgs.length ? html`<table><tr><th>Data</th><th>Tipo</th><th>Situação</th><th>Texto</th></tr>${msgs.map((m) => html`<tr><td>${data(m.data_prevista)}</td><td>${TIPO_MSG[m.tipo] || m.tipo}</td><td>${selo(m.status)}${m.motivo ? html`<div class="mut peq">${m.motivo}</div>` : ""}</td><td class="peq">${m.texto}</td></tr>`)}</table>` : html`<p class="mut">Nenhuma mensagem.</p>`}</div>
  <div class="caixa"><h2 class="t0">Decisões (Jaciara)</h2>${dec.length ? html`<table><tr><th>Data</th><th>Decisão</th><th>Quem decidiu</th><th>Evidência</th></tr>${dec.map((d) => html`<tr><td>${data(d.data)}</td><td>${d.texto}</td><td>${d.decidido_por}</td><td class="peq">${d.evidencia || ""}</td></tr>`)}</table>` : html`<p class="mut">Nenhuma decisão registrada.</p>`}
    ${A.pode(u, "decisoes") ? html`<details><summary>Registrar decisão</summary><form method="post" action="/alunas/${id}/decisao" class="grade"><label class="larga">Decisão<input name="texto" required></label>
    <label>Quem decidiu<input name="decidido_por" value="Jaciara" required></label><label>Data<input name="data" type="date" value="${hoje}"></label><label>Evidência (mensagem, link)<input name="evidencia"></label><div><button>Registrar</button></div></form></details>` : ""}</div>`;
  return view(a.nome, corpo, u, aviso);
}

async function editarAluna({ db, u, f }, id) {
  if (f("acao") === "contratacao") {
    exigir(u, "vender");
    if (f("transferir_de")) {
      exigir(u, "editar");
      const origem = +f("transferir_de");
      const abertas = (await db.prepare("SELECT * FROM parcelas WHERE contratacao_id = ? AND status IN ('aberta','a_conferir')").bind(origem).all()).results;
      const total = abertas.reduce((s, p) => s + p.valor - p.valor_pago, 0);
      const erro = await criarContratacao(db, u, id, f);
      if (erro) return redirect(`/alunas/${id}?erro=${encodeURIComponent(erro)}`);
      await db.batch([db.prepare("UPDATE parcelas SET status = 'transferida', obs = COALESCE(obs || ' · ', '') || 'saldo transferido (não pago)' WHERE contratacao_id = ? AND status IN ('aberta','a_conferir')").bind(origem),
        db.prepare("UPDATE contratacoes SET situacao = 'renegociada', saldo_transferido = ? WHERE id = ?").bind(Math.round(total * 100) / 100, origem),
        db.prepare("UPDATE contratacoes SET contratacao_origem_id = ? WHERE id = (SELECT MAX(id) FROM contratacoes WHERE aluna_id = ?)").bind(origem, id)]);
      await D.auditar(db, u, "renegociacao", "contratacoes", origem, { saldo_transferido: total });
      return redirect(`/alunas/${id}?ok=${encodeURIComponent(`Renegociação registrada. Saldo transferido: R$ ${R.brl(total)} (não conta como pago).`)}`);
    }
    const erro = await criarContratacao(db, u, id, f);
    return redirect(`/alunas/${id}?${erro ? "erro=" + encodeURIComponent(erro) : "ok=" + encodeURIComponent("Contratação cadastrada.")}`);
  }
  exigir(u, "editar");
  await db.prepare(`UPDATE alunas SET nome = ?, telefone = ?, email = ?, situacao_mentoria = ?, responsavel = ?, promessa_ate = ?, em_analise_jaciara = ?, obs = ?, atualizado_em = datetime('now') WHERE id = ?`)
    .bind(f("nome"), f("telefone").replace(/\D/g, "") || null, f("email") || null, f("situacao_mentoria"), f("responsavel"), R.lerData(f("promessa_ate")), f("em_analise_jaciara") === "1" ? 1 : 0, f("obs") || null, id).run();
  await D.auditar(db, u, "editar_aluna", "alunas", id, { situacao: f("situacao_mentoria"), responsavel: f("responsavel"), promessa: f("promessa_ate"), analise: f("em_analise_jaciara") });
  return redirect(`/alunas/${id}?ok=${encodeURIComponent("Dados salvos.")}`);
}

async function novaDecisao({ db, u, f }, id) {
  exigir(u, "decisoes");
  await db.prepare("INSERT INTO decisoes (aluna_id, texto, decidido_por, data, evidencia, registrado_por) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, f("texto"), f("decidido_por"), R.lerData(f("data")) || R.hojeFortaleza(), f("evidencia") || null, u.email).run();
  await D.auditar(db, u, "decisao", "alunas", id, { texto: f("texto") });
  return redirect(`/alunas/${id}?ok=${encodeURIComponent("Decisão registrada.")}`);
}

async function alunaDaParcela(db, pid) {
  return db.prepare("SELECT c.aluna_id FROM parcelas p JOIN contratacoes c ON c.id = p.contratacao_id WHERE p.id = ?").bind(pid).first();
}

async function editarParcela({ db, u, f }, pid) {
  exigir(u, "editar");
  const ref = await alunaDaParcela(db, pid);
  const valor = num(f("valor")), venc = R.lerData(f("vencimento"));
  if (!ref || !Number.isFinite(valor) || !venc) return redirect(`/alunas/${ref?.aluna_id || ""}?erro=${encodeURIComponent("Valor ou vencimento inválido.")}`);
  const link = f("link_pagamento");
  if (link && !/^https:\/\//i.test(link)) return redirect(`/alunas/${ref.aluna_id}?erro=${encodeURIComponent("O link de pagamento precisa começar com https://")}`);
  await db.prepare("UPDATE parcelas SET vencimento = ?, valor = ?, forma = ?, link_pagamento = ?, status = ?, obs = ? WHERE id = ?")
    .bind(venc, valor, f("forma"), link || null, f("status"), f("obs") || null, pid).run();
  await D.auditar(db, u, "editar_parcela", "parcelas", pid, { venc, valor, forma: f("forma"), status: f("status"), link: !!link });
  return redirect(`/alunas/${ref.aluna_id}?ok=${encodeURIComponent("Parcela atualizada.")}`);
}

async function pagamentoParcela({ db, u, f }, pid) {
  exigir(u, "pagamentos");
  const ref = await alunaDaParcela(db, pid);
  const valor = num(f("valor")), dt = R.lerData(f("data")), fonte = f("fonte");
  if (!ref || !(valor > 0) || !dt || !FONTES[fonte]) return redirect(`/alunas/${ref?.aluna_id || ""}?erro=${encodeURIComponent("Pagamento inválido.")}`);
  const status = FONTES_CONFIRMAM.includes(fonte) ? "confirmada" : "a_conferir";
  const chave = f("referencia") ? `${fonte === "c6pay" ? "nsu" : "ref"}:${f("referencia")}` : `manual:${pid}:${dt}:${valor}:${A.aleatorio(4)}`;
  const r = await D.registrarTransacao(db, { chave, data: dt, valor, status, aluna_id: ref.aluna_id, parcela_id: pid, fonte, referencia: f("referencia") || null,
    obs: status === "a_conferir" ? (fonte === "conta_azul" ? "Conta Azul: conferir no C6/Stone (R7)" : "Comprovante: conferir no C6/Stone") : null }, u);
  await D.auditar(db, u, "pagamento", "transacoes", r.id, { parcela: pid, valor, fonte, status, nova: r.nova });
  return redirect(`/alunas/${ref.aluna_id}?ok=${encodeURIComponent(r.nova ? (status === "confirmada" ? "Pagamento confirmado." : "Pagamento registrado como a conferir.") : "Esse pagamento já existia: a evidência foi acrescentada, sem contar duas vezes.")}`);
}

async function acaoTransacao({ db, u, f }, tid) {
  exigir(u, "pagamentos");
  const t = await db.prepare("SELECT * FROM transacoes WHERE id = ?").bind(tid).first();
  if (!t) return redirect("/conferencia?erro=" + encodeURIComponent("Pagamento não encontrado."));
  const volta = f("voltar") || (t.aluna_id ? `/alunas/${t.aluna_id}` : "/conferencia");
  const acao = f("acao");
  if (acao === "vincular") {
    const pid = +f("parcela_id");
    const ref = await alunaDaParcela(db, pid);
    if (!ref) return redirect(`${volta}?erro=${encodeURIComponent("Parcela não encontrada.")}`);
    await db.prepare("UPDATE transacoes SET parcela_id = ?, aluna_id = ? WHERE id = ?").bind(pid, ref.aluna_id, tid).run();
    if (t.status === "confirmada" && !t.parcela_id) await D.aplicarNaParcela(db, pid, t.valor, t.data);
    else await db.prepare("UPDATE parcelas SET status = 'a_conferir' WHERE id = ? AND status = 'aberta'").bind(pid).run();
    await D.auditar(db, u, "vincular", "transacoes", tid, { parcela: pid });
    return redirect(`${volta}?ok=${encodeURIComponent("Pagamento vinculado à parcela.")}`);
  }
  if (acao === "confirmar" && t.status === "a_conferir") {
    await db.prepare("UPDATE transacoes SET status = 'confirmada', obs = COALESCE(obs || ' · ', '') || ? WHERE id = ?").bind(`confirmado por ${u.email}`, tid).run();
    if (t.parcela_id) {
      await db.prepare("UPDATE parcelas SET status = 'aberta' WHERE id = ? AND status = 'a_conferir'").bind(t.parcela_id).run();
      await D.aplicarNaParcela(db, t.parcela_id, t.valor, t.data);
    }
  } else if (acao === "estornar" && t.status !== "estornada") {
    await db.prepare("UPDATE transacoes SET status = 'estornada' WHERE id = ?").bind(tid).run();
    if (t.parcela_id && t.status === "confirmada") await D.aplicarNaParcela(db, t.parcela_id, t.valor, t.data, -1);
    if (t.parcela_id && t.status === "a_conferir") await db.prepare("UPDATE parcelas SET status = 'aberta' WHERE id = ? AND status = 'a_conferir'").bind(t.parcela_id).run();
  }
  await D.auditar(db, u, acao, "transacoes", tid);
  return redirect(`${volta}?ok=${encodeURIComponent(acao === "estornar" ? "Estorno registrado: o pagamento foi desfeito (P13: confirmar se a venda foi cancelada)." : "Pagamento confirmado.")}`);
}

// ================= mensagens =================
async function mensagens({ db, u, url, view, aviso }) {
  exigir(u, "mensagens");
  const dia = hojeDe(url);
  const rows = (await db.prepare("SELECT m.*, a.nome FROM mensagens m LEFT JOIN alunas a ON a.id = m.aluna_id WHERE m.data_prevista = ? ORDER BY CASE m.status WHEN 'preparada' THEN 0 WHEN 'bloqueada' THEN 2 ELSE 1 END, m.tipo").bind(dia).all()).results;
  const card = (m) => html`<div class="caixa"><div class="acoes" data-sep><div><b>${m.destino === "aluna" ? m.nome : m.destino}</b> · ${TIPO_MSG[m.tipo] || m.tipo} ${selo(m.status)}
    ${m.destino !== "aluna" ? html`<span class="mut peq">sobre ${m.nome}</span>` : ""} ${m.motivo ? html`<div class="mut peq">Motivo: ${m.motivo}</div>` : ""}</div>
    ${m.aluna_id ? html`<a class="peq" href="/alunas/${m.aluna_id}">ver aluna</a>` : ""}</div>
    <pre class="msg" id="msg${m.id}">${m.texto}</pre>
    <div class="acoes">${m.status === "preparada" ? html`${waLink(m.telefone, m.texto) ? html`<a class="botao" target="_blank" rel="noopener noreferrer" href="${waLink(m.telefone, m.texto)}">Abrir no WhatsApp</a>` : html`<span class="mut peq">Sem telefone</span>`}
      <button class="sec" type="button" data-copiar="msg${m.id}">Copiar</button>
      ${[["enviada", "Marcar enviada"], ["falhou", "Não saiu"], ["sem_confirmacao", "Sem confirmação"]].map(([s, t]) => html`<form method="post" action="/mensagens/${m.id}"><input type="hidden" name="status" value="${s}"><button class="${s === "enviada" ? "" : "link"}">${t}</button></form>`)}` : ""}
      ${m.status === "sem_confirmacao" ? html`<form method="post" action="/mensagens/${m.id}"><input type="hidden" name="status" value="enviada"><button class="link">Verifiquei: saiu</button></form><form method="post" action="/mensagens/${m.id}"><input type="hidden" name="status" value="falhou"><button class="link">Verifiquei: não saiu</button></form>` : ""}
    </div></div>`;
  const prep = rows.filter((r) => r.status === "preparada"), outras = rows.filter((r) => r.status !== "preparada" && r.status !== "bloqueada"), bloq = rows.filter((r) => r.status === "bloqueada");
  const corpo = html`<h1>Mensagens de ${data(dia)}</h1>
  <div class="aviso">O sistema prepara as mensagens (lembrete D-1, link no dia, vencida D+1, atraso D+3 e pedidos de link à Elayne). O botão abre o WhatsApp com o texto pronto e quem envia é você. Depois, marque como enviada para não repetir. A fila é gerada sozinha às 8h40 nos dias úteis.</div>
  <div class="acoes" data-mb><form method="post" action="/mensagens/gerar"><button>Gerar / atualizar fila de hoje</button></form>
  <form method="get" class="acoes"><input type="date" name="data" value="${dia}" data-auto><button class="sec">Ver dia</button></form></div>
  <h2>A enviar (${prep.length})</h2>${prep.length ? prep.map(card) : html`<p class="mut">Nada a enviar.</p>`}
  <h2>Bloqueadas (${bloq.length})</h2>${bloq.length ? bloq.map(card) : html`<p class="mut">Nenhuma.</p>`}
  <h2>Já tratadas (${outras.length})</h2>${outras.length ? outras.map(card) : html`<p class="mut">Nenhuma.</p>`}`;
  return view("Mensagens", corpo, u, aviso);
}
async function statusMensagem({ db, u, f }, id) {
  exigir(u, "mensagens");
  const s = f("status");
  if (!["enviada", "falhou", "sem_confirmacao"].includes(s)) return redirect("/mensagens");
  const m = await db.prepare("SELECT * FROM mensagens WHERE id = ?").bind(id).first();
  if (!m) return redirect("/mensagens");
  await db.prepare("UPDATE mensagens SET status = ?, atualizado_por = ?, atualizado_em = datetime('now') WHERE id = ?").bind(s, u.email, id).run();
  await D.auditar(db, u, "mensagem_" + s, "mensagens", id);
  return redirect(`/mensagens?data=${m.data_prevista}&ok=${encodeURIComponent("Situação da mensagem atualizada.")}`);
}

// ================= conferência =================
async function conferencia({ db, u, view, aviso }) {
  exigir(u, "pagamentos");
  const cfg = await D.config(db);
  const pend = (await db.prepare(`SELECT t.*, a.nome aluna, p.numero, (SELECT group_concat(e.fonte || ': ' || COALESCE(e.referencia,''), ' · ') FROM evidencias e WHERE e.transacao_id = t.id) ev
    FROM transacoes t LEFT JOIN alunas a ON a.id = t.aluna_id LEFT JOIN parcelas p ON p.id = t.parcela_id WHERE t.status = 'a_conferir' OR t.parcela_id IS NULL ORDER BY t.data DESC LIMIT 200`).all()).results;
  const abertas = (await db.prepare(`SELECT p.*, a.nome aluna_nome, c.curso FROM parcelas p JOIN contratacoes c ON c.id = p.contratacao_id JOIN alunas a ON a.id = c.aluna_id WHERE p.status IN ('aberta','a_conferir') ORDER BY p.vencimento`).all()).results;
  const corpo = html`<h1>Conferência de pagamentos</h1>
  <div class="caixa"><div class="acoes" data-sep><div>Última conferência registrada: <b>${cfg.ultima_conferencia || "nenhuma"}</b><div class="mut peq">As cobranças só saem com conferência do mesmo dia (R6).</div></div>
  <form method="post" action="/conferencia/feita" data-confirmar="Confirmar que a conferência de hoje (C6, Stone e Conta Azul) foi feita?"><button>Conferência de hoje feita</button></form></div></div>
  <div class="caixa"><h2 class="t0">Importar extrato (C6, Stone, C6 Pay ou Conta Azul)</h2>
  <p class="mut peq">Cole o CSV exportado (sem senha). Colunas aceitas: <b>data; valor; pagador; chave</b> (E2E, nosso número ou NSU) e, opcional, <b>situacao</b> (ex.: liquidado, capturada, estornada, previsto). Pagamento com a mesma chave já registrado vira só mais uma evidência.</p>
  <form method="post" action="/conferencia/importar" class="grade"><label>Fonte<select name="fonte">${Object.entries(FONTES).filter(([k]) => ["c6", "stone", "c6pay", "conta_azul"].includes(k)).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
  <label class="larga">CSV<textarea name="csv" required placeholder="data;valor;pagador;chave&#10;03/12/2026;500,00;ANA SOUZA;E2E123..."></textarea></label><div><button>Importar e cruzar</button></div></form></div>
  <div class="caixa"><h2 class="t0">Pagamentos a conferir ou sem parcela (${pend.length})</h2>${pend.length ? html`<table><tr><th>Data</th><th class="num">Valor</th><th>Pagador / aluna</th><th>Evidências</th><th>Situação</th><th>Ações</th></tr>
  ${pend.map((t) => { const sug = R.sugerirParcela({ valor: t.valor, data: t.data, pagador: t.pagador || t.aluna }, abertas); const cands = sug.parcela ? [sug.parcela] : sug.candidatas || [];
    return html`<tr><td>${data(t.data)}</td><td class="num">${dinheiro(u, t.valor)}</td><td>${t.aluna || t.pagador || "sem identificação"}${t.numero ? html`<div class="mut peq">parcela ${t.numero}</div>` : ""}${t.obs ? html`<div class="mut peq">${t.obs}</div>` : ""}</td><td class="peq">${t.ev}</td><td>${selo(t.status)}</td>
    <td><div class="acoes">${!t.parcela_id ? html`<form method="post" action="/transacoes/${t.id}" class="acoes"><input type="hidden" name="acao" value="vincular"><input type="hidden" name="voltar" value="/conferencia">
      <select name="parcela_id" data-w260>${cands.length ? "" : html`<option value="">Sem candidata com esse valor</option>`}${cands.map((p) => html`<option value="${p.id}">${p.aluna_nome} · ${p.numero} · ${data(p.vencimento)}</option>`)}
      ${abertas.filter((p) => !cands.includes(p)).slice(0, 300).map((p) => html`<option value="${p.id}">${p.aluna_nome} · ${p.numero} · ${data(p.vencimento)} · R$ ${R.brl(p.valor - p.valor_pago)}</option>`)}</select><button class="sec">Vincular</button></form>` : ""}
      ${t.status === "a_conferir" ? html`<form method="post" action="/transacoes/${t.id}"><input type="hidden" name="acao" value="confirmar"><input type="hidden" name="voltar" value="/conferencia"><button class="sec">Confirmar</button></form>` : ""}</div></td></tr>`; })}</table>` : html`<p class="mut">Nada a conferir.</p>`}</div>`;
  return view("Conferência", corpo, u, aviso);
}

async function importarExtrato({ db, u, f }) {
  exigir(u, "pagamentos");
  const fonte = f("fonte");
  if (!["c6", "stone", "c6pay", "conta_azul"].includes(fonte)) return redirect("/conferencia?erro=" + encodeURIComponent("Fonte inválida."));
  const linhas = R.lerCSV(f("csv"));
  const abertas = (await db.prepare(`SELECT p.*, a.nome aluna_nome, a.id aluna_id FROM parcelas p JOIN contratacoes c ON c.id = p.contratacao_id JOIN alunas a ON a.id = c.aluna_id WHERE p.status IN ('aberta','a_conferir')`).all()).results;
  let novas = 0, repetidas = 0, auto = 0, ignoradas = 0, estornos = 0;
  for (const l of linhas) {
    const dt = R.lerData(l.data || l.data_pagamento || l.data_liquidacao), valor = num(l.valor || l.valor_pago || l.valor_liquido);
    const sit = R.normaliza(l.situacao || l.status || "");
    if (!dt || !(valor > 0)) { ignoradas++; continue; }
    if (fonte === "conta_azul" && sit.includes("previst")) { ignoradas++; continue; } // previsto não é recebimento
    if (fonte === "c6pay" && sit.includes("autoriz") && !sit.includes("captur")) { ignoradas++; continue; } // só autorizada não é pagamento
    const ref = l.chave || l.e2e || l.nosso_numero || l.nsu || l.id || "";
    const chave = ref ? `ref:${ref}` : `${fonte}:${dt}:${valor}:${R.normaliza(l.pagador || l.nome || "")}`;
    if (fonte === "c6pay" && (sit.includes("estorn") || sit.includes("cancel"))) {
      const t = await db.prepare("SELECT * FROM transacoes WHERE chave = ?").bind(chave).first();
      if (t && t.status !== "estornada") {
        await db.prepare("UPDATE transacoes SET status = 'estornada' WHERE id = ?").bind(t.id).run();
        if (t.parcela_id && t.status === "confirmada") await D.aplicarNaParcela(db, t.parcela_id, t.valor, t.data, -1);
        estornos++;
      }
      continue;
    }
    const confirma = FONTES_CONFIRMAM.includes(fonte);
    const sug = R.sugerirParcela({ valor, data: dt, pagador: l.pagador || l.nome || "" }, abertas.filter((p) => p.forma !== "link" || true));
    const vincula = confirma && sug.parcela && sug.confianca === "alta";
    const r = await D.registrarTransacao(db, { chave, data: dt, valor, status: confirma ? "confirmada" : "a_conferir", fonte, referencia: ref || null,
      aluna_id: vincula ? sug.parcela.aluna_id : null, parcela_id: vincula ? sug.parcela.id : null, pagador: l.pagador || l.nome || null,
      obs: vincula ? "vinculado automaticamente (nome e valor)" : confirma ? "recebido sem parcela identificada: vincular" : "Conta Azul: conferir no C6/Stone (R7)", detalhe: JSON.stringify(l).slice(0, 500) }, u);
    if (!r.nova) repetidas++; else { novas++; if (vincula) { auto++; const i = abertas.indexOf(sug.parcela); if (i >= 0) abertas.splice(i, 1); } }
  }
  await db.prepare("INSERT INTO execucoes (tipo, resumo, por) VALUES ('importar_extrato', ?, ?)").bind(`${fonte}: ${novas} novos (${auto} vinculados), ${repetidas} já existiam, ${estornos} estornos, ${ignoradas} ignorados`, u.email).run();
  await D.auditar(db, u, "importar_extrato", null, null, { fonte, novas, auto, repetidas, estornos, ignoradas });
  return redirect("/conferencia?ok=" + encodeURIComponent(`${FONTES[fonte]}: ${novas} pagamentos novos (${auto} vinculados automaticamente), ${repetidas} já existiam (viraram evidência), ${estornos} estornos, ${ignoradas} linhas ignoradas (sem data/valor, previstas ou só autorizadas).`));
}

// ================= inadimplência e grupo =================
async function inadimplencia({ db, u, view, aviso }, pergunta, autor) {
  exigir(u, "valores");
  const hoje = R.hojeFortaleza(), cfg = await D.config(db), corte = Number(cfg.corte_inadimplencia_dias) || 30;
  const dados = R.inadimplencia(await D.alunasComParcelas(db), hoje);
  const fontes = D.fontesTexto(cfg);
  const texto = R.textoInadimplencia(dados, hoje, fontes, corte);
  let resposta = null;
  if (pergunta != null) resposta = R.responderGrupo(pergunta, autor, ["Jaciara", "Jace", "Bruna", "Elayne", u.nome], dados, hoje, fontes, corte)
    ?? "(Sem resposta: a mensagem não cita \"inadimplência\" ou a pessoa não está autorizada.)";
  const grupo = "grupo " + (cfg.grupo_jace || "Setor Financeiro");
  const tabela = (xs) => html`<table><tr><th>Aluna</th><th>Curso</th><th class="num">Parcelas</th><th class="num">Valor vencido</th><th class="num">Dias</th><th>Faixa</th><th>Contatos</th><th>Obs.</th></tr>
    ${xs.map((r) => html`<tr><td><a href="/alunas/${r.id}">${r.nome}</a></td><td>${r.cursos}</td><td class="num">${r.parcelas}</td><td class="num">${dinheiro(u, r.valor)}</td><td class="num">${r.dias}</td><td>${selo(r.dias > corte ? "vencida" : "pendente")} ${r.faixa}</td><td class="peq">${r.contatos.join(", ")}</td><td class="peq">${r.obs}${r.a_conferir ? ` · ${r.a_conferir} a conferir` : ""}</td></tr>`)}</table>`;
  const corpo = html`<h1>Inadimplência</h1>
  <div class="aviso">Corte de ${corte} dias é provisório (regra R1, Jaciara define). Dias contados da parcela mais antiga em aberto. Fontes: ${fontes}.</div>
  <div class="caixa"><h2 class="t0">Texto para o ${grupo}</h2><pre class="msg" id="relinad">${texto}</pre><button type="button" data-copiar="relinad">Copiar relatório</button></div>
  <div class="caixa"><h2 class="t0">Responder uma pergunta do grupo</h2><p class="mut peq">Cole a mensagem que chegou no grupo. O sistema só responde quando ela cita "inadimplência" e vem de pessoa autorizada (Jaciara, Bruna, Elayne).</p>
  <form method="post" action="/grupo" class="grade"><label>Quem perguntou<input name="autor" value="${autor || "Jaciara"}"></label><label class="larga">Mensagem<input name="pergunta" value="${pergunta || ""}" placeholder="Ex.: Como está a inadimplência da Ana?"></label><div><button>Gerar resposta</button></div></form>
  ${resposta ? html`<pre class="msg" id="respgrupo">${resposta}</pre><button type="button" class="sec" data-copiar="respgrupo">Copiar resposta</button>` : ""}</div>
  <div class="caixa"><h2 class="t0">Financeiro (${dados.financeiro.length})</h2>${dados.financeiro.length ? tabela(dados.financeiro) : html`<p class="mut">Ninguém em atraso.</p>`}</div>
  <div class="caixa"><h2 class="t0">Com o jurídico (${dados.juridico.length})</h2><p class="mut peq">Fora da cobrança do financeiro; entra no total consolidado.</p>${dados.juridico.length ? tabela(dados.juridico) : html`<p class="mut">Nenhum caso.</p>`}</div>`;
  return view("Inadimplência", corpo, u, aviso);
}

// ================= relatório do dia (Elayne) =================
async function relatorioDia({ db, u, url, view, aviso }) {
  exigir(u, "mensagens");
  const dia = hojeDe(url), cfg = await D.config(db);
  const salvo = await db.prepare("SELECT * FROM relatorios WHERE tipo = 'dia' AND data = ?").bind(dia).first();
  const texto = dia === R.hojeFortaleza() || !salvo ? R.textoRelatorioDia(dia, await D.dadosRelatorioDia(db, dia), D.fontesTexto(cfg)) : salvo.texto;
  const wa = waLink(cfg.elayne_telefone, texto);
  const corpo = html`<h1>Relatório do dia · ${data(dia)}</h1>
  <div class="aviso">Vai para ${cfg.elayne_nome || "Elayne"} (WhatsApp ${cfg.elayne_telefone || "não cadastrado"}) às 17h30 dos dias úteis. O sistema salva o texto às 17h30; o envio é pelo botão abaixo.${salvo ? ` Versão salva às ${salvo.criado_em} (UTC).` : ""}</div>
  <div class="caixa"><pre class="msg" id="reldia">${texto}</pre><div class="acoes">${wa ? html`<a class="botao" target="_blank" rel="noopener noreferrer" href="${wa}">Enviar para a Elayne no WhatsApp</a>` : ""}<button class="sec" type="button" data-copiar="reldia">Copiar</button>
  <form method="get" class="acoes"><input type="date" name="data" value="${dia}" data-auto><button class="link">Ver outro dia</button></form></div></div>`;
  return view("Relatório do dia", corpo, u, aviso);
}

// ================= projeção =================
async function projecao({ db, u, view }) {
  exigir(u, "valores");
  const hoje = R.hojeFortaleza();
  const parcelas = (await D.alunasComParcelas(db)).filter((a) => a.responsavel === "financeiro").flatMap((a) => a.parcelas);
  const jur = (await D.alunasComParcelas(db)).filter((a) => a.responsavel === "juridico").flatMap((a) => a.parcelas);
  const pr = R.projecao(parcelas, hoje), pj = R.projecao(jur, hoje);
  const formas = Object.keys(R.FORMAS);
  const tabela = (rows) => html`<table><tr><th>Mês</th><th class="num">Em aberto</th><th class="num">Já vencido</th>${formas.map((k) => html`<th class="num">${R.FORMAS[k]}</th>`)}</tr>
    ${rows.map((r) => html`<tr><td>${r.mes.slice(5)}/${r.mes.slice(0, 4)}</td><td class="num">${dinheiro(u, r.total)}</td><td class="num">${dinheiro(u, r.vencido)}</td>${formas.map((k) => html`<td class="num">${r.porForma[k] ? dinheiro(u, r.porForma[k]) : ""}</td>`)}</tr>`)}</table>`;
  const corpo = html`<h1>Projeção de recebimentos</h1><p class="mut">Saldo das parcelas em aberto por mês de vencimento. Repasses do cartão (C6 Pay) entram pela data da venda; taxas por número de parcelas ainda pendentes (P14).</p>
  <div class="caixa"><h2 class="t0">Financeiro</h2>${pr.length ? tabela(pr) : html`<p class="mut">Sem parcelas em aberto.</p>`}</div>
  <div class="caixa"><h2 class="t0">Jurídico (acordos e saldos)</h2>${pj.length ? tabela(pj) : html`<p class="mut">Sem parcelas.</p>`}</div>`;
  return view("Projeção", corpo, u);
}

// ================= importar planilha =================
async function importarParcelas({ db, u, f, form, view, aviso }) {
  exigir(u, "importar");
  const exemplo = "aluna;telefone;curso;parcela;vencimento;valor;forma;situacao;valor_pago\n[TESTE] Ana Souza;86999990000;Mentoria Diamante;1/6;10/12/2026;1.000,00;pix;aberta;0";
  let previa = null, erro = null;
  if (form) {
    const linhas = R.lerCSV(f("csv"));
    const itens = linhas.map((l, i) => ({ i: i + 2, aluna: l.aluna || l.nome, telefone: (l.telefone || "").replace(/\D/g, ""), curso: l.curso || "Não informado", numero: l.parcela || l.numero || "1/1",
      vencimento: R.lerData(l.vencimento), valor: num(l.valor), forma: R.FORMAS[l.forma] ? l.forma : (R.normaliza(l.forma).includes("link") ? "link" : R.normaliza(l.forma).includes("stone") ? "boleto_stone" : R.normaliza(l.forma).includes("boleto") ? "boleto_c6" : R.normaliza(l.forma).includes("recorr") ? "cartao_recorrente" : R.normaliza(l.forma).includes("cart") ? "cartao" : "pix"),
      status: ["paga", "pg", "ok", "pago"].includes(R.normaliza(l.situacao)) ? "paga" : "aberta", valor_pago: num(l.valor_pago || "0") || 0, condicao: l.condicao || null }));
    const ruins = itens.filter((x) => !x.aluna || !x.vencimento || !Number.isFinite(x.valor));
    if (!itens.length) erro = "Nenhuma linha encontrada.";
    else if (f("confirmar") === "sim") {
      if (f("autorizacao").length < 5) erro = "Descreva a autorização para importar (quem autorizou e quando).";
      else {
        const ok = itens.filter((x) => !ruins.includes(x));
        const porChave = new Map();
        for (const x of ok) {
          const k = R.normaliza(x.aluna) + "|" + R.normaliza(x.curso);
          if (!porChave.has(k)) porChave.set(k, []);
          porChave.get(k).push(x);
        }
        let nA = 0, nP = 0;
        for (const grupo of porChave.values()) {
          const x0 = grupo[0];
          let a = await db.prepare("SELECT id FROM alunas WHERE lower(nome) = lower(?)").bind(x0.aluna).first();
          if (!a) { const r = await db.prepare("INSERT INTO alunas (nome, telefone) VALUES (?, ?)").bind(x0.aluna, x0.telefone || null).run(); a = { id: r.meta.last_row_id }; nA++; }
          const c = await db.prepare("INSERT INTO contratacoes (aluna_id, curso, valor_total, condicao_negociada, origem) VALUES (?, ?, ?, ?, 'planilha')").bind(a.id, x0.curso, grupo.reduce((s, x) => s + x.valor, 0), x0.condicao).run();
          const ins = db.prepare("INSERT INTO parcelas (contratacao_id, numero, vencimento, valor, forma, status, valor_pago, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
          await db.batch(grupo.map((x) => ins.bind(c.meta.last_row_id, x.numero, x.vencimento, x.valor, x.forma, x.status, x.status === "paga" ? x.valor : Math.min(x.valor_pago, x.valor), x.status === "paga" ? "marcada como paga na planilha (pg/OK conferido pela Bruna)" : null)));
          nP += grupo.length;
        }
        await D.auditar(db, u, "importar_planilha", null, null, { alunas_novas: nA, parcelas: nP, ignoradas: ruins.length, autorizacao: f("autorizacao") });
        await db.prepare("INSERT INTO execucoes (tipo, resumo, por) VALUES ('importar_planilha', ?, ?)").bind(`${nA} alunas novas, ${nP} parcelas, ${ruins.length} linhas com erro. Autorização: ${f("autorizacao")}`, u.email).run();
        return redirect("/alunas?ok=" + encodeURIComponent(`Importação concluída: ${nA} alunas novas e ${nP} parcelas. ${ruins.length} linhas com erro foram ignoradas.`));
      }
    }
    previa = { itens, ruins };
  }
  const corpo = html`<h1>Importar planilha</h1>
  <div class="aviso erro"><b>Dados reais:</b> importar a planilha da Bruna grava dados de alunas na base de produção. Faça isso só com autorização de quem responde pelos dados, e informe a autorização abaixo. Dados de teste devem ter "[TESTE]" no nome e não devem ir para a produção.</div>
  <div class="caixa"><p class="mut peq">Salve a aba da planilha como CSV e cole aqui. Colunas: <b>aluna; telefone; curso; parcela; vencimento; valor; forma; situacao; valor_pago; condicao</b>. Situação "pg", "OK" ou "paga" entra como paga. Primeiro aparece uma prévia; nada é gravado sem confirmar.</p>
  <form method="post" class="grade"><label class="larga">CSV<textarea name="csv" required placeholder="${exemplo}">${f("csv")}</textarea></label>
  ${previa && !previa.ruins.length || (previa && previa.itens.length > previa.ruins.length) ? html`<input type="hidden" name="confirmar" value="sim"><label class="larga">Autorização (quem autorizou e quando)<input name="autorizacao" required placeholder="Ex.: Jaciara, mensagem de 27/11/2026"></label>` : ""}
  <div><button>${previa ? "Confirmar importação" : "Ver prévia"}</button></div></form></div>
  ${previa ? html`<div class="caixa"><h2 class="t0">Prévia: ${previa.itens.length} linhas, ${previa.ruins.length} com erro</h2><table><tr><th>Linha</th><th>Aluna</th><th>Curso</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Forma</th><th>Situação</th></tr>
    ${previa.itens.slice(0, 200).map((x) => html`<tr><td>${x.i}</td><td>${x.aluna || html`<span class="selo erro">sem nome</span>`}</td><td>${x.curso}</td><td>${x.numero}</td><td>${x.vencimento ? data(x.vencimento) : html`<span class="selo erro">inválido</span>`}</td><td class="num">${Number.isFinite(x.valor) ? R.brl(x.valor) : html`<span class="selo erro">inválido</span>`}</td><td>${forma(x.forma)}</td><td>${selo(x.status)}</td></tr>`)}</table></div>` : ""}`;
  return view("Importar", corpo, u, erro ? { tipo: "erro", texto: erro } : aviso);
}

// ================= configurações =================
async function configuracoes({ db, u, view, aviso }) {
  exigir(u, "config");
  const cfg = await D.config(db);
  const regras = (await db.prepare("SELECT * FROM regras ORDER BY codigo").all()).results;
  const usuarios = (await db.prepare("SELECT id, email, nome, perfil, ativo FROM usuarios ORDER BY nome").all()).results;
  const aut = (await db.prepare("SELECT * FROM autorizacoes ORDER BY id DESC").all()).results;
  const exec = (await db.prepare("SELECT * FROM execucoes ORDER BY id DESC LIMIT 30").all()).results;
  const audit = (await db.prepare("SELECT * FROM auditoria ORDER BY id DESC LIMIT 50").all()).results;
  const corpo = html`<h1>Configurações</h1>
  <div class="caixa"><h2 class="t0">Contatos e rotina</h2><form method="post" action="/config/geral" class="grade">
    <label>Nome da Elayne<input name="elayne_nome" value="${cfg.elayne_nome || ""}"></label><label>WhatsApp da Elayne (55 + DDD + número)<input name="elayne_telefone" value="${cfg.elayne_telefone || ""}"></label>
    <label>Nome do grupo do WhatsApp (relatório de inadimplência)<input name="grupo_jace" value="${cfg.grupo_jace || "Setor Financeiro"}"></label><label>Corte de inadimplência (dias, R1)<input name="corte_inadimplencia_dias" type="number" min="1" value="${cfg.corte_inadimplencia_dias || 30}"></label>
    <div><button>Salvar</button></div></form>
    <p class="mut peq">Rotina automática (dias úteis): 8h40 gera a fila de mensagens; 17h30 salva o relatório do dia; segunda 9h salva o relatório de inadimplência.</p></div>
  <div class="caixa"><h2 class="t0">Regras</h2><table><tr><th>Código</th><th>Regra</th><th>Situação</th><th>Como funciona hoje</th><th></th></tr>
    ${regras.map((r) => html`<tr><td>${r.codigo}</td><td>${r.descricao}</td><td>${selo(r.situacao)}</td><td colspan="2"><form method="post" action="/config/regra" class="acoes"><input type="hidden" name="codigo" value="${r.codigo}">
    <input name="valor" value="${r.valor || ""}" data-flex><select name="situacao" data-auto><option ${r.situacao === "pendente" ? raw("selected") : ""}>pendente</option><option ${r.situacao === "definida" ? raw("selected") : ""}>definida</option></select><button class="sec">Salvar</button></form></td></tr>`)}</table></div>
  <div class="caixa"><h2 class="t0">Usuários</h2><table><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr>
    ${usuarios.map((x) => html`<tr><td>${x.nome}</td><td>${x.email}</td><td>${x.perfil}</td><td>${x.ativo ? "ativo" : "desativado"}</td><td>${x.id !== u.id ? html`<form method="post" action="/config/usuario-ativo"><input type="hidden" name="id" value="${x.id}"><button class="link">${x.ativo ? "Desativar" : "Reativar"}</button></form>` : ""}</td></tr>`)}</table>
    <details><summary>Novo usuário</summary><form method="post" action="/config/usuario" class="grade"><label>Nome<input name="nome" required></label><label>E-mail<input name="email" type="email" required></label>
    <label>Perfil<select name="perfil">${PERFIS.map((p) => html`<option>${p}</option>`)}</select></label><label>Senha inicial (mín. 10)<input name="senha" type="password" minlength="10" required></label><div><button>Criar</button></div></form>
    <p class="mut peq">Perfis: admin (tudo) · financeiro (tudo menos usuários e configurações) · comercial (vendas) · juridico (casos do jurídico e decisões) · consulta (situação, sem valores – P12). Entregue a senha à pessoa pessoalmente, nunca pelo grupo.</p></details>
    <details><summary>Trocar minha senha</summary><form method="post" action="/config/senha" class="grade"><label>Nova senha (mín. 10)<input name="senha" type="password" minlength="10" required></label><div><button>Trocar</button></div></form></details></div>
  <div class="caixa"><h2 class="t0">Autorizações</h2><table><tr><th>Categoria</th><th>Escopo e limites</th><th>Validade</th><th>Autorizado por</th><th>Situação</th></tr>
    ${aut.map((a) => html`<tr><td>${a.categoria}</td><td>${a.escopo}${a.limites ? html`<div class="mut peq">${a.limites}</div>` : ""}</td><td>${data(a.valida_de)} a ${data(a.valida_ate)}</td><td>${a.autorizado_por}<div class="mut peq">${a.evidencia || ""}</div></td><td>${a.situacao}</td></tr>`)}</table>
    <details><summary>Registrar autorização</summary><form method="post" action="/config/autorizacao" class="grade"><label>Categoria<select name="categoria"><option>Atualizar a base</option><option>Enviar cobranças</option><option>Comunicações internas</option><option>Alterar ou baixar lançamentos</option><option>Boletos</option></select></label>
    <label class="larga">Escopo<input name="escopo" required></label><label class="larga">Limites<input name="limites"></label><label>Válida de<input name="valida_de" type="date"></label><label>Válida até<input name="valida_ate" type="date"></label>
    <label>Autorizado por<input name="autorizado_por" required></label><label>Evidência<input name="evidencia"></label><div><button>Registrar</button></div></form></details></div>
  <div class="caixa"><h2 class="t0">Execuções da rotina</h2><table><tr><th>Quando (UTC)</th><th>Tipo</th><th>Resumo</th><th>Por</th></tr>${exec.map((e) => html`<tr><td class="peq">${e.quando}</td><td>${e.tipo}</td><td class="peq">${e.resumo}</td><td class="peq">${e.por}</td></tr>`)}</table></div>
  <div class="caixa"><h2 class="t0">Auditoria (últimas 50)</h2><table><tr><th>Quando (UTC)</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr>${audit.map((e) => html`<tr><td class="peq">${e.quando}</td><td class="peq">${e.usuario}</td><td>${e.acao} ${e.entidade || ""} ${e.entidade_id || ""}</td><td class="peq">${e.detalhe || ""}</td></tr>`)}</table></div>`;
  return view("Configurações", corpo, u, aviso);
}

async function salvarConfig({ db, u, f }, qual) {
  if (qual === "senha") {
    if (!A.senhaValida(f("senha"))) return redirect("/config?erro=" + encodeURIComponent("Senha com pelo menos 10 caracteres."));
    const { hash, salt } = await A.hashSenha(f("senha"));
    await db.prepare("UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?").bind(hash, salt, u.id).run();
    await db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(u.id).run();
    await D.auditar(db, u, "trocar_senha", "usuarios", u.id);
    return redirect("/login");
  }
  exigir(u, "config");
  if (qual === "geral") {
    for (const k of ["elayne_nome", "elayne_telefone", "grupo_jace", "corte_inadimplencia_dias"]) await D.setConfig(db, k, k === "elayne_telefone" ? f(k).replace(/\D/g, "") : f(k));
  } else if (qual === "regra") {
    await db.prepare("UPDATE regras SET valor = ?, situacao = ? WHERE codigo = ?").bind(f("valor"), f("situacao") === "definida" ? "definida" : "pendente", f("codigo")).run();
  } else if (qual === "usuario") {
    if (!PERFIS.includes(f("perfil")) || !A.senhaValida(f("senha"))) return redirect("/config?erro=" + encodeURIComponent("Perfil inválido ou senha curta."));
    const { hash, salt } = await A.hashSenha(f("senha"));
    try { await db.prepare("INSERT INTO usuarios (email, nome, perfil, senha_hash, senha_salt) VALUES (?, ?, ?, ?, ?)").bind(f("email").toLowerCase(), f("nome"), f("perfil"), hash, salt).run(); }
    catch { return redirect("/config?erro=" + encodeURIComponent("Esse e-mail já existe.")); }
  } else if (qual === "usuario-ativo") {
    await db.prepare("UPDATE usuarios SET ativo = 1 - ativo WHERE id = ? AND id != ?").bind(+f("id"), u.id).run();
    await db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(+f("id")).run();
  } else if (qual === "autorizacao") {
    await db.prepare("INSERT INTO autorizacoes (categoria, escopo, limites, valida_de, valida_ate, autorizado_por, evidencia) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(f("categoria"), f("escopo"), f("limites") || null, R.lerData(f("valida_de")), R.lerData(f("valida_ate")), f("autorizado_por"), f("evidencia") || null).run();
  } else return redirect("/config");
  await D.auditar(db, u, "config_" + qual, null, null, qual === "usuario" ? { email: f("email"), perfil: f("perfil") } : null);
  return redirect("/config?ok=" + encodeURIComponent("Salvo."));
}
