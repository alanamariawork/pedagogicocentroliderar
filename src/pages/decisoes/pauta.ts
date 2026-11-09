import type { Reg } from '../../lib/api'
import { formatarData } from '../../../shared/datas'

export interface OpcoesPauta {
  titulo: string
  data: string
  horario: string
  local: string
  incluirDecididas: boolean
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const SITUACAO: Record<string, string> = { aberta: 'Aberta', em_analise: 'Em análise', decidida: 'Decidida' }

/** Pauta de reunião em HTML simples: abre no Word (.doc) e imprime bem (PDF pelo navegador). */
export function montarPauta(decisoes: Reg[], o: OpcoesPauta, sistema: string): string {
  const pendentes = decisoes.filter((d) => d.situacao !== 'decidida')
  const decididas = decisoes.filter((d) => d.situacao === 'decidida')
  const itens = pendentes
    .map(
      (d, n) => `
    <div class="item">
      <h3>${n + 1}. ${esc(d.questao)}</h3>
      <table>
        <tr><th>Situação</th><td>${esc(SITUACAO[d.situacao])}</td></tr>
        <tr><th>Impacto</th><td>${esc(d.impacto) || '—'}</td></tr>
        <tr><th>Quem decide</th><td>${esc(d.responsavel) || 'a definir'}</td></tr>
        <tr><th>Encaminhamento</th><td class="linha">&nbsp;</td></tr>
        <tr><th>Responsável e prazo</th><td class="linha">&nbsp;</td></tr>
      </table>
    </div>`,
    )
    .join('')
  const jaDecididas =
    o.incluirDecididas && decididas.length
      ? `<h2>Para registro: decisões já tomadas</h2><ul>${decididas
          .map((d) => `<li><strong>${esc(d.questao)}</strong><br>Decisão em ${esc(formatarData(d.data_decisao))}: ${esc(d.decisao)}</li>`)
          .join('')}</ul>`
      : ''
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(o.titulo)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #2a1a1f; max-width: 720px; margin: 24px auto; padding: 0 16px; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 18pt; color: #6b1d33; margin: 0 0 4px; }
  h2 { font-size: 13pt; color: #6b1d33; border-bottom: 1px solid #c9a24a; padding-bottom: 2px; margin-top: 22px; }
  h3 { font-size: 11.5pt; margin: 14px 0 6px; }
  .meta td { padding: 2px 12px 2px 0; }
  table { border-collapse: collapse; width: 100%; }
  .item table th { text-align: left; width: 32%; font-weight: normal; color: #6b5a60; padding: 3px 8px 3px 0; vertical-align: top; }
  .item table td { padding: 3px 0; }
  td.linha { border-bottom: 1px solid #999; height: 18px; }
  .item { page-break-inside: avoid; }
  li { margin-bottom: 6px; }
  .rodape { margin-top: 28px; font-size: 9pt; color: #8a7a80; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  <h1>${esc(o.titulo)}</h1>
  <table class="meta">
    <tr><td><strong>Data:</strong> ${esc(o.data ? formatarData(o.data) : '____/____/______')}</td><td><strong>Horário:</strong> ${esc(o.horario) || '______'}</td></tr>
    <tr><td colspan="2"><strong>Local:</strong> ${esc(o.local) || '__________________________'}</td></tr>
    <tr><td colspan="2"><strong>Participantes:</strong> ____________________________________________</td></tr>
  </table>
  <h2>Objetivo</h2>
  <p>Decidir as questões em aberto que dependem da coordenação ou da direção antes de virarem regra no sistema.</p>
  <h2>Pauta (${pendentes.length} ${pendentes.length === 1 ? 'questão' : 'questões'})</h2>
  ${itens || '<p>Nenhuma questão em aberto.</p>'}
  ${jaDecididas}
  <h2>Próximos passos</h2>
  <p class="linha" style="border-bottom:1px solid #999;height:18px"></p>
  <p class="linha" style="border-bottom:1px solid #999;height:18px"></p>
  <p class="rodape">Gerado em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} pelo ${esc(sistema)}.</p>
</body></html>`
}
