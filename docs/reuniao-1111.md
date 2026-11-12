# Ajustes da reunião de 11/11/2026

Tudo abaixo está no código do backoffice (aba Pedagógico) e no Portal da Aluna (`/portal/diamante-business/`). A migration nova é `0002_ped_ajustes_reuniao_1111.sql`: só acrescenta colunas, tabelas e configurações, sem apagar nada.

## Telas que mudaram

**Portal da Aluna**
- **Início:** card “Resumo executivo”, o mesmo da ficha só com o que a aluna pode ver (programa, etapa atual com a cor do pilar e o prazo da etapa ou “Sem prazo definido”, próximo encontro, vigência, mentorias realizadas/contratadas, última mentoria, presença e próxima ação). A vigência fica em destaque dourado quando faltam 45 dias ou menos (46 dias não destaca). Card “Avisos” no lugar de “Meu nível”. Mentorias realizadas mostram “de N contratado(s)”.
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

## Atualização de 12/11: linha do tempo e planos oficiais

- **Início do portal › Linha do tempo do seu plano:** um card por mês do contrato (Mês 01, 02…), com início e encerramento de cada mês, a marca “Mês atual / Concluído / Próximo” e a barra “N% concluído”. O 1º mês começa na data de início da matrícula; o último termina no encerramento (sobra de menos de 7 dias entra no último mês). Clicar no card abre as aulas daquele mês.
- **Barra de progresso:** avança conforme a aluna assiste às aulas gravadas (Vimeo) do mês. O progresso vem do próprio player e é gravado no servidor, por aluna; voltar o vídeo não tira progresso; a aula conta como assistida a partir de 90%. Mês sem aula publicada mostra “Não contabiliza progresso”.
- **Equipe › Aulas, conteúdos e mural › Aulas do plano:** cadastro da aula (mês do plano, programa, vídeo do Vimeo), publicação e quantas alunas já assistiram.
- **Planos oficiais** (migration `0003_ped_planos_linha_do_tempo.sql`, em Pacotes): Diamante Business de 4 meses (25 encontros), 6 meses (35) e 12 meses (67), com os 4 bônus (Perfil Comportamental, Planejamento Estratégico, Consultoria Financeira com Leonardo Mendes e Ativa Casal) em cada um. A migration só acrescenta: não duplica programa, profissionais nem tipos que já existam com o mesmo nome, e não altera matrículas existentes.
- **A confirmar:** durações de cada encontro (ficaram “não informadas”), quem conduz os encontros em grupo, se o Check-in Diamante é individual (hoje está como em grupo) e se os 4 bônus valem para os três planos (hoje estão nos três).

## Atualização de 12/11: avisos por e-mail e WhatsApp

- **Todo aviso do sino da aluna também sai por e-mail e WhatsApp:** os escritos pela equipe (Avisos às alunas e "Enviar aviso" na ficha) e os automáticos (encontro agendado ou remarcado, atividade e vitória validadas, plano de ação publicado, etapas). Cada aviso gera uma linha por canal (`ped_envios_aviso`, migration 0004). Exceção: avisos de encontro agendado, remarcado ou desmarcado vão só por e-mail, porque o WhatsApp desses já sai pela confirmação do agendamento. O envio roda no agendamento de cada minuto, com até 5 tentativas espaçadas em caso de falha, e nunca duplica.
- **E-mail:** sai pelo backoffice, no mesmo serviço do convite do portal (Resend, `EMAIL_ENVIO`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `PORTAL_BASE_URL`), sempre para o e-mail cadastrado em Clientes. O pacote do backoffice ganhou o método `enviarAvisoAluna` no entrypoint Pedagogico e o modelo do e-mail de aviso.
- **WhatsApp:** API oficial da Meta. Além de `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, precisa do segredo `WHATSAPP_MODELO_AVISO`: o nome de um modelo de mensagem aprovado na Meta com 3 variáveis no corpo, nesta ordem: {{1}} primeiro nome da aluna, {{2}} título do aviso, {{3}} texto do aviso. Mensagem iniciada pela empresa só sai por modelo aprovado (regra da Meta).
- **Botão de WhatsApp:** na ficha da aluna (abre a conversa) e em cada linha de "Envios por e-mail e WhatsApp", na página Avisos às alunas (abre o WhatsApp da equipe com a mensagem pronta). A mesma página mostra a situação de cada canal (enviado, na fila, falhou com o motivo, não configurado dizendo o que falta, desligado) e tem "Tentar novamente" e "Enviar pendentes agora".
- **Liga/desliga:** Configurações › Parâmetros › Avisos às alunas (e-mail e WhatsApp separados).
- Avisos com mais de 48 horas não são enviados automaticamente (evita mandar aviso velho quando um canal for configurado depois).

## Atualização de 12/11: estantes na Biblioteca

- Em **Aulas, conteúdos e mural → Biblioteca**, Administração, Coordenação e Suporte criam **estantes** (nome, descrição e ordem) e colocam dentro delas arquivos, links e vídeos. A permissão nova é `biblioteca:editar`; o Suporte edita só a Biblioteca (Rotina, Livros e Aulas continuam com `conteudos:editar`). A Administração pode mudar isso em Regras de acesso.
- Nada aparece para a aluna até a estante **e** o material serem publicados. Retirar a estante do portal esconde tudo o que está nela, sem apagar nada.
- Vídeo do Vimeo toca dentro do portal. O próprio player informa o ponto alcançado e o servidor guarda o maior valor por aluna (a partir de 90% conta como assistido). A aluna vê "45% assistido" ou "Assistido" em cada vídeo e "X de Y vídeos assistidos" em cada estante; a equipe vê quantas alunas começaram e quantas assistiram até o fim.
- Materiais da Biblioteca que já existiam continuam aparecendo soltos, pela categoria (ex.: Ferramentas).
- Banco: migration `0005_ped_biblioteca_estantes.sql` (tabelas novas `ped_estantes` e `ped_conteudos_progresso`, coluna nova `estante_id` em `ped_conteudos`). Nada existente é apagado.
- Limite: só vídeos do Vimeo são aceitos (é o que permite ler o quanto foi assistido sem script de terceiros). Link de YouTube é recusado com mensagem.

## Atualização de 12/11: Google Agenda com link do Google Meet

- Cada encontro agendado (pela equipe ou pela aluna no portal) vira um evento no Google Agenda da mentora, como já era; agora o evento **sai com um link do Google Meet**. Reagendar move o mesmo evento e mantém o mesmo link; desmarcar remove o evento e o link.
- O link fica gravado no encontro (`ped_ocorrencias.link_reuniao`, migration `0006_ped_google_meet.sql`). A aluna vê o botão **Entrar no Meet** em Início, Minha agenda e Mentorias; a equipe vê o link na confirmação do agendamento.
- Em **Configurações › Parâmetros › Google Agenda**: “Criar link do Google Meet” (ligado) e “Convidar a aluna para o evento” (desligado; ligado, o Google manda o convite e as mudanças para o e-mail da aluna em Clientes).
- Requisito: credenciais do Google no servidor (`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`) e, para o Meet, Google Workspace com delegação (`GOOGLE_AGIR_COMO_MENTORA=1`). Passo a passo em [producao.md](producao.md). Se o Google recusar o Meet, o evento é gravado sem link e o motivo aparece na confirmação.
- Sem credenciais, nada é enviado nem simulado: o agendamento funciona e a confirmação fica “não configurado”.

## Atualização de 12/11: login separado para alunas e mentoras

- **Alunas e mentoras** entram por uma página própria do Diamante Business: `/diamante/entrar`. A aluna vai para o portal (`/portal/diamante-business/`); a mentora, para a área dela (`/diamante/mentora/`), que é a tela da equipe limitada pelo perfil Mentora, sem o atalho para o backoffice.
- **Administração, Coordenação e Suporte** continuam entrando pelo backoffice do Centro Liderar (`/entrar`), aba Pedagógico. Se tentarem a página do Diamante, a senha é conferida, nenhuma sessão é aberta e aparece o aviso para usar o backoffice.
- A senha continua no backoffice (nenhuma senha no pedagógico): a página nova chama o backoffice pelo service binding, com a mesma conferência e o mesmo bloqueio após tentativas erradas. A sessão é a mesma dos dois sistemas.
- Sem sessão, o portal e a área da mentora levam para `/diamante/entrar`; uma mentora que abrir `/produtos/` vai para a área dela. "Sair" leva alunas e mentoras de volta para o login do Diamante.
- Primeiro acesso e "esqueci minha senha" da aluna continuam nas telas do Portal do backoffice (links na página). A mentora com senha provisória é levada para criar a senha no backoffice.
- Backoffice: `worker/pedagogico.ts` ganhou `entrarDiamante` e `worker/index.ts` passou a repassar `/diamante/*`.
