import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { CAMPOS_ALUNA, OPCOES_INICIAIS, codigoStatusPelaMatricula } from '../shared/listas'

export type BD = Database.Database

/**
 * Esquema do banco. Regras gerais:
 * - Toda chave é um identificador estável (UUID). Nome nunca é chave.
 * - Datas sem horário: 'AAAA-MM-DD'. Horários de agenda: 'AAAA-MM-DDTHH:MM' no fuso
 *   America/Sao_Paulo (sem horário de verão desde 2019). Carimbos de auditoria: ISO UTC.
 * - Nada é apagado fisicamente quando há histórico: usa-se situação/ativo.
 */
const ESQUEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin','coordenacao','suporte','mentora','comercial','aluna')),
  pessoa_id TEXT REFERENCES pessoas(id),
  profissional_id TEXT REFERENCES profissionais(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS perfil_permissoes (
  perfil TEXT NOT NULL,
  permissao TEXT NOT NULL,
  PRIMARY KEY (perfil, permissao)
);
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS programas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS profissionais (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, especialidade TEXT, contato TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS tipos_entregavel (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, duracao_padrao_min INTEGER,
  individual INTEGER NOT NULL DEFAULT 1, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS motivos_impedimento (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, exige_descricao INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS pacotes (
  id TEXT PRIMARY KEY, programa_id TEXT REFERENCES programas(id), nome TEXT NOT NULL, descricao TEXT,
  duracao_meses INTEGER, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS pacote_itens (
  id TEXT PRIMARY KEY, pacote_id TEXT NOT NULL REFERENCES pacotes(id),
  tipo_id TEXT REFERENCES tipos_entregavel(id), descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  profissional_id TEXT REFERENCES profissionais(id), especialidade TEXT,
  duracao_min INTEGER, origem TEXT NOT NULL DEFAULT 'pacote' CHECK (origem IN ('pacote','bonus')),
  observacoes TEXT, ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pessoas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT, telefone TEXT, cidade TEXT,
  observacao_operacional TEXT, demonstracao INTEGER NOT NULL DEFAULT 0, fonte TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS matriculas (
  id TEXT PRIMARY KEY,
  pessoa_id TEXT NOT NULL REFERENCES pessoas(id),
  programa_id TEXT REFERENCES programas(id),
  matricula_anterior_id TEXT REFERENCES matriculas(id),
  turma TEXT,
  data_inicio TEXT, data_fim TEXT,
  situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','pausada','encerrada','cancelada')),
  contrato_situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (contrato_situacao IN ('pendente','enviado','assinado')),
  contrato_link TEXT,
  fonte_comercial TEXT, condicoes_comerciais TEXT,
  responsavel_id TEXT REFERENCES usuarios(id),
  mentora_id TEXT REFERENCES profissionais(id),
  pacote_origem_id TEXT REFERENCES pacotes(id), pacote_origem_nome TEXT,
  conferencia_comercial TEXT NOT NULL DEFAULT 'pendente' CHECK (conferencia_comercial IN ('pendente','conferida')),
  conferida_por TEXT, conferida_em TEXT,
  onboarding_situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (onboarding_situacao IN ('pendente','agendado','realizado')),
  onboarding_data TEXT, onboarding_responsavel_id TEXT REFERENCES usuarios(id),
  onboarding_checklist TEXT, onboarding_pendencias TEXT, proximo_passo TEXT,
  encerramento_data TEXT, encerramento_motivo TEXT,
  interesse_renovacao TEXT,
  demonstracao INTEGER NOT NULL DEFAULT 0, fonte TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_matriculas_pessoa ON matriculas(pessoa_id);

CREATE TABLE IF NOT EXISTS itens_contratados (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  tipo_id TEXT REFERENCES tipos_entregavel(id),
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  profissional_id TEXT REFERENCES profissionais(id), especialidade TEXT,
  duracao_min INTEGER,
  origem TEXT NOT NULL CHECK (origem IN ('pacote','bonus','ajuste')),
  referencia_comercial TEXT, observacoes TEXT,
  pacote_item_origem_id TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_itens_matricula ON itens_contratados(matricula_id);

-- Ajustes de obrigação: única forma de mudar a quantidade devida depois do cadastro.
CREATE TABLE IF NOT EXISTS ajustes_obrigacao (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES itens_contratados(id),
  delta INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ajuste','excecao','transferencia_saida','transferencia_entrada','cancelamento')),
  motivo TEXT NOT NULL,
  item_relacionado_id TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES itens_contratados(id),
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  numero INTEGER NOT NULL,
  data_prevista TEXT, data_prevista_original TEXT,
  data_agendada TEXT,
  data_realizada TEXT,
  duracao_min INTEGER,
  profissional_id TEXT REFERENCES profissionais(id),
  situacao TEXT NOT NULL DEFAULT 'prevista'
    CHECK (situacao IN ('prevista','aguardando_agenda','disponivel_agendar','agendada','realizada','cancelada','conferencia')),
  cancelamento_motivo TEXT,
  resumo_compartilhavel TEXT,
  notas_internas TEXT,
  responsavel_resolucao_id TEXT REFERENCES usuarios(id),
  valor_original TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_ocorrencias_matricula ON ocorrencias(matricula_id);
CREATE INDEX IF NOT EXISTS ix_ocorrencias_item ON ocorrencias(item_id);

CREATE TABLE IF NOT EXISTS ocorrencia_historico (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL REFERENCES ocorrencias(id),
  tipo TEXT NOT NULL,
  valor_anterior TEXT, valor_novo TEXT,
  previsao_original TEXT,
  motivo TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disponibilidades (
  id TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES profissionais(id),
  inicio TEXT NOT NULL, fim TEXT NOT NULL,
  observacao TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT,
  CHECK (fim > inicio)
);

CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES profissionais(id),
  ocorrencia_id TEXT NOT NULL REFERENCES ocorrencias(id),
  inicio TEXT NOT NULL, fim TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1,
  fora_disponibilidade INTEGER NOT NULL DEFAULT 0,
  liberada_em TEXT, liberada_motivo TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT,
  CHECK (fim > inicio)
);
-- Garantia no próprio banco: duas reservas ativas da mesma profissional não se sobrepõem.
CREATE TRIGGER IF NOT EXISTS tg_reserva_sem_sobreposicao
BEFORE INSERT ON reservas WHEN NEW.ativa = 1
BEGIN
  SELECT RAISE(ABORT, 'conflito_horario') WHERE EXISTS (
    SELECT 1 FROM reservas r WHERE r.profissional_id = NEW.profissional_id AND r.ativa = 1
      AND r.inicio < NEW.fim AND r.fim > NEW.inicio);
  SELECT RAISE(ABORT, 'ocorrencia_ja_reservada') WHERE EXISTS (
    SELECT 1 FROM reservas r WHERE r.ocorrencia_id = NEW.ocorrencia_id AND r.ativa = 1);
END;

CREATE TABLE IF NOT EXISTS contatos (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  ocorrencia_id TEXT REFERENCES ocorrencias(id),
  data TEXT NOT NULL, canal TEXT NOT NULL,
  responsavel_id TEXT REFERENCES usuarios(id),
  resumo TEXT, resultado TEXT, proxima_acao TEXT, proxima_tentativa TEXT,
  link_externo TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS impedimentos (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL REFERENCES ocorrencias(id),
  motivo_id TEXT REFERENCES motivos_impedimento(id),
  descricao TEXT,
  responsavel_id TEXT REFERENCES usuarios(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  resolvido_em TEXT, resolucao TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS trilhas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS pilares (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS etapas (
  id TEXT PRIMARY KEY,
  trilha_id TEXT NOT NULL REFERENCES trilhas(id),
  pilar_id TEXT REFERENCES pilares(id),
  titulo TEXT NOT NULL, objetivo TEXT, criterio_conclusao TEXT,
  links TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS etapa_prerequisitos (
  etapa_id TEXT NOT NULL REFERENCES etapas(id),
  requer_etapa_id TEXT NOT NULL REFERENCES etapas(id),
  PRIMARY KEY (etapa_id, requer_etapa_id),
  CHECK (etapa_id <> requer_etapa_id)
);
CREATE TABLE IF NOT EXISTS etapa_atividades_modelo (
  id TEXT PRIMARY KEY, etapa_id TEXT NOT NULL REFERENCES etapas(id),
  titulo TEXT NOT NULL, descricao TEXT, link TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS jornadas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL UNIQUE REFERENCES matriculas(id),
  trilha_id TEXT REFERENCES trilhas(id),
  pilar_id TEXT REFERENCES pilares(id),
  diagnostico_operacional TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS jornada_etapas (
  id TEXT PRIMARY KEY,
  jornada_id TEXT NOT NULL REFERENCES jornadas(id),
  etapa_id TEXT NOT NULL REFERENCES etapas(id),
  situacao TEXT NOT NULL DEFAULT 'bloqueada' CHECK (situacao IN ('bloqueada','liberada','concluida')),
  prazo_individual TEXT,
  validador_id TEXT REFERENCES usuarios(id),
  liberada_em TEXT, liberada_por TEXT,
  concluida_em TEXT, concluida_por TEXT,
  UNIQUE (jornada_id, etapa_id)
);
CREATE TABLE IF NOT EXISTS atividades (
  id TEXT PRIMARY KEY,
  jornada_etapa_id TEXT NOT NULL REFERENCES jornada_etapas(id),
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  modelo_id TEXT,
  titulo TEXT NOT NULL, descricao TEXT, link TEXT,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','em_execucao','enviada','validada','em_revisao')),
  prazo TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE TABLE IF NOT EXISTS evidencias (
  id TEXT PRIMARY KEY,
  atividade_id TEXT NOT NULL REFERENCES atividades(id),
  texto TEXT, link TEXT, data_execucao TEXT,
  registrada_por_equipe INTEGER NOT NULL DEFAULT 0,
  autor_id TEXT, criado_em TEXT NOT NULL
);
-- Arquivos anexados ao envio de uma atividade. Ficam no próprio banco (BLOB): o backup do
-- arquivo .db leva junto os anexos. evidencia_id fica nulo até o envio ser concluído.
CREATE TABLE IF NOT EXISTS anexos (
  id TEXT PRIMARY KEY,
  atividade_id TEXT NOT NULL REFERENCES atividades(id),
  evidencia_id TEXT REFERENCES evidencias(id),
  nome TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL,
  conteudo BLOB NOT NULL,
  autor_id TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_anexos_evidencia ON anexos(evidencia_id);
CREATE TABLE IF NOT EXISTS validacoes (
  id TEXT PRIMARY KEY,
  alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('atividade','etapa_liberacao','etapa_conclusao','conquista')),
  alvo_id TEXT NOT NULL,
  matricula_id TEXT,
  decisao TEXT NOT NULL,
  comentario TEXT,
  excecao INTEGER NOT NULL DEFAULT 0,
  justificativa TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conquistas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  titulo TEXT NOT NULL,
  situacao_anterior TEXT, acao_aplicada TEXT, evidencia TEXT, resultado_percebido TEXT,
  data TEXT NOT NULL,
  validada INTEGER NOT NULL DEFAULT 0, validada_por TEXT, validada_em TEXT,
  visivel_aluna INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS pausas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  inicio TEXT NOT NULL, fim TEXT,
  motivo TEXT NOT NULL,
  decisao_prazos TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao_prazos IN ('pendente','manter','estender')),
  dias_extensao INTEGER, mover_previsoes INTEGER NOT NULL DEFAULT 0,
  decisao_justificativa TEXT, decidido_por TEXT, decidido_em TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  data TEXT NOT NULL, responsavel_id TEXT REFERENCES usuarios(id),
  feedback TEXT NOT NULL, acao_acompanhamento TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS anotacoes (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES matriculas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('operacional','pedagogica')),
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS decisoes_pendentes (
  id TEXT PRIMARY KEY,
  questao TEXT NOT NULL, impacto TEXT, responsavel TEXT,
  situacao TEXT NOT NULL DEFAULT 'aberta' CHECK (situacao IN ('aberta','em_analise','decidida')),
  decisao TEXT, data_decisao TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL, entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  pessoa_id TEXT, matricula_id TEXT,
  dados TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auditoria_matricula ON auditoria(matricula_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_pessoa ON auditoria(pessoa_id);
`

export function abrirBanco(caminho = process.env.DB_PATH ?? 'data/diamante-business.db'): BD {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true })
  const db = new Database(caminho)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(ESQUEMA)
  migrar(db)
  return db
}

/**
 * Migrações numeradas, só de acréscimo (nunca apagam coluna nem dado). Cada uma roda uma única vez,
 * na ordem, e a versão aplicada fica em `versao_esquema`. A 1 reúne os ajustes feitos antes desta tabela
 * existir e pode rodar de novo sem efeito.
 */
const MIGRACOES: { versao: number; descricao: string; aplicar: (db: BD) => void }[] = [
  {
    versao: 1,
    descricao: 'ID sequencial da aluna e remoção do perfil Comercial',
    aplicar(db) {
      const colunas = db.prepare("SELECT name FROM pragma_table_info('pessoas')").all() as { name: string }[]
      if (!colunas.some((c) => c.name === 'codigo')) {
        db.exec('ALTER TABLE pessoas ADD COLUMN codigo INTEGER')
        // ID da aluna = ordem de matrícula (primeira matrícula registrada).
        const ordem = db
          .prepare('SELECT p.id FROM pessoas p JOIN matriculas m ON m.pessoa_id = p.id GROUP BY p.id ORDER BY MIN(m.criado_em), p.criado_em')
          .all() as { id: string }[]
        const up = db.prepare('UPDATE pessoas SET codigo = ? WHERE id = ?')
        ordem.forEach((p, n) => up.run(n + 1, p.id))
      }
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_pessoas_codigo ON pessoas(codigo)')
      // O perfil Comercial deixou de existir: acessos antigos ficam desativados (o histórico é preservado).
      db.exec("UPDATE usuarios SET ativo = 0 WHERE perfil = 'comercial' AND ativo = 1")
      db.exec("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE perfil = 'comercial')")
      db.exec("DELETE FROM perfil_permissoes WHERE perfil = 'comercial'")
    },
  },
  {
    versao: 2,
    descricao: 'Portal da aluna, fase 1: turmas, redes sociais, boas-vindas, diagnóstico, metas, frases, links e avisos',
    aplicar(db) {
      db.exec(/* sql */ `
        CREATE TABLE turmas (
          id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, data_inicio TEXT,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );
        ALTER TABLE matriculas ADD COLUMN turma_id TEXT REFERENCES turmas(id);
        ALTER TABLE matriculas ADD COLUMN data_boas_vindas TEXT;
        ALTER TABLE pessoas ADD COLUMN instagram TEXT;
        ALTER TABLE pessoas ADD COLUMN linkedin TEXT;
        ALTER TABLE pessoas ADD COLUMN site TEXT;
        -- Diagnóstico: uma linha por área e versão (início ou fim do ciclo); conteudo = JSON {pergunta: resposta}.
        CREATE TABLE diagnosticos (
          id TEXT PRIMARY KEY,
          matricula_id TEXT NOT NULL REFERENCES matriculas(id),
          versao TEXT NOT NULL CHECK (versao IN ('inicio','fim')),
          area TEXT NOT NULL CHECK (area IN ('situacao','objetivos','desafios','expectativas')),
          conteudo TEXT NOT NULL,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
          UNIQUE (matricula_id, versao, area)
        );
        -- Metas do diagnóstico: sempre com valor inicial, alvo e atual (o progresso mostra o denominador).
        CREATE TABLE metas (
          id TEXT PRIMARY KEY,
          matricula_id TEXT NOT NULL REFERENCES matriculas(id),
          nome TEXT NOT NULL, unidade TEXT,
          valor_inicial REAL NOT NULL, valor_alvo REAL NOT NULL, valor_atual REAL,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );
        CREATE INDEX ix_metas_matricula ON metas(matricula_id);
        CREATE TABLE frases (
          id TEXT PRIMARY KEY, texto TEXT NOT NULL, autoria TEXT,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );
        CREATE TABLE links (
          id TEXT PRIMARY KEY, titulo TEXT NOT NULL, url TEXT NOT NULL, categoria TEXT, descricao TEXT,
          destaque_inicio INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );
        -- Avisos do sino: só dentro do sistema; nada é enviado por e-mail ou WhatsApp.
        CREATE TABLE notificacoes (
          id TEXT PRIMARY KEY,
          usuario_id TEXT NOT NULL REFERENCES usuarios(id),
          titulo TEXT NOT NULL, detalhe TEXT, link TEXT,
          lida_em TEXT, criado_em TEXT NOT NULL
        );
        CREATE INDEX ix_notificacoes_usuario ON notificacoes(usuario_id, criado_em);
      `)
      // A turma era um texto livre na matrícula: cada nome diferente vira uma turma cadastrada.
      // A coluna antiga continua no banco, sem uso pelas telas.
      const nomes = db.prepare("SELECT DISTINCT TRIM(turma) AS nome FROM matriculas WHERE TRIM(COALESCE(turma, '')) <> ''").all() as { nome: string }[]
      const agora = new Date().toISOString()
      for (const { nome } of nomes) {
        const id = randomUUID()
        db.prepare('INSERT INTO turmas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)').run(id, nome, agora, agora)
        db.prepare('UPDATE matriculas SET turma_id = ? WHERE TRIM(turma) = ?').run(id, nome)
      }
    },
  },
  {
    versao: 3,
    descricao: 'Administrativo, fase 1: listas configuráveis, estado da aluna, canal de venda e campos visíveis à aluna',
    aplicar(db) {
      db.exec(/* sql */ `
        CREATE TABLE opcoes_lista (
          id TEXT PRIMARY KEY,
          lista TEXT NOT NULL,
          codigo TEXT,
          nome TEXT NOT NULL,
          cor TEXT NOT NULL DEFAULT 'neutro',
          ordem INTEGER NOT NULL DEFAULT 0,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
          UNIQUE (lista, codigo)
        );
        CREATE INDEX ix_opcoes_lista ON opcoes_lista(lista, ordem);
        ALTER TABLE pessoas ADD COLUMN empresa TEXT;
        ALTER TABLE pessoas ADD COLUMN segmento_id TEXT REFERENCES opcoes_lista(id);
        ALTER TABLE pessoas ADD COLUMN subsegmento TEXT;
        ALTER TABLE pessoas ADD COLUMN responsavel_id TEXT REFERENCES usuarios(id);
        ALTER TABLE pessoas ADD COLUMN data_entrada TEXT;
        ALTER TABLE pessoas ADD COLUMN status_id TEXT REFERENCES opcoes_lista(id);
        ALTER TABLE pessoas ADD COLUMN saude_id TEXT REFERENCES opcoes_lista(id);
        ALTER TABLE pessoas ADD COLUMN engajamento_id TEXT REFERENCES opcoes_lista(id);
        ALTER TABLE pessoas ADD COLUMN em_risco INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE matriculas ADD COLUMN canal_venda_id TEXT REFERENCES opcoes_lista(id);
        CREATE TABLE campos_visibilidade (
          campo TEXT PRIMARY KEY,
          visivel_aluna INTEGER NOT NULL DEFAULT 0,
          atualizado_em TEXT NOT NULL, autor_id TEXT
        );
      `)
      const agora = new Date().toISOString()
      const ins = db.prepare('INSERT INTO opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)')
      const ordem: Record<string, number> = {}
      for (const o of OPCOES_INICIAIS) {
        ordem[o.lista] = (ordem[o.lista] ?? 0) + 1
        ins.run(randomUUID(), o.lista, o.codigo, o.nome, o.cor, ordem[o.lista], agora, agora)
      }
      const insCampo = db.prepare('INSERT INTO campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES (?,?,?)')
      for (const c of CAMPOS_ALUNA) insCampo.run(c.campo, c.padrao ? 1 : 0, agora)

      // Estado inicial de cada aluna, a partir da matrícula mais recente: status, responsável e data de entrada.
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
      const idStatus = (codigo: string) => (db.prepare("SELECT id FROM opcoes_lista WHERE lista = 'status_aluna' AND codigo = ?").get(codigo) as { id: string }).id
      const pessoas = db.prepare('SELECT id FROM pessoas').all() as { id: string }[]
      for (const p of pessoas) {
        const m = db
          .prepare('SELECT situacao, data_inicio, responsavel_id FROM matriculas WHERE pessoa_id = ? ORDER BY data_inicio DESC, criado_em DESC LIMIT 1')
          .get(p.id) as { situacao: string; data_inicio: string; responsavel_id: string | null } | undefined
        if (!m) continue
        const entrada = (db.prepare('SELECT MIN(data_inicio) AS d FROM matriculas WHERE pessoa_id = ?').get(p.id) as { d: string }).d
        db.prepare('UPDATE pessoas SET status_id = ?, responsavel_id = ?, data_entrada = ? WHERE id = ?').run(
          idStatus(codigoStatusPelaMatricula(m.situacao, m.data_inicio, hoje)), m.responsavel_id, entrada, p.id)
      }

      // Nova permissão: ver todas as alunas. Sem ela, o perfil vê só a própria carteira.
      // Num banco que já tem regras gravadas, Administração, Coordenação e Suporte/CS continuam vendo tudo.
      const temRegras = (db.prepare('SELECT COUNT(*) AS n FROM perfil_permissoes').get() as { n: number }).n > 0
      if (temRegras) for (const perfil of ['admin', 'coordenacao', 'suporte']) db.prepare("INSERT OR IGNORE INTO perfil_permissoes (perfil, permissao) VALUES (?, 'alunas:todas')").run(perfil)
    },
  },
]

function migrar(db: BD) {
  db.exec('CREATE TABLE IF NOT EXISTS versao_esquema (versao INTEGER PRIMARY KEY, descricao TEXT NOT NULL, aplicada_em TEXT NOT NULL)')
  const atual = (db.prepare('SELECT COALESCE(MAX(versao), 0) AS v FROM versao_esquema').get() as { v: number }).v
  for (const m of MIGRACOES.filter((x) => x.versao > atual)) {
    db.transaction(() => {
      m.aplicar(db)
      db.prepare('INSERT INTO versao_esquema (versao, descricao, aplicada_em) VALUES (?, ?, ?)').run(m.versao, m.descricao, new Date().toISOString())
    })()
  }
}

export const novoId = () => randomUUID()
export const agoraIso = () => new Date().toISOString()
