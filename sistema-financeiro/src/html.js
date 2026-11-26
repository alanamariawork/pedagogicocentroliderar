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

export const LOGO = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M16 3 28 13 16 29 4 13Z" fill="#5e1a33" stroke="#c9a86a" stroke-width="1"/><path d="M4 13h24M11 13l5 16 5-16M10 3.5 11 13M22 3.5 21 13" stroke="#c9a86a" stroke-width="1.4" fill="none"/></svg>`;
const FAVICON = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 3 28 13 16 29 4 13Z' fill='#5e1a33'/><path d='M4 13h24M11 13l5 16 5-16M10 3.5 11 13M22 3.5 21 13' stroke='#c9a86a' stroke-width='1.4' fill='none'/></svg>`);

export function pagina({ titulo, usuario, corpo, nonce, aviso, caminho = "/" }) {
  const menu = usuario ? MENU.filter(([, , a]) => pode(usuario, a)).map(([href, t]) =>
    html`<a href="${href}" class="${(href === "/" ? caminho === "/" : caminho.startsWith(href)) ? "ativo" : ""}">${t}</a>`) : [];
  const marca = html`<div class="logo">${raw(LOGO)}<div><p class="nome">Contas a Receber</p><p class="sub">Centro Liderar · Setor Financeiro</p></div></div>`;
  const sair = usuario ? html`<div class="pe"><div class="quem"><span>${usuario.nome}</span><small>${usuario.perfil}</small></div><form method="post" action="/logout"><button class="sair">Sair</button></form></div>` : "";
  const avisoHtml = aviso ? html`<div class="aviso ${aviso.tipo || ""}">${aviso.texto}</div>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#5e1a33"><meta name="color-scheme" content="light"><link rel="icon" href="${FAVICON}">
<title>${esc(titulo)} · Contas a Receber · Centro Liderar</title><meta name="robots" content="noindex,nofollow">
<style nonce="${nonce}">${CSS}</style></head><body>
${usuario ? html`<div class="app"><aside class="lateral">${marca}<nav aria-label="Menu principal">${menu}</nav>${sair}</aside>
<div class="conteudo"><header class="topo"><details class="menu-movel"><summary><span class="abrir">☰ Menu</span><span class="fechar">✕ Fechar</span></summary><div class="gaveta">${marca}<nav>${menu}</nav>${sair}</div></details>
<p class="eyebrow">Centro Liderar · Setor Financeiro</p><p class="eyebrow dir">${usuario.nome}</p></header>
<main>${raw(avisoHtml)}${corpo}</main></div></div>` : html`<main class="solo">${raw(avisoHtml)}${corpo}</main>`}
<script nonce="${nonce}">${JS}</script></body></html>`;
}

const CSS = `
:root{--bg:#faf7f4;--card:#fff;--tx:#2a1d22;--tx2:#46363c;--mut:#6b5b61;--li:#e8e1da;--li2:#cfc4b9;--pri:#5e1a33;--pri6:#722642;--pri2:#f8eef1;--gold:#9a7738;--goldl:#dcc89f;--golds:#f6efe1;
--side:#3b1222;--sidetx:#f6ece6;--sidemut:#d2bcc3;--sideat:#561b31;--ok:#2e6b45;--okb:#ebf5ee;--al:#7d5300;--alb:#fdf5e6;--er:#a8302a;--erb:#fbefed;--info:#2f5d86;--infob:#edf3f9;
--serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;--sombra:0 1px 2px rgb(42 29 34/.04),0 2px 10px rgb(42 29 34/.04)}
*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;font:14.5px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:var(--bg);color:var(--tx);-webkit-font-smoothing:antialiased}
:where(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--pri);outline-offset:2px}
a{color:var(--pri)}
.app{display:flex;min-height:100vh}.lateral{width:256px;flex-shrink:0;background:var(--side);color:var(--sidetx);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.logo{display:flex;gap:10px;align-items:center;padding:20px 18px 16px}.logo p{margin:0}.logo .nome{font-family:var(--serif);font-weight:600;font-size:16px;color:#fff}.logo .sub{font-size:11px;letter-spacing:.03em;color:var(--sidemut)}
.lateral nav,.gaveta nav{flex:1;overflow-y:auto;padding:4px 12px 16px;display:flex;flex-direction:column;gap:2px}
.lateral nav a,.gaveta nav a{display:block;padding:8px 12px;border-radius:8px;color:var(--sidemut);text-decoration:none;font-size:14px}
.lateral nav a:hover,.gaveta nav a:hover{background:rgb(255 255 255/.05);color:var(--sidetx)}
.lateral nav a.ativo,.gaveta nav a.ativo{background:var(--sideat);color:#fff;font-weight:500;box-shadow:inset 3px 0 0 0 var(--goldl)}
.pe{border-top:1px solid rgb(255 255 255/.08);padding:12px 18px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}.pe form{margin:0}
.quem{display:flex;flex-direction:column;min-width:0}.quem span{color:var(--sidetx);font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quem small{color:var(--sidemut);font-size:11.5px}
button.sair{background:none;border:1px solid rgb(255 255 255/.18);color:var(--sidetx);padding:5px 10px;font-size:12.5px;font-weight:500}
.conteudo{flex:1;min-width:0;display:flex;flex-direction:column}
.topo{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:12px 28px;background:#fff;border-bottom:1px solid var(--li)}
.eyebrow{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.eyebrow.dir{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500;font-size:13px}
.menu-movel{display:none}.menu-movel summary{list-style:none;white-space:nowrap;cursor:pointer;font-weight:600;color:var(--pri);padding:4px 8px;border:1px solid var(--li2);border-radius:8px}.menu-movel summary::-webkit-details-marker{display:none}.menu-movel .fechar,.menu-movel[open] .abrir{display:none}.menu-movel[open] .fechar{display:inline}.menu-movel[open] summary{position:fixed;top:12px;right:16px;z-index:30;background:#fff}.menu-movel[open]::before{content:'';position:fixed;inset:0;background:rgb(42 29 34/.45);z-index:19}
.gaveta{position:fixed;left:0;top:0;bottom:0;width:min(82vw,290px);background:var(--side);display:flex;flex-direction:column;z-index:20;box-shadow:0 16px 40px rgb(42 29 34/.3)}
@media (max-width:900px){.lateral{display:none}.menu-movel{display:block}.topo{padding:10px 16px}}
main{width:100%;max-width:1200px;margin:0 auto;padding:24px 28px 64px}main.solo{max-width:none;padding:0}
@media (max-width:900px){main{padding:16px 16px 56px}}
h1{font-family:var(--serif);font-weight:600;font-size:24px;margin:2px 0 16px;color:var(--tx)}h2{font-family:var(--serif);font-weight:600;font-size:18px;margin:24px 0 10px;color:var(--tx)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--li);border-radius:13px;padding:16px;box-shadow:var(--sombra);border-top:3px solid var(--goldl)}.card .n{font-family:var(--serif);font-size:23px;font-weight:600;color:var(--pri)}.card .r{color:var(--mut);font-size:12.5px}
.caixa{background:var(--card);border:1px solid var(--li);border-radius:13px;padding:16px 18px;margin-bottom:16px;overflow-x:auto;box-shadow:var(--sombra)}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--mut);font-weight:600;font-size:12px;white-space:nowrap}
th,td{padding:9px 10px;border-bottom:1px solid var(--li);vertical-align:top}tr:hover td{background:#fcfaf8}tr:last-child td{border-bottom:0}td.num,th.num{text-align:right;white-space:nowrap}
.selo{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:var(--okb);color:var(--ok)}.alerta{background:var(--alb);color:var(--al)}.erro{background:var(--erb);color:var(--er)}.neutro{background:#f4efea;color:var(--mut)}
.aviso{padding:11px 14px;border-radius:10px;margin-bottom:16px;background:var(--golds);border:1px solid var(--goldl);color:var(--tx)}.aviso.erro{background:var(--erb);border-color:#efc9c5}.aviso.ok{background:var(--okb);border-color:#c6e2cf}
form.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 12px;align-items:end}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mut)}
input,select,textarea{font:inherit;font-size:14px;padding:8px 11px;border:1px solid var(--li2);border-radius:8px;background:#fff;color:var(--tx);width:100%}
textarea{min-height:90px}.larga{grid-column:1/-1}
button,.botao{font:inherit;font-weight:500;padding:8px 14px;border-radius:8px;border:1px solid var(--pri);background:var(--pri);color:#fff;cursor:pointer;text-decoration:none;display:inline-block;font-size:14px}button:hover,.botao:hover{background:var(--pri6)}
button.sec,.botao.sec{background:#fff;color:var(--tx2);border-color:var(--li2)}button.sec:hover,.botao.sec:hover{background:#f4efea}button.link,button.link:hover{background:none;border:0;color:var(--pri);padding:0;font-weight:500}
.acoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.acoes form{margin:0}
.mut{color:var(--mut)}.peq{font-size:12.5px}pre.msg{white-space:pre-wrap;background:#fcfaf8;border:1px solid var(--li);border-radius:8px;padding:10px;font:13.5px/1.45 system-ui,sans-serif;margin:6px 0}
details summary{cursor:pointer;color:var(--pri);font-weight:600;margin:4px 0}.busca{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.busca input{max-width:320px}
.login{max-width:400px;margin:0 auto;padding:12vh 16px}.login h1{font-size:28px;color:var(--pri);margin-bottom:0}.login .logo{padding:0 0 10px}.n17{font-size:17px!important}h2.t0{margin-top:0}[data-col1]{grid-template-columns:1fr}[data-sep]{justify-content:space-between}[data-mb]{margin-bottom:12px}[data-w260]{max-width:260px}[data-flex]{min-width:220px;flex:1}[data-min260]{min-width:260px}[data-auto]{width:auto}.login .caixa{padding:22px}`;

const JS = `document.addEventListener('click',e=>{const b=e.target.closest('[data-copiar]');if(!b)return;
const t=document.getElementById(b.dataset.copiar);navigator.clipboard.writeText(t.innerText||t.value).then(()=>{const o=b.textContent;b.textContent='Copiado';setTimeout(()=>b.textContent=o,1500)})});
document.addEventListener('submit',e=>{const m=e.target.dataset.confirmar;if(m&&!confirm(m))e.preventDefault()});`;
