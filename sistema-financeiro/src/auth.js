// Login, senhas (PBKDF2) e sessões. Nenhuma senha fica em texto: só hash + sal.
const ITER = 100000;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

export function aleatorio(n = 32) { return hex(crypto.getRandomValues(new Uint8Array(n))); }
export async function sha256(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

export async function hashSenha(senha, saltHex = aleatorio(16)) {
  const key = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: ITER }, key, 256);
  return { hash: hex(bits), salt: saltHex };
}
export function iguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function senhaValida(s) { return typeof s === "string" && s.length >= 10; }

export const COOKIE = "sf_sessao";
const HORAS = 12;

export async function criarSessao(db, usuarioId) {
  const token = aleatorio(32);
  const exp = new Date(Date.now() + HORAS * 3600e3).toISOString();
  await db.prepare("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)").bind(await sha256(token), usuarioId, exp).run();
  await db.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(new Date().toISOString()).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HORAS * 3600}`;
}
export function lerCookie(req) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}
export async function usuarioDaSessao(db, req) {
  const t = lerCookie(req);
  if (!t) return null;
  return db.prepare(`SELECT u.id, u.email, u.nome, u.perfil FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`).bind(await sha256(t), new Date().toISOString()).first();
}
export async function encerrarSessao(db, req) {
  const t = lerCookie(req);
  if (t) await db.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(await sha256(t)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
export async function bloqueadoPorTentativas(db, email) {
  const desde = new Date(Date.now() - 15 * 60e3).toISOString().replace("T", " ").slice(0, 19);
  const r = await db.prepare("SELECT COUNT(*) n FROM tentativas_login WHERE email = ? AND quando > ?").bind(email, desde).first();
  return (r?.n || 0) >= 5;
}
export async function registrarTentativa(db, email) {
  await db.prepare("INSERT INTO tentativas_login (email) VALUES (?)").bind(email).run();
}

// O que cada perfil pode fazer
export const PODE = {
  admin: ["ver", "valores", "editar", "pagamentos", "mensagens", "importar", "config", "usuarios", "decisoes"],
  financeiro: ["ver", "valores", "editar", "pagamentos", "mensagens", "importar", "decisoes"],
  comercial: ["ver", "valores", "vender"],
  juridico: ["ver", "valores", "decisoes"],
  consulta: ["ver"], // P12 pendente: sem valores
};
export function pode(u, acao) {
  if (!u) return false;
  if (acao === "vender") return ["admin", "financeiro", "comercial"].includes(u.perfil);
  return (PODE[u.perfil] || []).includes(acao);
}
