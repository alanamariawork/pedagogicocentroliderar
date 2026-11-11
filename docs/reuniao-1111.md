# Ajustes da reunião de 11/11/2026

Tudo abaixo está no código do backoffice (aba Pedagógico) e no Portal da Aluna (`/portal/diamante-business/`). A migration nova é `0002_ped_ajustes_reuniao_1111.sql`: só acrescenta colunas, tabelas e configurações, sem apagar nada.

## Telas que mudaram

**Portal da Aluna**
- **Início:** card “Resumo da minha jornada” (programa, etapa atual com a cor do pilar e o prazo da etapa ou “Sem prazo definido”, próximo encontro, vigência). A vigência fica em destaque dourado quando faltam 45 dias ou menos (46 dias não destaca). Card “Avisos” no lugar de “Meu nível”. Mentorias realizadas mostram “de N contratado(s)”.
- **Menu e busca:** saíram Tarefas e Plano 90 dias (menu, atalhos e busca). Entrou Livros, em Aprendizado. Agenda virou “Minha Agenda”.
- **Mentorias:** saldo por tipo (contratados, realizados, agendados, disponíveis), botão “Marcar horário” com os horários livres da profissional, Remarcar e Desmarcar. Pendências de atividades nunca bloqueiam a marcação.
- **Minha Agenda:** os mesmos encontros que a equipe vê.
- **Trilhas:** por nível pedagógico (etapas agrupadas por pilar, “Você está em” e o que falta), sem pontos.
- **Plano de Ação:** só ações publicadas pela equipe; a aluna marca o andamento.
- **Vitórias:** “Adicionar uma vitória”, que entra como “aguardando análise”.
- **Depoimentos:** um por encontro realizado (editável, nunca duplicado).
- **Rotina, Biblioteca (com a categoria Ferramentas) e Livros:** só o que a equipe publicou; vídeo do Vimeo embutido; livros só com link de compra.
- **Mural:** título, descrição, autoria e o canal de contato escolhido; regra de moderação configurável.

**Equipe**
- **Alunas e matrículas:** KPI “Terminam em N dias” usando a janela configurada; botão “WhatsApp (manual)”.
- **Entregas do mês e Capacidade e agenda:** selo “Agendado — confirmação pendente” e a ação “Confirmações”, com o estado de cada canal e “Tentar novamente” (sem duplicar).
- **Ficha › Jornada:** “Adaptar para esta aluna” (prazo, validador, título e objetivo próprios) e “Retirar desta matrícula”, com quem mudou e quando. Só aquela matrícula muda.
- **Ficha › Plano de Ação (aba nova):** ações em rascunho → revisão → publicação; colar a transcrição de um encontro (área restrita) e gerar sugestões; depoimentos da aluna.
- **Ficha › Programa › Contrato:** enviar o PDF, ler o texto, conferir campo a campo (com o trecho de onde saiu e as divergências lado a lado), corrigir e aplicar. Reprocessar o mesmo arquivo não duplica itens. Fica registrado quem confirmou.
- **Conteúdos e mural (página nova):** cadastro e publicação de Rotina, Biblioteca e Livros; moderação do Mural.
- **Configurações:** e-mail da agenda de cada profissional; Parâmetros com antecedência mínima da agenda, dias à frente, regra de publicação e de visibilidade do Mural.
- **Trilhas e etapas:** cor de cada pilar (automática: Ação vinho, Gestão dourado, Escala verde).

## O que depende de configuração externa

Nenhuma mensagem é enviada sem estas configurações. Sem elas, a tela de confirmações diz exatamente qual item falta.

| Canal | Segredos (`npx wrangler secret put NOME`) | Observação |
|---|---|---|
| WhatsApp (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_MODELO_CONFIRMAR`, `WHATSAPP_MODELO_ATUALIZAR`, `WHATSAPP_MODELO_CANCELAR`, `WHATSAPP_IDIOMA` (opcional, padrão `pt_BR`) | Os três modelos precisam estar aprovados na Meta. A aluna precisa de telefone válido no cadastro. |
| Google Agenda | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_AGIR_COMO_MENTORA` (opcional, valor `1` para usar delegação no Workspace) | Conta de serviço com acesso à agenda de cada mentora (compartilhada com ela, ou delegação no Workspace). A mentora precisa de e-mail em Configurações › Profissionais ou na conta vinculada. |

## Decisões da coordenação ainda em aberto

Seis questões novas estão em “Decisões pendentes”: qual presença acompanhar e como comprovar (hoje só aparece em relatório), quem revisa e publica o Plano de Ação, as regras do Mural, quem recebe as confirmações por WhatsApp e Google Agenda, o que significa “visualização do prazo” e o e-commerce dos livros (hoje é só link de compra). Além delas: a privacidade dos vídeos no Vimeo (configurada no próprio Vimeo) e o texto oficial do “Dia Extraordinário da Mulher que Age”, que a coordenação precisa publicar em Conteúdos e mural. Até lá, a Rotina mostra que está em preparação.

## Limites desta versão

- Transcrição automática não foi feita: a equipe cola a transcrição pronta. As sugestões de ação são uma leitura simples de frases de compromisso e sempre passam por revisão humana.
- A leitura do contrato funciona com PDF que tem texto. Contrato digitalizado como imagem deixa todos os campos “pendentes” para preenchimento manual.
- Pagamento de livros não foi feito.

## Testes

`tests/reuniao1111.test.ts` cobre 25 fluxos com dados fictícios e integrações falsas (nenhuma chamada real): 45/46 dias, ciclo de renovação, resumo sem notas internas e isolamento entre alunas, saldo do exemplo da Jaciara (3 contratados, 1 realizado, 1 agendado → 1 disponível → 0), paridade da agenda, duas alunas no mesmo horário, o último encontro em dois horários, reagendar sem consumir encontro, desmarcar devolvendo saldo, antecedência, WhatsApp com falha e nova tentativa sem duplicar, Google criando e apagando o mesmo evento, canal não configurado, adaptação de etapa só naquela matrícula, cores dos pilares, transcrição protegida e plano publicado, contrato (leitura, acesso restrito, divergência, aplicar sem duplicar), vitórias, depoimentos, conteúdos e mural.
