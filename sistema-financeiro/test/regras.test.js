// Testes das regras com dados fictícios ([TESTE]). Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/regras.js";

let seq = 0;
const P = (venc, o = {}) => ({ id: ++seq, numero: "2/6", vencimento: venc, valor: 500, valor_pago: 0, forma: "pix", status: "aberta", curso: "Mentoria FIC", ...o });
const A = (nome, parcelas, o = {}) => ({ id: ++seq, nome: "[TESTE] " + nome, telefone: "5500000000000", situacao_mentoria: "ativa", responsavel: "financeiro", parcelas, ...o });
const QUI = "2026-12-03";

test("datas em Fortaleza (UTC-3)", () => {
  assert.equal(R.hojeFortaleza(new Date("2026-12-04T02:00:00Z")), "2026-12-03");
  assert.equal(R.horaFortaleza(new Date("2026-12-04T20:30:00Z")), "17:30");
});

test("D-1 em dia útil gera lembrete", () => {
  const { mensagens } = R.planejar([A("Ana", [P("2026-12-04")])], QUI, new Set());
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].tipo, "lembrete");
  assert.match(mensagens[0].texto, /amanhã, 04\/12\/2026/);
  assert.match(mensagens[0].texto, /Olá, Ana!/);
});

test("vencimento na segunda: lembrete na sexta; nada no fim de semana", () => {
  const a = A("Bia", [P("2026-12-07")]);
  assert.equal(R.planejar([a], "2026-12-04", new Set()).mensagens[0].tipo, "lembrete");
  assert.equal(R.planejar([a], "2026-12-06", new Set()).mensagens.length, 0);
});

test("paga não recebe; comprovante em conferência bloqueia", () => {
  assert.equal(R.planejar([A("Cris", [P("2026-12-02", { status: "paga" })])], QUI, new Set()).mensagens.length, 0);
  const r = R.planejar([A("Dani", [P("2026-12-02", { status: "a_conferir" })])], QUI, new Set());
  assert.equal(r.mensagens.length, 0);
  assert.match(r.bloqueadas[0].motivo, /conferência/);
});

test("D+1 sai uma vez; D+3 no sábado vai para segunda", () => {
  const p = P("2026-12-02"); const a = A("Eva", [p]);
  const r1 = R.planejar([a], QUI, new Set());
  assert.equal(r1.mensagens[0].tipo, "vencida");
  const feitas = new Set([`${p.id}|vencida`]);
  assert.equal(R.planejar([a], QUI, feitas).mensagens.length, 0);
  assert.equal(R.planejar([a], "2026-12-04", feitas).mensagens.length, 0);
  const r3 = R.planejar([a], "2026-12-07", feitas);
  assert.equal(r3.mensagens[0].tipo, "atraso");
  assert.match(r3.mensagens[0].texto, /5 dias/);
  assert.equal(R.planejar([a], "2026-12-10", new Set([...feitas, `${p.id}|atraso`])).mensagens.length, 0, "sem 4ª mensagem");
});

test("rodada perdida: só a de atraso", () => {
  const r = R.planejar([A("Fabi", [P("2026-11-30")])], QUI, new Set());
  assert.deepEqual(r.mensagens.map((m) => m.tipo), ["atraso"]);
});

test("bloqueios: jurídico, pausada, promessa, análise, recorrente, sem telefone, fonte velha", () => {
  const casos = [
    A("G", [P("2026-12-02")], { responsavel: "juridico" }),
    A("H", [P("2026-12-02")], { situacao_mentoria: "pausada" }),
    A("I", [P("2026-12-02")], { promessa_ate: "2026-12-10" }),
    A("J", [P("2026-12-02")], { em_analise_jaciara: 1 }),
    A("K", [P("2026-12-02", { forma: "cartao_recorrente" })]),
    A("L", [P("2026-12-02")], { telefone: "" }),
  ];
  const r = R.planejar(casos, QUI, new Set());
  assert.equal(r.mensagens.length, 0);
  assert.equal(r.bloqueadas.length, 6);
  const v = R.planejar([A("M", [P("2026-12-04")])], QUI, new Set(), false);
  assert.match(v.bloqueadas[0].motivo, /R6/);
});

test("duas parcelas no mesmo dia: uma mensagem; uma por aluna por dia", () => {
  const r = R.planejar([A("Lia", [P("2026-12-02", { valor: 300, numero: "1/6" }), P("2026-12-02", { valor: 200, numero: "Entrada" })])], QUI, new Set());
  assert.equal(r.mensagens.length, 1);
  assert.match(r.mensagens[0].texto, /500,00/);
  assert.match(r.mensagens[0].texto, /venceram/);
  const r2 = R.planejar([A("Mel", [P("2026-12-02"), P("2026-12-04")])], QUI, new Set());
  assert.deepEqual(r2.mensagens.map((m) => m.tipo), ["vencida"]);
});

test("aluna que já tem mensagem hoje não recebe outra na regeração", () => {
  const p1 = P("2026-12-02"), p2 = P("2026-12-04"); const a = A("Bia", [p1, p2]);
  const r = R.planejar([a], QUI, new Set([`${p1.id}|vencida`]), true, "Elayne", new Set([a.id]));
  assert.equal(r.mensagens.length, 0);
});

test("parcial: cobra só o saldo", () => {
  const r = R.planejar([A("Nina", [P("2026-12-02", { valor: 500, valor_pago: 200 })])], QUI, new Set());
  assert.match(r.mensagens[0].texto, /R\$ 300,00/);
});

test("link: pedido à Elayne em D-1, bloqueio sem link, link no dia, D+1 com link", () => {
  const p = P("2026-12-04", { forma: "link" }); const a = A("Olívia", [p]);
  const r = R.planejar([a], QUI, new Set(), true, "Elayne Rocha GM");
  assert.deepEqual(r.mensagens.map((m) => m.destino), ["Elayne Rocha GM"]);
  assert.match(r.mensagens[0].texto, /gerar o link/);
  const b = R.planejar([a], "2026-12-04", new Set());
  assert.equal(b.mensagens.length, 0);
  assert.match(b.bloqueadas[0].motivo, /link/);
  p.link_pagamento = "https://pag.exemplo/FIC-1";
  const d0 = R.planejar([a], "2026-12-04", new Set());
  assert.equal(d0.mensagens[0].tipo, "link");
  assert.match(d0.mensagens[0].texto, /Hoje, 04\/12\/2026.*FIC-1/);
  const q = P("2026-12-02", { forma: "link", link_pagamento: "https://pag.exemplo/FIC-2" });
  const d1 = R.planejar([A("Quel", [q])], QUI, new Set([`${q.id}|link`]));
  assert.equal(d1.mensagens[0].tipo, "vencida");
  assert.match(d1.mensagens[0].texto, /FIC-2/);
});

test("inadimplência: ordena, marca >30, separa jurídico, ignora a vencer", () => {
  const hoje = "2026-12-15";
  const t = [A("Olga", [P("2026-11-05", { valor: 800 })], { contatos: ["D-1", "D+1", "D+3"] }),
    A("Paula", [P("2026-12-10", { valor: 400 })]),
    A("Rita", [P("2026-09-01", { valor: 1000 })], { responsavel: "juridico" }),
    A("Sara", [P("2026-12-20", { valor: 900 })])];
  const d = R.inadimplencia(t, hoje);
  assert.deepEqual(d.financeiro.map((r) => r.nome), ["[TESTE] Olga", "[TESTE] Paula"]);
  const txt = R.textoInadimplencia(d, hoje, "planilha 15/12");
  assert.match(txt, /🔴 \[TESTE\] Olga.*40 dias/);
  assert.match(txt, /jurídico.*1 · R\$ 1\.000,00/);
  assert.doesNotMatch(txt, /Sara/);
  // grupo
  const aut = ["Jaciara", "Bruna"];
  assert.match(R.responderGrupo("Quem está em inadimplência?", "Jaciara", aut, d, hoje, "x"), /^\*Relatório/);
  assert.equal(R.responderGrupo("bom dia", "Jaciara", aut, d, hoje, "x"), null);
  assert.equal(R.responderGrupo("inadimplencia?", "Fulano", aut, d, hoje, "x"), null);
  assert.match(R.responderGrupo("Inadimplência da Olga?", "Jaciara", aut, d, hoje, "x"), /^\[TESTE\] Olga/);
  assert.match(R.responderGrupo("inadimplência: dá pra dar desconto?", "jaciara", aut, d, hoje, "x"), /ficam com você/);
});

test("relatório do dia", () => {
  const txt = R.textoRelatorioDia(QUI, {
    pagamentos: [{ aluna: "[TESTE] Ana", valor: 500, origem: "Pix C6" }, { aluna: "[TESTE] Bia", valor: 300, origem: "boleto Stone" }],
    a_conferir: [{ aluna: "[TESTE] Dani", valor: 250, motivo: "comprovante sem lançamento no C6" }],
    mensagens: [{ tipo: "lembrete", destino: "aluna" }, { tipo: "lembrete", destino: "aluna" }, { tipo: "atraso", destino: "aluna" }, { tipo: "pedido_link", destino: "Elayne" }],
    bloqueadas: [{ aluna: "[TESTE] Olívia", motivo: "link ainda não recebido" }],
    links: { pedidos: 2, recebidos: 1, faltando: 1 }, novas_alunas: ["[TESTE] Zu"], vencem_amanha: [{ valor: 700 }],
    inadimplencia: [{ valor: 800, dias: 40 }, { valor: 400, dias: 5 }],
  }, "planilha 03/12");
  assert.match(txt, /Pagamentos confirmados: 2 · R\$ 800,00/);
  assert.match(txt, /2 lembretes, 1 avisos de atraso/);
  assert.match(txt, /acima de 30 dias: 1/);
  assert.match(R.textoRelatorioDia(QUI, {}, "x"), /Mensagens para alunas: nenhuma/);
});

test("gerar parcelas pela negociação", () => {
  const ps = R.gerarParcelas({ valor_total: 6000, entrada: 1000, forma_entrada: "cartao", venc_entrada: "2026-11-26", n_parcelas: 3, primeiro_venc: "2027-01-31", forma: "link" });
  assert.deepEqual(ps.map((p) => p.numero), ["Entrada", "1/3", "2/3", "3/3"]);
  assert.deepEqual(ps.map((p) => p.vencimento), ["2026-11-26", "2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.equal(ps.reduce((s, p) => s + p.valor, 0), 6000);
  assert.equal(ps[1].forma, "link");
  const d = R.gerarParcelas({ valor_total: 1000, n_parcelas: 3, primeiro_venc: "2026-12-10", intervalo_dias: 15, mensal: false, forma: "pix" });
  assert.deepEqual(d.map((p) => p.vencimento), ["2026-12-10", "2026-12-25", "2027-01-09"]);
  assert.equal(Math.round(d.reduce((s, p) => s + p.valor, 0) * 100), 100000);
});

test("CSV, valores e datas brasileiras", () => {
  const rows = R.lerCSV('Aluna;Valor;Data\n"Silva; Ana";"1.234,56";05/12/2026\n');
  assert.equal(rows[0].aluna, "Silva; Ana");
  assert.equal(R.lerValor(rows[0].valor), 1234.56);
  assert.equal(R.lerData(rows[0].data), "2026-12-05");
  assert.equal(R.lerValor("R$ 500"), 500);
});

test("sugestão de parcela para pagamento do extrato", () => {
  const abertas = [{ id: 1, aluna_nome: "[TESTE] Ana Souza", valor: 500, valor_pago: 0, vencimento: "2026-12-02" },
    { id: 2, aluna_nome: "[TESTE] Bia Lima", valor: 500, valor_pago: 0, vencimento: "2026-12-02" }];
  assert.equal(R.sugerirParcela({ valor: 500, data: "2026-12-03", pagador: "ANA SOUZA" }, abertas).parcela.id, 1);
  const amb = R.sugerirParcela({ valor: 500, data: "2026-12-03", pagador: "" }, abertas);
  assert.equal(amb.parcela, null);
  assert.equal(amb.candidatas.length, 2, "valor igual sem identificação: a conferir, com candidatas");
});

test("projeção por mês", () => {
  const pr = R.projecao([P("2026-12-02"), P("2026-12-20", { forma: "link" }), P("2027-01-05", { status: "paga" })], "2026-12-10");
  assert.equal(pr.length, 1);
  assert.equal(pr[0].total, 1000);
  assert.equal(pr[0].vencido, 500);
});

test("forma da planilha: não inventa banco e guarda o texto original", () => {
  const f = (t) => R.formaDaPlanilha(t);
  assert.equal(f("BOLETO").forma, "boleto");
  assert.equal(f("BOLETO").original, "BOLETO");
  assert.equal(f("BOLETO - STONE").forma, "boleto_stone");
  assert.equal(f("Boleto C6").forma, "boleto_c6");
  assert.equal(f("CARTÃO").forma, "cartao_ni");
  assert.equal(f("CARTÃO - MANDAR LINK").forma, "link");
  assert.equal(f("CARTÃO - MANDAR LINK").convertida, true);
  assert.equal(f("PIX MENSALMENTE").forma, "pix");
  const misto = f("BOLETO e DEPOIS CARTÃO");
  assert.equal(misto.forma, "a_conferir"); assert.equal(misto.aConferir, true);
  assert.equal(f("A conferir").forma, "a_conferir");
  assert.equal(f("").forma, "a_conferir");
  assert.equal(f("transferência").forma, "a_conferir");
});

test("forma a conferir bloqueia a cobrança e mostra o texto da planilha", () => {
  const a = { responsavel: "financeiro", situacao_mentoria: "ativa" };
  const m = R.bloqueio(a, { status: "aberta", forma: "a_conferir", forma_planilha: "BOLETO e DEPOIS CARTÃO" }, true, "2026-11-27");
  assert.match(m, /forma de pagamento a conferir/);
  assert.match(m, /BOLETO e DEPOIS CARTÃO/);
});
