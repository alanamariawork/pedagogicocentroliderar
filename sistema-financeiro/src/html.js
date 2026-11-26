// Layout e componentes HTML. Todo texto vindo do banco passa por esc().
import { brl, br, FORMAS } from "./regras.js";
import { pode } from "./auth.js";

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Para montar HTML: html`...${valor}...` escapa valores; raw() marca HTML já seguro.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      out += Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("") : v instanceof Raw ? v.s : esc(v);
    }
  });
  return raw(out);
}

export function dinheiro(u, v) { return pode(u, "valores") ? "R$ " + brl(v) : "—"; }
export const data = br;
export const forma = (f) => FORMAS[f] || f || "";

const ROTULOS = {
  aberta: ["Em aberto", "neutro"], paga: ["Paga", "ok"], a_conferir: ["A conferir", "alerta"], transferida: ["Transferida", "neutro"], cancelada: ["Cancelada", "neutro"],
  confirmada: ["Confirmada", "ok"], estornada: ["Estornada", "erro"],
  preparada: ["Preparada", "alerta"], bloqueada: ["Bloqueada", "erro"], enviada: ["Enviada", "ok"], sem_confirmacao: ["Sem confirmação", "alerta"], falhou: ["Falhou", "erro"],
  ativa: ["Ativa", "ok"], encerrada: ["Encerrada", "neutro"], pausada: ["Pausada", "alerta"], cancelada_m: ["Cancelada", "erro"],
  vencida: ["Vencida", "erro"], pendente: ["Pendente", "alerta"], definida: ["Definida", "ok"],
};
export function selo(s) { const [t, c] = ROTULOS[s] || [s, "neutro"]; return html`<span class="selo ${c}">${t}</span>`; }

const MENU = [
  ["/", "Painel", "ver", "painel"], ["/alunas", "Alunas", "ver", "alunas"], ["/mensagens", "Mensagens", "mensagens", "msg"], ["/conferencia", "Conferência", "pagamentos", "conf"],
  ["/inadimplencia", "Inadimplência", "valores", "inad"], ["/relatorio-dia", "Relatório do dia", "mensagens", "rel"], ["/projecao", "Projeção", "valores", "proj"],
  ["/importar", "Importar", "importar", "imp"], ["/config", "Configurações", "config", "cfg"],
];
// Ícones de traço fino, no estilo do backoffice
const IC = {
  painel: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  alunas: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  msg: '<path d="M4 5h16v11H8l-4 4z"/>',
  conf: '<path d="M4 12l5 5L20 6"/>',
  inad: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  rel: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  proj: '<path d="M3 20h18M5 16l5-5 4 3 6-7"/>',
  imp: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  cfg: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  sair: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
};
const icone = (k) => raw(`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ""}</svg>`);

// Descrição curta de cada tela, mostrada abaixo do título
const DESCRICAO = {
  "/": "Resumo do dia: o que já entrou, o que vence, quem está em atraso e o que falta conferir.",
  "/alunas": "Todas as alunas, com o que já pagaram, o que está em atraso e o próximo vencimento.",
  "/mensagens": "Mensagens de cobrança do dia. Uma pessoa confere e envia pelo WhatsApp.",
  "/conferencia": "Importe o extrato do banco para confirmar pagamentos. Sem a conferência do dia, nenhuma cobrança sai.",
  "/inadimplencia": "Quem está com parcela vencida, por tempo de atraso. É o texto enviado ao grupo do Setor Financeiro.",
  "/relatorio-dia": "Resumo do dia para a Elayne, pronto para enviar no WhatsApp.",
  "/projecao": "Quanto ainda deve entrar, mês a mês, pelas parcelas em aberto.",
  "/importar": "Carga da planilha (CSV), com prévia antes de gravar.",
  "/config": "Contatos, regras, usuários, autorizações e histórico de execuções.",
};

export const LOGO = `<svg viewBox="0 0 40 28" width="34" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M2 26 14 6l7 11 5-7 12 16Z"/><path d="M14 6l-4 20M14 6l6 20M26 10l-2 16"/></svg>`;
const FAVICON = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' rx='8' fill='#1e2532'/><path d='M5 32 17 12l7 11 5-7 7 16Z' fill='none' stroke='#fff' stroke-width='2' stroke-linejoin='round'/></svg>`);

const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const PERFIL = { admin: "Administrador", financeiro: "Financeiro", comercial: "Comercial", juridico: "Jurídico", consulta: "Consulta" };

export function pagina({ titulo, usuario, corpo, nonce, aviso, caminho = "/" }) {
  const ativo = (href) => (href === "/" ? caminho === "/" : caminho.startsWith(href));
  const menu = usuario ? MENU.filter(([, , a]) => pode(usuario, a)).map(([href, t, , ic]) =>
    html`<a href="${href}" class="${ativo(href) ? "ativo" : ""}">${icone(ic)}<span>${t}</span></a>`) : [];
  const marca = html`<div class="logo">${raw(LOGO)}<div><p class="nome">Centro Liderar</p><p class="sub">Contas a Receber</p></div></div>`;
  const sair = usuario ? html`<div class="pe"><span class="avatar">${iniciais(usuario.nome)}</span><div class="quem"><span>${usuario.nome}</span><small>${PERFIL[usuario.perfil] || usuario.perfil}</small></div><form method="post" action="/logout"><button class="sair" title="Sair" aria-label="Sair">${icone("sair")}</button></form></div>` : "";
  const avisoHtml = aviso ? html`<div class="aviso ${aviso.tipo || ""}">${aviso.texto}</div>` : "";
  const base = "/" + (caminho.split("/")[1] || "");
  const desc = DESCRICAO[base];
  let c = String(corpo);
  if (desc && !c.includes('class="subtitulo"')) c = c.replace("</h1>", `</h1><p class="subtitulo">${esc(desc)}</p>`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1e2532"><meta name="color-scheme" content="light"><link rel="icon" href="${FAVICON}">
<title>${esc(titulo)} · Contas a Receber · Centro Liderar</title><meta name="robots" content="noindex,nofollow">
<style nonce="${nonce}">${CSS}</style></head><body>
${usuario ? html`<div class="app"><aside class="lateral">${marca}<p class="secao-menu">Financeiro</p><nav aria-label="Menu principal">${menu}</nav>${sair}</aside>
<div class="conteudo"><header class="topo"><details class="menu-movel"><summary><span class="abrir">☰ Menu</span><span class="fechar">✕ Fechar</span></summary><div class="gaveta">${marca}<p class="secao-menu">Financeiro</p><nav>${menu}</nav>${sair}</div></details><span class="topo-nome">Contas a Receber</span></header>
<main><p class="eyebrow">Centro Liderar · Financeiro</p>${raw(avisoHtml)}${raw(c)}</main></div></div>` : html`<main class="solo">${raw(avisoHtml)}${raw(c)}</main>`}
<script nonce="${nonce}">${JS}</script></body></html>`;
}

const CSS = `
:root{--bg:#ece5dc;--card:#fff;--tx:#1f2329;--tx2:#3b4048;--mut:#666b73;--li:#e7e1d9;--li2:#d6cfc5;--pri:#1e2532;--pri6:#2c3544;--gold:#9a7a4a;--goldb:#a8814f;--golds:#f3ece2;
--side:#1e2532;--sidetx:#f2f0ec;--sidemut:#b7bcc5;--sideat:#2b3342;--ok:#2e7d4f;--okb:#e8f4ec;--al:#8a5a00;--alb:#fbf1dc;--alr:#efd9a8;--er:#b3261e;--erb:#fbecea;--info:#3d5a73;--infob:#eef2f5;--infor:#d5dee6;
--sombra:0 1px 2px rgb(31 35 41/.04),0 1px 8px rgb(31 35 41/.04)}
*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:var(--bg);color:var(--tx);-webkit-font-smoothing:antialiased}
:where(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--gold);outline-offset:2px}
a{color:var(--tx);text-decoration-color:var(--goldb);text-underline-offset:3px}
.app{display:flex;min-height:100vh}.lateral{width:236px;flex-shrink:0;background:var(--side);color:var(--sidetx);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.logo{display:flex;gap:10px;align-items:center;padding:18px 18px 14px;color:#fff}.logo p{margin:0;line-height:1.2}.logo .nome{font-weight:600;font-size:14.5px;color:#fff}.logo .sub{font-size:12px;color:var(--sidemut)}
.secao-menu{margin:4px 0 6px;padding:0 20px;font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--sidemut)}
.lateral nav,.gaveta nav{flex:1;overflow-y:auto;padding:0 10px 16px;display:flex;flex-direction:column;gap:2px}
.lateral nav a,.gaveta nav a{display:flex;gap:10px;align-items:center;padding:8px 12px;border-radius:7px;color:var(--sidetx);text-decoration:none;font-size:14px;opacity:.88}
.lateral nav a svg,.gaveta nav a svg{color:var(--sidemut);flex-shrink:0}
.lateral nav a:hover,.gaveta nav a:hover{background:rgb(255 255 255/.05);opacity:1}
.lateral nav a.ativo,.gaveta nav a.ativo{background:var(--sideat);opacity:1;font-weight:600;box-shadow:inset 3px 0 0 0 var(--goldb)}.lateral nav a.ativo svg,.gaveta nav a.ativo svg{color:#e6d3b3}
.pe{border-top:1px solid rgb(255 255 255/.08);padding:14px 16px 16px;display:flex;align-items:center;gap:10px}.pe form{margin:0 0 0 auto}
.avatar{width:30px;height:30px;border-radius:50%;background:#e6d8c2;color:var(--pri);display:grid;place-items:center;font-size:11.5px;font-weight:700;flex-shrink:0}
.quem{display:flex;flex-direction:column;min-width:0}.quem span{color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quem small{color:var(--sidemut);font-size:11.5px}
button.sair{background:none;border:0;color:var(--sidemut);padding:4px}button.sair:hover{background:none;color:#fff}
.conteudo{flex:1;min-width:0;display:flex;flex-direction:column}
.topo{display:none}
.menu-movel summary{list-style:none;white-space:nowrap;cursor:pointer;font-weight:600;color:var(--tx);padding:5px 10px;border:1px solid var(--li2);border-radius:7px;background:#fff}.menu-movel summary::-webkit-details-marker{display:none}.menu-movel .fechar,.menu-movel[open] .abrir{display:none}.menu-movel[open] .fechar{display:inline}.menu-movel[open] summary{position:fixed;top:12px;right:16px;z-index:30}.menu-movel[open]::before{content:'';position:fixed;inset:0;background:rgb(31 35 41/.45);z-index:19}
.gaveta{position:fixed;left:0;top:0;bottom:0;width:min(82vw,280px);background:var(--side);display:flex;flex-direction:column;z-index:20;box-shadow:0 16px 40px rgb(31 35 41/.3)}
.topo-nome{font-weight:600;color:var(--tx)}
@media (max-width:900px){.lateral{display:none}.topo{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--li2);position:sticky;top:0;z-index:5}}
main{width:100%;max-width:1180px;padding:26px 32px 64px}main.solo{max-width:none;padding:0}
@media (max-width:900px){main{padding:16px 16px 56px}}
.eyebrow{margin:0 0 2px;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
h1{font-weight:700;font-size:24px;letter-spacing:-.01em;margin:0 0 4px;color:var(--tx)}.subtitulo{margin:0 0 20px;color:var(--tx2)}
h2{font-weight:600;font-size:15.5px;margin:22px 0 10px;color:var(--tx)}
.secao{display:flex;align-items:center;gap:12px;margin:22px 0 10px;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx2)}.secao::after{content:'';flex:1;height:1px;background:var(--li2)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:10px;margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--li);border-radius:10px;padding:13px 14px;box-shadow:var(--sombra)}.card .r{color:var(--mut);font-size:12.5px}.card .t{color:var(--tx2);font-size:12.5px;margin-bottom:4px}.card .n{font-size:21px;font-weight:700;color:var(--tx);line-height:1.25;margin:2px 0}.card .r b{color:var(--tx2)}
.card .pos{color:var(--ok);font-weight:600}.card .neg{color:var(--er);font-weight:600}.card .ale{color:var(--al);font-weight:600}
.caixa{background:var(--card);border:1px solid var(--li);border-radius:10px;padding:16px 18px;margin-bottom:14px;overflow-x:auto;box-shadow:var(--sombra)}
.nota{background:var(--infob);border:1px solid var(--infor);border-radius:8px;padding:10px 14px;color:var(--tx2);font-size:13px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;color:var(--mut);font-weight:500;font-size:12px;white-space:nowrap;background:#faf8f5}
th,td{padding:10px 12px;border-bottom:1px solid var(--li);vertical-align:top}tr:hover td{background:#fcfbf9}tr:last-child td{border-bottom:0}td.num,th.num{text-align:right;white-space:nowrap}tr.total td{font-weight:700;background:#faf8f5}
.selo{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:var(--okb);color:var(--ok)}.alerta{background:var(--alb);color:var(--al)}.erro{background:var(--erb);color:var(--er)}.neutro{background:#f1ede7;color:var(--mut)}
.aviso{padding:10px 14px;border-radius:8px;margin-bottom:16px;background:var(--alb);border:1px solid var(--alr);color:var(--al)}.aviso a{color:var(--al);font-weight:600}.aviso.erro{background:var(--erb);border-color:#efc9c5;color:var(--er)}.aviso.ok{background:var(--okb);border-color:#c6e2cf;color:var(--ok)}
.barra{height:8px;background:#f1ede7;border-radius:99px;overflow:hidden;min-width:80px}.barra{display:inline-block;width:140px;vertical-align:middle;margin-right:8px}.barra span{display:block;height:100%;background:var(--goldb);border-radius:99px}${[...Array(21).keys()].map((i) => `.w${i * 5}{width:${i * 5}%}`).join("")}
form.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 12px;align-items:end}
label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:500;color:var(--tx)}
input,select,textarea{font:inherit;font-size:14px;padding:8px 11px;border:1px solid var(--li2);border-radius:7px;background:#fff;color:var(--tx);width:100%}
textarea{min-height:90px}.larga{grid-column:1/-1}
button,.botao{font:inherit;font-weight:600;padding:8px 16px;border-radius:7px;border:1px solid var(--pri);background:var(--pri);color:#fff;cursor:pointer;text-decoration:none;display:inline-block;font-size:13.5px}button:hover,.botao:hover{background:var(--pri6)}
button.sec,.botao.sec{background:#fff;color:var(--tx);border-color:var(--li2)}button.sec:hover,.botao.sec:hover{background:#f6f3ee}button.link,button.link:hover{background:none;border:0;color:var(--tx);text-decoration:underline;text-decoration-color:var(--goldb);padding:0;font-weight:500}
.acoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.acoes form{margin:0}
.mut{color:var(--mut)}.peq{font-size:12.5px}pre.msg{white-space:pre-wrap;background:#faf8f5;border:1px solid var(--li);border-radius:8px;padding:10px;font:13.5px/1.45 Inter,system-ui,sans-serif;margin:6px 0}
details summary{cursor:pointer;color:var(--tx);font-weight:600;margin:4px 0}.busca{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.busca input{max-width:320px}.busca select{width:auto;max-width:240px}@media (max-width:600px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card .n{font-size:17px}}
.login{max-width:400px;margin:0 auto;padding:12vh 16px}.login h1{font-size:26px;margin-bottom:0}.login .logo{padding:0 0 12px;color:var(--pri)}.n17{font-size:17px!important}h2.t0{margin-top:0}[data-col1]{grid-template-columns:1fr}[data-sep]{justify-content:space-between}[data-mb]{margin-bottom:12px}[data-w260]{max-width:260px}[data-flex]{min-width:220px;flex:1}[data-min260]{min-width:260px}[data-auto]{width:auto}.login .caixa{padding:22px;margin-top:14px}`;

const JS = `document.addEventListener('click',e=>{const b=e.target.closest('[data-copiar]');if(!b)return;
const t=document.getElementById(b.dataset.copiar);navigator.clipboard.writeText(t.innerText||t.value).then(()=>{const o=b.textContent;b.textContent='Copiado';setTimeout(()=>b.textContent=o,1500)})});
document.addEventListener('submit',e=>{const m=e.target.dataset.confirmar;if(m&&!confirm(m))e.preventDefault()});`;
