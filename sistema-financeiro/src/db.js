// Acesso ao banco (D1) e operações que juntam regras + dados.
import * as R from "./regras.js";

export async function config(db) {
  const { results } = await db.prepare("SELECT chave, valor FROM configuracoes").all();
  return Object.fromEntries(results.map((r) => [r.chave, r.valor]));
}
export async function setConfig(db, chave, valor) {
  await db.prepare("INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(chave, valor).run();
}
export async function auditar(db, usuario, acao, entidade, id, detalhe) {
  await db.prepare("INSERT INTO auditoria (usuario, acao, entidade, entidade_id, detalhe) VALUES (?, ?, ?, ?, ?)")
    .bind(usuario?.email || "sistema", acao, entidade || null, id == null ? null : String(id), detalhe ? JSON.stringify(detalhe).slice(0, 2000) : null).run();
}

// Alunas com parcelas (das contratações não canceladas) e contatos já feitos
export async function alunasComParcelas(db, filtroIds) {
  const alunas = (await db.prepare("SELECT * FROM alunas ORDER BY nome").all()).results;
  const parcelas = (await db.prepare(`SELECT p.*, c.curso, c.aluna_id FROM parcelas p JOIN contratacoes c ON c.id = p.contratacao_id
     WHERE c.situacao != 'cancelada' ORDER BY p.vencimento`).all()).results;
  const msgs = (await db.prepare("SELECT aluna_id, tipo FROM mensagens WHERE status IN ('enviada','sem_confirmacao') AND destino = 'aluna'").all()).results;
  const rot = { lembrete: "D-1", link: "link no dia", vencida: "D+1", atraso: "D+3" };
  const porId = new Map(alunas.map((a) => [a.id, { ...a, parcelas: [], contatos: [] }]));
  for (const p of parcelas) porId.get(p.aluna_id)?.parcelas.push(p);
  for (const m of msgs) { const a = porId.get(m.aluna_id); if (a && !a.contatos.includes(rot[m.tipo])) a.contatos.push(rot[m.tipo] || m.tipo); }
  const lista = [...porId.values()];
  return filtroIds ? lista.filter((a) => filtroIds.includes(a.id)) : lista;
}

export function fontesTexto(cfg) {
  return cfg.ultima_conferencia ? `conferência de ${cfg.ultima_conferencia}` : "sem conferência registrada (valores segundo o cadastro)";
}

// Gera (ou atualiza) a fila de mensagens do dia. Idempotente: chave única por aluna + parcelas + tipo.
export async function gerarFila(db, hoje, por = "sistema") {
  const cfg = await config(db);
  const alunas = await alunasComParcelas(db);
  const feitas = new Set();
  const { results } = await db.prepare("SELECT parcela_ids, tipo FROM mensagens WHERE status NOT IN ('falhou','bloqueada')").all();
  for (const m of results) for (const id of String(m.parcela_ids || "").split(",")) if (id) feitas.add(`${id}|${m.tipo}`);
  const jaHoje = new Set((await db.prepare("SELECT DISTINCT aluna_id FROM mensagens WHERE data_prevista = ? AND destino = 'aluna' AND status NOT IN ('falhou','bloqueada')").bind(hoje).all()).results.map((r) => r.aluna_id));
  const fonteDoDia = (cfg.ultima_conferencia || "").slice(0, 10) === hoje;
  const elayne = cfg.elayne_nome || "Elayne";
  const { mensagens, bloqueadas } = R.planejar(alunas, hoje, feitas, fonteDoDia, elayne, jaHoje);
  const up = db.prepare(`INSERT INTO mensagens (chave, aluna_id, parcela_ids, tipo, destino, telefone, texto, status, motivo, data_prevista, atualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET texto = excluded.texto, status = excluded.status, motivo = excluded.motivo, telefone = excluded.telefone,
      data_prevista = excluded.data_prevista, atualizado_em = datetime('now')
    WHERE mensagens.status IN ('bloqueada','preparada')`);
  // bloqueios de hoje são recalculados a cada geração
  const stmts = [db.prepare("DELETE FROM mensagens WHERE data_prevista = ? AND status = 'bloqueada'").bind(hoje)];
  for (const m of mensagens) stmts.push(up.bind(m.chave, m.aluna_id, m.parcela_ids.join(","), m.tipo, m.destino === "aluna" ? "aluna" : elayne,
    m.destino === "aluna" ? m.telefone : cfg.elayne_telefone, m.texto, "preparada", null, hoje, por));
  for (const b of bloqueadas) stmts.push(up.bind(b.chave, b.aluna_id, b.parcela_ids.join(","), b.tipo, "aluna", b.telefone, b.texto, "bloqueada", b.motivo, hoje, por));
  if (stmts.length) await db.batch(stmts);
  await db.prepare("INSERT INTO execucoes (tipo, resumo, por) VALUES ('fila_mensagens', ?, ?)")
    .bind(`${hoje}: ${mensagens.length} preparadas, ${bloqueadas.length} bloqueadas${fonteDoDia ? "" : " (conferência não é de hoje: R6)"}`, por).run();
  return { mensagens: mensagens.length, bloqueadas: bloqueadas.length, fonteDoDia };
}

export async function dadosRelatorioDia(db, hoje) {
  const amanha = R.somaDias(hoje, 1);
  const pag = (await db.prepare(`SELECT t.valor, t.chave, a.nome aluna, (SELECT group_concat(DISTINCT e.fonte) FROM evidencias e WHERE e.transacao_id = t.id) fontes
     FROM transacoes t LEFT JOIN alunas a ON a.id = t.aluna_id WHERE t.status = 'confirmada' AND t.data = ?`).bind(hoje).all()).results
    .map((p) => ({ aluna: p.aluna || "sem identificação", valor: p.valor, origem: (p.fontes || "").replaceAll(",", " + ") }));
  const conf = (await db.prepare(`SELECT t.valor, t.obs, a.nome aluna FROM transacoes t LEFT JOIN alunas a ON a.id = t.aluna_id WHERE t.status = 'a_conferir'`).all()).results
    .map((c) => ({ aluna: c.aluna, valor: c.valor, motivo: c.obs || "a conferir" }));
  const msgs = (await db.prepare("SELECT m.tipo, m.destino, m.status, m.motivo, a.nome aluna FROM mensagens m LEFT JOIN alunas a ON a.id = m.aluna_id WHERE m.data_prevista = ?").bind(hoje).all()).results;
  const enviadas = msgs.filter((m) => m.status === "enviada" || m.status === "sem_confirmacao").map((m) => ({ ...m, destino: m.destino === "aluna" ? "aluna" : "interno" }));
  const bloq = msgs.filter((m) => m.status === "bloqueada" || m.status === "preparada").map((m) => ({ aluna: m.aluna, motivo: m.status === "preparada" ? "preparada e não enviada" : m.motivo }));
  const pedidos = msgs.filter((m) => m.tipo === "pedido_link").length;
  const linkAmanha = (await db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN link_pagamento IS NOT NULL AND link_pagamento != '' THEN 1 ELSE 0 END) r FROM parcelas WHERE forma = 'link' AND status IN ('aberta','a_conferir') AND vencimento = ?").bind(amanha).first());
  const novas = (await db.prepare("SELECT nome FROM alunas WHERE date(criado_em, '-3 hours') = ?").bind(hoje).all()).results.map((r) => r.nome);
  const vencAmanha = (await db.prepare("SELECT valor - valor_pago valor FROM parcelas WHERE status IN ('aberta','a_conferir') AND vencimento = ?").bind(amanha).all()).results;
  const inad = R.inadimplencia(await alunasComParcelas(db), hoje).financeiro;
  const pend = [];
  if (conf.length) pend.push(`Conferir ${conf.length} pagamento(s) a conferir`);
  if ((linkAmanha?.n || 0) > (linkAmanha?.r || 0)) pend.push(`Receber da Elayne ${(linkAmanha.n || 0) - (linkAmanha.r || 0)} link(s) para amanhã`);
  return { pagamentos: pag, a_conferir: conf, mensagens: enviadas, bloqueadas: bloq,
    links: { pedidos, recebidos: linkAmanha?.r || 0, faltando: (linkAmanha?.n || 0) - (linkAmanha?.r || 0) },
    novas_alunas: novas, vencem_amanha: vencAmanha, inadimplencia: inad, pendencias: pend };
}

export async function salvarRelatorio(db, tipo, data, texto) {
  await db.prepare("INSERT INTO relatorios (tipo, data, texto) VALUES (?, ?, ?) ON CONFLICT(tipo, data) DO UPDATE SET texto = excluded.texto, criado_em = datetime('now')")
    .bind(tipo, data, texto).run();
}

// Aplica um valor confirmado a uma parcela (parcial reduz o saldo; excesso fica anotado, P7 pendente)
export async function aplicarNaParcela(db, parcelaId, valor, data, sinal = 1) {
  const p = await db.prepare("SELECT * FROM parcelas WHERE id = ?").bind(parcelaId).first();
  if (!p) return null;
  let pago = Math.round((Number(p.valor_pago) + sinal * valor) * 100) / 100;
  let obs = p.obs || "";
  if (pago > p.valor + 0.009) { obs = (obs ? obs + " · " : "") + `Valor a mais R$ ${R.brl(pago - p.valor)} (P7 pendente)`; pago = p.valor; }
  if (pago < 0) pago = 0;
  const status = pago >= p.valor - 0.009 ? "paga" : "aberta";
  await db.prepare("UPDATE parcelas SET valor_pago = ?, status = ?, pago_em = ?, obs = ? WHERE id = ?")
    .bind(pago, status, status === "paga" ? data : null, obs || null, parcelaId).run();
  return { status, pago };
}

// Registra uma transação; se a chave já existe, só acrescenta a evidência (mesmo pagamento = uma transação)
export async function registrarTransacao(db, t, usuario) {
  const existe = await db.prepare("SELECT * FROM transacoes WHERE chave = ?").bind(t.chave).first();
  if (existe) {
    await db.prepare("INSERT OR IGNORE INTO evidencias (transacao_id, fonte, referencia, detalhe) VALUES (?, ?, ?, ?)").bind(existe.id, t.fonte, t.referencia || t.chave, t.detalhe || null).run();
    return { id: existe.id, nova: false, status: existe.status };
  }
  const r = await db.prepare(`INSERT INTO transacoes (chave, data, valor, status, aluna_id, parcela_id, pagador, obs, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(t.chave, t.data, t.valor, t.status, t.aluna_id || null, t.parcela_id || null, t.pagador || null, t.obs || null, usuario?.email || "sistema").run();
  const id = r.meta.last_row_id;
  await db.prepare("INSERT OR IGNORE INTO evidencias (transacao_id, fonte, referencia, detalhe) VALUES (?, ?, ?, ?)").bind(id, t.fonte, t.referencia || t.chave, t.detalhe || null).run();
  if (t.parcela_id) {
    if (t.status === "confirmada") await aplicarNaParcela(db, t.parcela_id, t.valor, t.data);
    else await db.prepare("UPDATE parcelas SET status = 'a_conferir' WHERE id = ? AND status = 'aberta'").bind(t.parcela_id).run();
  }
  return { id, nova: true, status: t.status };
}
