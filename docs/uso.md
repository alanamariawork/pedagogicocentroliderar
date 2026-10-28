# Guia de uso

As datas aparecem no formato DD/MM/AAAA e no horário de Brasília (America/Sao_Paulo). No computador, o menu fica na lateral; no celular, abre pelo botão ☰. Cada perfil só vê no menu o que tem permissão para usar.

## Equipe

**Entregas do mês** é a tela principal. Ela tem:
- Cartões com a demanda do mês, a pendência anterior, o que está sem previsão e o que foi realizado. Uma entrega sem duração informada aparece destacada e **não** é somada como zero.
- As horas por profissional: quanto foi disponibilizado, reservado e está livre, a demanda sem agendamento e o saldo teórico.
- Abas que separam as entregas em cinco grupos: previstos no mês, pendências anteriores, sem previsão, agendados e realizados. Cada entrega aparece em um único grupo.
- No menu **⋯** de cada linha: agendar (com horários livres da profissional), reagendar (exige motivo e guarda o histórico), desmarcar (libera o horário), marcar como realizado, registrar contato, registrar impedimento, mudar a situação ou o responsável e cancelar (é uma decisão registrada; a obrigação pode ser mantida).
- Filtros e exportação em CSV.

**Alunas e matrículas** permite buscar alunas e cadastrar uma nova (pessoa e matrícula juntas, com um pacote opcional). A ficha da aluna tem abas:
- **Resumo:** vigência, contrato e onboarding (são controles separados) e a conferência comercial.
- **Entregáveis:** os itens da matrícula. A quantidade só muda por ajuste ou exceção registrados com motivo.
- **Encontros:** previsões explícitas (com sugestão de datas para revisar), as ações e o histórico de cada encontro.
- **Jornada:** trilha e pilar, as etapas com pré-requisitos, as atividades, as evidências registradas pela equipe e a liberação ou conclusão com validação.
- **Contatos** e **Conquistas** (a conquista só vai para o portal depois de validada e liberada).
- **Pausa, renovação e satisfação:**
  - A pausa não mexe em prazos sozinha. A decisão de manter ou estender é registrada à parte.
  - Encerrar ou cancelar a matrícula preserva todos os registros.
  - A renovação cria um novo ciclo. As pendências do ciclo anterior só passam com a ação "Transferir".
  - Aqui também ficam os feedbacks e o interesse em renovar.
- **Anotações:** operacionais ou pedagógicas, nunca aparecem no portal.
- **Histórico:** a auditoria de quem fez o quê e quando.

**Capacidade e agenda** mostra uma semana por profissional. Ali você cadastra blocos de disponibilidade, com a opção de repetir por várias semanas. O sistema recusa um horário que se sobreponha a outro.

**Validações** é a fila de atividades enviadas e de conquistas ainda não validadas.

**Alertas** são calculados no momento da consulta: entrega vencida, encontro sem registro, contato a refazer, matrícula perto do término, cadastro incompleto, pausa sem decisão e atividade aguardando validação. Nenhuma mensagem é enviada automaticamente.

**Trilhas e etapas** guarda o modelo pedagógico: trilhas, pilares, etapas, pré-requisitos (o sistema bloqueia ciclos), links e atividades-modelo.

**Pacotes** guarda os modelos copiados para a matrícula. Mudar um modelo não altera as matrículas que já existem.

**Decisões pendentes** lista as questões que a direção ou a coordenação ainda precisam decidir.

**Mentora** vê um menu próprio com duas abas:
- **Minha agenda:** só os horários e encontros da mentora que entrou.
- **Alunas da agenda:** um cartão por aluna com encontros com ela, em ordem de ID: vigência, trilha e progresso, próximo e último encontro, encontros em aberto (com as ações de agendar, realizar, registrar contato etc.) e a última anotação, com o botão para registrar uma nova.

Cada aluna tem um **ID** (#001, #002…) que segue a ordem de matrícula. As listas são ordenadas por ele e a busca aceita o ID.

**Configurações** tem os cadastros, os parâmetros (a janela de "próxima do término" e o texto de ajuda do portal), os usuários (inclusive a redefinição de senha) e as regras de acesso por perfil.

## Aluna (portal, celular e computador)

O portal mostra:
- O próximo passo, a trilha, o pilar e a vigência.
- **Quanto já concluí:** o percentual da trilha (cada etapa vale o mesmo; a etapa em andamento conta pelas atividades validadas).
- **Minha trilha:** as etapas lado a lado na horizontal. No celular, a aluna desliza para o lado, e a trilha já abre na etapa em andamento.
- As etapas. As liberadas mostram atividades e materiais. As bloqueadas mostram um cadeado e dizem o que falta para liberar.
- O botão "Enviar o que fiz", para mandar um texto, um link e/ou até 5 arquivos (PDF, foto, Word, Excel, PowerPoint, texto, áudio ou vídeo MP4, de até 10 MB cada) para validação. A equipe baixa os arquivos na fila de **Validações** e na aba **Jornada** da ficha. Quando a equipe pede revisão, o comentário aparece aqui.
- Os encontros. O resumo compartilhável só aparece depois que o encontro foi realizado.
- Os formatos que não fazem parte do contrato, marcados como **"Não incluído no contrato"**, um selo diferente do cadeado pedagógico.
- **Meu crescimento:** um gráfico das conquistas validadas somadas ao longo do tempo, com a linha do tempo ao lado, sem comparação com outras alunas.
- Como pedir ajuda, e a troca de senha.

A aluna só acessa os próprios dados, inclusive se tentar abrir um endereço ou chamar a API diretamente.
