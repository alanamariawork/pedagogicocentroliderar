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
  ["/", "Painel", "ver"], ["/alunas", "Alunas", "ver"], ["/mensagens", "Mensagens", "mensagens"], ["/conferencia", "Conferência", "pagamentos"],
  ["/inadimplencia", "Inadimplência", "valores"], ["/relatorio-dia", "Relatório do dia", "mensagens"], ["/projecao", "Projeção", "valores"],
  ["/importar", "Importar", "importar"], ["/config", "Configurações", "config"],
];

export function pagina({ titulo, usuario, corpo, nonce, aviso, caminho = "/" }) {
  const menu = usuario ? MENU.filter(([, , a]) => pode(usuario, a)).map(([href, t]) =>
    html`<a href="${href}" class="${(href === "/" ? caminho === "/" : caminho.startsWith(href)) ? "ativo" : ""}">${t}</a>`) : [];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · Contas a Receber · Centro Liderar</title><meta name="robots" content="noindex,nofollow">
<style nonce="${nonce}">${CSS}</style></head><body>
${usuario ? html`<header><div class="marca"><b>Contas a Receber</b> · Centro Liderar</div><nav>${menu}</nav>
<form method="post" action="/logout" class="sair"><span>${usuario.nome} · ${usuario.perfil}</span><button class="link">Sair</button></form></header>` : ""}
<main>${aviso ? html`<div class="aviso ${aviso.tipo || ""}">${aviso.texto}</div>` : ""}${corpo}</main>
<script nonce="${nonce}">${JS}</script></body></html>`;
}

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--tx:#1d1d1f;--mut:#6b6b70;--li:#e4e2dc;--pri:#7a2e8e;--pri2:#f3e8f6;--ok:#1f7a4d;--okb:#e5f4ec;--al:#8a5a00;--alb:#fdf2dc;--er:#b3261e;--erb:#fbe9e7}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1e1e21;--tx:#ececef;--mut:#a0a0a8;--li:#33333a;--pri:#d49be3;--pri2:#3a2541;--ok:#6fd3a0;--okb:#1d3329;--al:#f0c069;--alb:#3a2f19;--er:#ff8a80;--erb:#3d2220}}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--tx)}
header{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:10px 16px;background:var(--card);border-bottom:1px solid var(--li);position:sticky;top:0;z-index:2}
.marca{font-size:15px;color:var(--mut)}.marca b{color:var(--pri)}nav{display:flex;flex-wrap:wrap;gap:4px;flex:1}
nav a{padding:6px 10px;border-radius:8px;color:var(--tx);text-decoration:none;font-size:14px}nav a.ativo,nav a:hover{background:var(--pri2);color:var(--pri)}
.sair{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mut)}
main{max-width:1180px;margin:0 auto;padding:18px 16px 60px}h1{font-size:22px;margin:4px 0 14px}h2{font-size:17px;margin:22px 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--li);border-radius:12px;padding:14px}.card .n{font-size:22px;font-weight:650}.card .r{color:var(--mut);font-size:13px}
.caixa{background:var(--card);border:1px solid var(--li);border-radius:12px;padding:14px;margin-bottom:14px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--mut);font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em}
th,td{padding:7px 8px;border-bottom:1px solid var(--li);vertical-align:top}tr:last-child td{border-bottom:0}td.num,th.num{text-align:right;white-space:nowrap}
.selo{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:var(--okb);color:var(--ok)}.alerta{background:var(--alb);color:var(--al)}.erro{background:var(--erb);color:var(--er)}.neutro{background:var(--li);color:var(--mut)}
.aviso{padding:10px 14px;border-radius:10px;margin-bottom:14px;background:var(--pri2);color:var(--tx)}.aviso.erro{background:var(--erb)}.aviso.ok{background:var(--okb)}
form.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 12px;align-items:end}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mut)}
input,select,textarea{font:inherit;padding:8px 10px;border:1px solid var(--li);border-radius:8px;background:var(--bg);color:var(--tx);width:100%}
textarea{min-height:90px}.larga{grid-column:1/-1}
button,.botao{font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;border:1px solid var(--pri);background:var(--pri);color:#fff;cursor:pointer;text-decoration:none;display:inline-block;font-size:14px}
@media (prefers-color-scheme:dark){button,.botao{color:#141416}}
button.sec,.botao.sec{background:transparent;color:var(--pri)}button.link{background:none;border:0;color:var(--pri);padding:0;font-weight:500}
.acoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.acoes form{margin:0}
.mut{color:var(--mut)}.peq{font-size:12.5px}pre.msg{white-space:pre-wrap;background:var(--bg);border:1px solid var(--li);border-radius:8px;padding:10px;font:13.5px/1.45 system-ui,sans-serif;margin:6px 0}
details summary{cursor:pointer;color:var(--pri);font-weight:600;margin:4px 0}.busca{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.busca input{max-width:320px}
@media (max-width:760px){header{gap:6px 12px}nav{order:3;width:100%;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch}nav a{white-space:nowrap}.sair{margin-left:auto}}
.login{max-width:380px;margin:10vh auto}.n17{font-size:17px!important}h2.t0{margin-top:0}[data-col1]{grid-template-columns:1fr}[data-sep]{justify-content:space-between}[data-mb]{margin-bottom:12px}[data-w260]{max-width:260px}[data-flex]{min-width:220px;flex:1}[data-min260]{min-width:260px}[data-auto]{width:auto}.login .caixa{padding:22px}`;

const JS = `document.addEventListener('click',e=>{const b=e.target.closest('[data-copiar]');if(!b)return;
const t=document.getElementById(b.dataset.copiar);navigator.clipboard.writeText(t.innerText||t.value).then(()=>{const o=b.textContent;b.textContent='Copiado';setTimeout(()=>b.textContent=o,1500)})});
document.addEventListener('submit',e=>{const m=e.target.dataset.confirmar;if(m&&!confirm(m))e.preventDefault()});`;
