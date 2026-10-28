# Arquitetura

## Stack

É a mesma base visual e técnica do sistema de marketing: React 19, TypeScript, Vite 7, Tailwind 4 e ícones lucide-react. O servidor usa Express 5, SQLite (better-sqlite3, em modo WAL e com chaves estrangeiras) e zod para validar cada entrada.

```
server/            API, banco e regras de negócio
  db.ts            esquema SQLite (criado/atualizado ao abrir)
  auth.ts          senhas (scrypt), sessões, permissões
  servicos.ts      validações, auditoria, escopo por perfil, invariantes
  rotas/           acesso, configuracao, alunas, operacao, pedagogico, portal
  demo.ts, seed.ts demonstração fictícia criada pela própria API
shared/            datas (fuso de São Paulo) e cálculos usados no servidor e na tela
src/               telas (React)
tests/             testes de aceite e de cálculo (Vitest)
```

## Segurança

- **Senhas:** guardadas com hash scrypt e sal, com no mínimo 10 caracteres, letras e números. O login tem limite de tentativas.
- **Sessão:** usa um token aleatório num cookie `httpOnly` e `SameSite=Lax`, que dura 12 horas. O banco guarda só o hash do token. Trocar senha, perfil ou desativar o usuário encerra as sessões abertas.
- **CSRF:** toda requisição que altera dados precisa do cabeçalho `X-Requested-With: diamante-business`.
- **Permissões:** a matriz perfil × permissão fica no banco e a administração pode editá-la. Cada rota confere a permissão no servidor. Ver, editar, validar e administrar são permissões separadas.
- **Mentora:** só vê matrículas em que atende. A restrição é feita no SQL (`escopoMatriculas`).
- **Aluna:**
  - Só usa `/api/portal`, sempre filtrado pelo próprio `pessoa_id`.
  - Um registro de outra pessoa responde 404, para não revelar que ele existe.
  - O portal não devolve notas internas nem anotações.
- **Perfis:** Administração, Coordenação pedagógica, Suporte/CS, Mentora e Aluna. O Suporte/CS não recebe anotações pedagógicas privadas; o servidor remove esses campos da resposta. Usuários antigos com o perfil Comercial são desativados na migração.
- **ID da aluna:** `pessoas.codigo`, sequencial e único, atribuído na primeira matrícula (ordem em que a matrícula foi registrada). A renovação mantém o ID. As listas são ordenadas por ele.
- **Cabeçalhos de segurança e auditoria:** a API envia cabeçalhos de segurança e `Cache-Control: no-store`. Cada alteração vai para a tabela `auditoria` com o autor e a data.

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
