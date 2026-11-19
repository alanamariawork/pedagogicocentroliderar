// Uso único (histórico): gera d1/migrations/0001_ped_esquema.sql a partir do esquema SQLite anterior.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { OPCOES_INICIAIS, CAMPOS_ALUNA } from '../shared/listas'
import { PERFIS, PERMISSOES_PADRAO } from '../shared/permissoes'

const fonte = readFileSync(process.argv[2], 'utf8')
const TABELAS = 'perfil_permissoes configuracoes programas profissionais tipos_entregavel motivos_impedimento pacotes pacote_itens pessoas matriculas itens_contratados ajustes_obrigacao ocorrencias ocorrencia_historico disponibilidades reservas contatos impedimentos trilhas pilares etapas etapa_prerequisitos etapa_atividades_modelo jornadas jornada_etapas atividades evidencias anexos validacoes conquistas pausas feedbacks anotacoes decisoes_pendentes auditoria turmas diagnosticos metas frases links notificacoes opcoes_lista campos_visibilidade avisos_programados'.split(' ')
const nome = (t: string) => (t === 'pessoas' ? 'ped_alunas' : 'ped_' + t)

let blocos = fonte.split(/;\n\n/).map((b) => b.trim()).filter(Boolean)
blocos = blocos.filter((b) => !/CREATE TABLE (usuarios|sessoes|versao_esquema) /.test(b))
let sql = blocos.map((b) => b.replace(/;$/, '') + ';').join('\n\n')
sql = sql.replace(/REFERENCES usuarios\(id\)/g, 'REFERENCES usuario(id)')
const re = new RegExp(`\\b(TABLE|REFERENCES|ON|INTO|FROM|JOIN|UPDATE|EXISTS \\(SELECT 1 FROM)\\s+(${TABELAS.join('|')})\\b`, 'g')
sql = sql.replace(re, (_m, kw, t) => `${kw} ${nome(t)}`)
sql = sql.replace(/\b(ix_|ux_|tg_)/g, 'ped_$1')
const agora = '2026-11-09T00:00:00.000Z'
const esc = (s: string) => `'${s.replace(/'/g, "''")}'`
const ordem: Record<string, number> = {}
const inserts: string[] = []
for (const o of OPCOES_INICIAIS) {
  ordem[o.lista] = (ordem[o.lista] ?? 0) + 1
  inserts.push(`INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES (${esc(randomUUID())}, ${esc(o.lista)}, ${esc(o.codigo!)}, ${esc(o.nome)}, ${esc(o.cor)}, ${ordem[o.lista]}, ${esc(agora)}, ${esc(agora)});`)
}
for (const c of CAMPOS_ALUNA) inserts.push(`INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES (${esc(c.campo)}, ${c.padrao ? 1 : 0}, ${esc(agora)});`)
for (const perfil of PERFIS) for (const p of PERMISSOES_PADRAO[perfil]) inserts.push(`INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES (${esc(perfil)}, ${esc(p)});`)
writeFileSync(process.argv[3], sql + '\n\n' + inserts.join('\n') + '\n')
