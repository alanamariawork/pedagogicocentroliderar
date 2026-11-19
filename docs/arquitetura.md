# Arquitetura

## Stack

React 19, TypeScript, Vite 7, Tailwind 4 e ícones lucide-react nas telas. O servidor é um Worker da Cloudflare (nome `pedagogico`) com D1, R2 e zod para validar cada entrada. Ele não tem endereço público: o Worker do backoffice (`sistema`) repassa para ele `/produtos/*`, `/api/ped/*` e `/portal/diamante-business/*`, e ele chama de volta o backoffice para gravar em Clientes.

```
server/              API, banco e regras de negócio
  worker.ts          ponto de entrada do Worker (fetch e o agendamento dos avisos)
  paginas.ts         páginas: confere a sessão antes de abrir /produtos/ ou o portal da aluna
  app.ts, http.ts    API em /api/ped
  bd.ts              acesso ao D1 (transações em lote)
  auth.ts            leitura da sessão do backoffice, perfis e permissões
  integracao.ts      Clientes: ligação com o backoffice (e a imitação local, só para testes)
  servicos.ts        validações, auditoria, escopo por perfil, invariantes
  rotas/             acesso, configuracao, alunas, operacao, pedagogico, portal, avisos
d1/migrations/       migrations do pedagógico (tabela de controle ped_migracoes)
d1/backoffice/       cópia das migrations do backoffice, só para o banco local dos testes
shared/              datas (fuso de São Paulo) e cálculos usados no servidor e na tela
src/                 telas (React), servidas em /produtos/
tests/               testes de aceite, de integração e de cálculo (Vitest, em D1 local)
```

## Login único e identidade

- **Conta e sessão:** são as do backoffice (tabelas `usuario` e `sessao`, cookie `__Host-cl_sessao`). O pedagógico só lê a sessão; entrar, sair e trocar senha são feitos no backoffice.
- **Equipe:** sessão de escopo `equipe` e `membro.perfil_pedagogico` (Administração, Coordenação, Suporte/CS ou Mentora). A administradora do backoffice sem perfil escolhido entra como Administração. Quem não tem perfil recebe “sem acesso”.
- **Aluna:** sessão de escopo `portal` (o login do Portal do backoffice) e a pessoa cadastrada em `ped_alunas`. Ela entra em `/portal/diamante-business/` e não abre nenhuma tela nem rota da equipe.
- **Clientes:** a aluna é uma `pessoa` do backoffice; `ped_alunas` usa o mesmo id e guarda só o que é do pedagógico. Criar ou alterar nome, e-mail, telefone e CPF passa pela regra de Clientes do backoffice (validação, CPF único, auditoria e fila de gravação). Um e-mail já cadastrado em Clientes não gera outro cadastro: a equipe busca e vincula.

## Segurança

- **Sessão:** a do backoffice, num cookie `__Host-` `httpOnly`, com 12 horas de duração. O banco guarda só o hash do token. Senha provisória ou sessão vencida não entram.
- **CSRF:** toda requisição que altera dados precisa do cabeçalho `X-CL-App: 1` (o mesmo do backoffice) e de uma origem do próprio sistema.
- **Permissões:** a matriz perfil × permissão fica no banco e a administração pode editá-la. Cada rota confere a permissão no servidor. Ver, editar, validar e administrar são permissões separadas. O convite do Portal exige, além disso, o papel de administrador no backoffice.
- **Mentora:** só vê matrículas em que atende. A restrição é feita no SQL (`escopoMatriculas`).
- **Aluna:**
  - Só usa `/api/ped/portal`, sempre filtrado pelo próprio `pessoa_id`. As rotas da equipe respondem 403, e as telas da equipe redirecionam para o portal dela.
  - Um registro de outra pessoa responde 404, para não revelar que ele existe.
  - O portal não devolve notas internas nem anotações. O CPF nunca sai do servidor.
- **Perfis:** Administração, Coordenação pedagógica, Suporte/CS, Mentora e Aluna. O Suporte/CS não recebe anotações pedagógicas privadas; o servidor remove esses campos da resposta.
- **ID da aluna:** `ped_alunas.codigo`, sequencial e único, atribuído na primeira matrícula. A renovação mantém o ID. As listas são ordenadas por ele.
- **Cabeçalhos de segurança e auditoria:** a API e as páginas enviam cabeçalhos de segurança e `Cache-Control: no-store`. Cada alteração vai para `ped_auditoria` com o autor e a data; as alterações em Clientes ficam também na auditoria do backoffice.

## Modelo de dados (principais)

- `pessoas` 1—N `matriculas`: a pessoa é separada da matrícula, e cada renovação é uma nova matrícula ligada à anterior (`matricula_anterior_id`).
- `matriculas` 1—N `itens_contratados`: os itens são uma **cópia** do modelo de pacote.
- `itens_contratados` 1—N `ocorrencias`: uma ocorrência por encontro devido.
  - O número de ocorrências não canceladas é sempre igual à quantidade contratada mais os ajustes (`sincronizarOcorrencias`).
  - A quantidade só muda via `ajustes_obrigacao`: ajuste, exceção, transferência ou cancelamento.
- `ocorrencias` 1—N `ocorrencia_historico`, `contatos` e `impedimentos`, e 0—1 `reservas` ativa.
- `reservas`: uma trigger do banco impede duas reservas ativas sobrepostas para a mesma profissional. O agendamento roda em transação imediata.
- `trilhas`, `pilares`, `etapas` e `etapa_prerequisitos` formam o modelo. `jornadas`, `jornada_etapas`, `atividades`, `evidencias` e `validacoes` formam o progresso individual. `anexos` guarda os arquivos de cada envio (BLOB no próprio banco). O upload é feito antes do envio, ainda solto, e só fica visível depois de vinculado à evidência. A aluna baixa só os próprios arquivos (`/api/portal/anexos/:id`); a equipe baixa com `jornada:ver` e respeitando o escopo da mentora (`/api/anexos/:id`). O download sai como `attachment` com CSP `sandbox`.
- `conquistas`, `pausas`, `feedbacks`, `anotacoes`, `decisoes_pendentes` e `auditoria`.
- `turmas` 1—N `matriculas` (`turma_id`). A coluna antiga `matriculas.turma` (texto livre) foi mantida; cada valor distinto virou uma turma na migração 2.
- `diagnosticos`: uma linha por matrícula, versão (`inicio` ou `fim`) e área (`situacao`, `objetivos`, `desafios`, `expectativas`). As perguntas ficam em `shared/diagnostico.ts`. A versão de fim abre 30 dias antes do fim da vigência ou quando a matrícula é encerrada.
- `metas`: valor inicial, alvo e atual. O portal sempre mostra os três valores, nunca um percentual solto. Excluir só desativa (`ativo = 0`).
- `frases` e `links`: cadastros da equipe em Configurações. Links com `destaque_inicio` aparecem nos Atalhos do Início da aluna.
- `notificacoes`: avisos internos por usuário (sino do portal). São gerados no servidor quando a equipe agenda, reagenda ou desmarca um encontro, libera ou conclui uma etapa, valida ou pede ajuste numa atividade, e torna visível uma vitória. Nenhum aviso sai do sistema.

### Migrações

As mudanças de banco entram só por migrations em `d1/migrations/`, controladas na tabela `ped_migracoes` (separada da tabela de migrations do backoffice). Uma migration publicada nunca é editada: mudança nova entra como arquivo novo. A `0001_ped_esquema.sql` cria todas as tabelas `ped_` e não altera nenhuma tabela do backoffice; ela depende da migration `0017_perfil_pedagogico.sql` do backoffice (coluna `membro.perfil_pedagogico`).

Nos nomes abaixo, as tabelas do pedagógico levam o prefixo `ped_` (por exemplo, `pessoas` é a visão `ped_pessoas`, que junta `pessoa` de Clientes com `ped_alunas`).

As datas são gravadas como `AAAA-MM-DD`, os horários de agenda como `AAAA-MM-DDTHH:MM` (hora local de São Paulo) e os carimbos de auditoria em ISO UTC.

## Onde cada regra está

| Regra | Implementação |
|---|---|
| RN01 Pessoa ≠ matrícula | tabelas `pessoas`/`matriculas`; renovação = nova matrícula |
| RN02 Entregáveis pertencem à matrícula | `itens_contratados.matricula_id` |
| RN03 Pacote é copiado | `POST /matriculas` copia `pacote_itens`; editar pacote não altera itens |
| RN04 Renovação = novo ciclo; transferência explícita | `POST /matriculas/:id/transferencias` (ajustes vinculados de saída/entrada) |
| RN05 Trilha e pilar separados | `jornadas.trilha_id` / `jornadas.pilar_id`, cadastros próprios |
| RN06 Pendência não bloqueia encontro | agendar não consulta atividades (CA05) |
| RN07/RN08 Cadeado ≠ "Não incluído no contrato" | `SeloCadeado` × `SeloNaoIncluido`; portal calcula `nao_incluidos` pelo contrato |
| RN09 Avanço exige validação humana; exceção com justificativa | `jornada:validar`; `/concluir` com exceção exige justificativa |
| RN10 Previsões explícitas e revisáveis | `PUT /itens/:id/previsoes` (motivo ao alterar); sugestão só na tela |
| RN11 Reagendamento preserva histórico | `ocorrencia_historico` com data anterior, motivo e autor |
| RN12 Pausa não muda prazos sozinha | `pausas.decisao_prazos = 'pendente'` até decisão explícita |
| RN13 Equipe registra atividade feita pela aluna | `POST /atividades/:id/evidencias` (`registrada_por_equipe`) |
| RN14 Contrato e onboarding separados | campos `contrato_*` e `onboarding_*` com rotas próprias |
| RN15 "Sem prazo definido" | portal e ficha exibem quando não há prazo individual |
| RN16 Cancelamento preserva registros | `/finalizar` só muda situação; nada é apagado |
| Carteira (perfil sem "ver todas") | sem `alunas:todas`, `escopoMatriculas` limita às alunas com `pessoas.responsavel_id` = usuário; vale para lista, ficha, agenda, jornada e painéis |
| Status acompanha a matrícula | `sincronizarStatusAluna` ao criar matrícula, pausar, retomar, encerrar ou cancelar |
| Aluna só vê e edita os próprios dados | rotas `/portal/*` usam só `req.usuario.pessoa_id`; nenhuma recebe ID de aluna |
