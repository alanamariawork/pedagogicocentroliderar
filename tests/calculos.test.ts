import { describe, expect, it } from 'vitest'
import { criaCiclo, grupoDoMes, indicadorAtraso, mesclarIntervalos, minutosEmComum, resumoQuantidades, somaMinutos, sugerirDatas } from '../shared/calculos'
import { formatarData, inicioDaSemana, somarMeses } from '../shared/datas'

const oc = (o: Partial<{ situacao: string; data_prevista: string | null; data_agendada: string | null; data_realizada: string | null }>) => ({
  situacao: 'prevista',
  data_prevista: null,
  data_agendada: null,
  data_realizada: null,
  ...o,
})

describe('intervalos', () => {
  it('não conta disponibilidade sobreposta duas vezes (IN05)', () => {
    const l = [
      { inicio: '2026-11-03T09:00', fim: '2026-11-03T11:00' },
      { inicio: '2026-11-03T10:00', fim: '2026-11-03T12:00' },
    ]
    expect(mesclarIntervalos(l)).toEqual([{ inicio: '2026-11-03T09:00', fim: '2026-11-03T12:00' }])
    expect(somaMinutos(l)).toBe(180)
  })
  it('calcula minutos reservados dentro da disponibilidade', () => {
    const disp = [{ inicio: '2026-11-03T09:00', fim: '2026-11-03T12:00' }]
    const res = [{ inicio: '2026-11-03T11:00', fim: '2026-11-03T13:00' }]
    expect(minutosEmComum(disp, res)).toBe(60)
  })
})

describe('painel do mês', () => {
  it('coloca cada ocorrência em um único grupo (CA12)', () => {
    expect(grupoDoMes(oc({ data_prevista: '2026-10-10' }), '2026-10')).toBe('previstos')
    expect(grupoDoMes(oc({ data_prevista: '2026-09-10' }), '2026-10')).toBe('anteriores')
    expect(grupoDoMes(oc({}), '2026-10')).toBe('sem_previsao')
    expect(grupoDoMes(oc({ situacao: 'agendada', data_prevista: '2026-09-01', data_agendada: '2026-10-20T10:00' }), '2026-10')).toBe('agendados')
    expect(grupoDoMes(oc({ situacao: 'realizada', data_realizada: '2026-10-02' }), '2026-10')).toBe('realizados')
    expect(grupoDoMes(oc({ situacao: 'cancelada', data_prevista: '2026-10-10' }), '2026-10')).toBe('fora')
  })
  it('sem previsão nunca aparece como "em dia"', () => {
    expect(indicadorAtraso(oc({}), '2026-10-27')).toEqual({ tipo: 'sem_previsao' })
    expect(indicadorAtraso(oc({ data_prevista: '2026-10-07' }), '2026-10-27')).toEqual({ tipo: 'vencida', dias: 20 })
    expect(indicadorAtraso(oc({ situacao: 'realizada', data_prevista: '2026-10-07' }), '2026-10-27')).toEqual({ tipo: 'nao_se_aplica' })
  })
})

describe('regras auxiliares', () => {
  it('detecta dependência circular entre etapas', () => {
    const g = new Map([
      ['B', ['A']],
      ['C', ['B']],
    ])
    expect(criaCiclo(g, 'A', ['C'])).toBe(true)
    expect(criaCiclo(g, 'D', ['C'])).toBe(false)
  })
  it('quantidades consideram ajustes e nunca ficam negativas', () => {
    expect(resumoQuantidades(4, -1, 2)).toEqual({ contratada: 3, realizadas: 2, restantes: 1 })
    expect(resumoQuantidades(1, 0, 2).restantes).toBe(0)
  })
  it('sugere datas e formata no padrão brasileiro', () => {
    expect(sugerirDatas('2026-11-02', 14, 3)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30'])
    expect(formatarData('2026-11-02')).toBe('02/11/2026')
    expect(inicioDaSemana('2026-11-01')).toBe('2026-10-26')
    expect(somarMeses('2026-01-31', 1)).toMatch(/^2026-0[23]-/)
  })
})
