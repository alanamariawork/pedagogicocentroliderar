# Limitações, premissas e decisões em aberto

## O que não foi feito nesta versão

- **Importação de planilha (P5):** não foi implementada. A planilha de acompanhamento atual contém dados reais e não foi importada. O cadastro é feito pela tela.
- **Integrações:** a única integração é com o backoffice do Centro Liderar (login, Clientes e convite do Portal), pela ligação direta entre os dois Workers. Não há integração com WhatsApp, Google Agenda, Hotmart ou Notion, e nada foi simulado. O único e-mail que sai é o convite do Portal, enviado pelo backoffice quando a administração clica em “Convidar para o portal”.
- **Alertas:** são calculados no momento em que alguém abre a tela. Não há notificação ativa nem histórico de "alerta lido".
- **Login e senha:** são os do backoffice. A equipe troca a senha em “Alterar senha” no backoffice; a aluna usa “Esqueci minha senha” na entrada do Portal.
- **Anexos:** a aluna pode anexar arquivos ao "Enviar o que fiz" (até 5 por envio, 10 MB cada, só tipos da lista). Os arquivos ficam no R2 (bucket `pedagogico-anexos`) e sempre são baixados, nunca abertos no sistema. Não há antivírus nem prévia do arquivo na tela. A equipe ainda não anexa arquivos ao registrar uma evidência, e contratos continuam como texto ou link.
- **Encontro realizado:** a reserva do horário continua ocupando a agenda, o que é o comportamento esperado para o histórico. A agenda não tem visão de mês nem arrastar e soltar.
- **Banco:** o mesmo D1 do backoffice, com tabelas próprias de prefixo `ped_`. Pessoas, contas e sessões são as do backoffice e não são duplicadas.
- **Publicação:** nada foi publicado. O roteiro está em [producao.md](producao.md).
- **Portal da Aluna em fases:** o menu novo já mostra todas as seções. As que ainda não foram construídas (Trilhas, Biblioteca, Plano de Ação, Tarefas, Rotina, Meu Nível, Plano 90 dias, Balanço, Mural, Ranking, Casos e Agenda) abrem uma tela explicando o que virá, com um botão para uma tela que já funciona. Pontos e níveis entram na fase 3; até lá, o card "Meu nível" do Início é só um aviso.
- **Administrativo, fase 1:** saúde, engajamento e "em risco" são marcados pela equipe, sem cálculo automático. Presença e frequência no grupo aparecem como "sem registro" até a fase de agenda e encontros. O banco não tem RLS: o bloqueio por perfil e carteira é feito em cada rota do servidor e coberto por testes. Todos os entregáveis são tratados como mentorias.
- **Avisos (sino):** automáticos ou escritos pela equipe, ficam só dentro do sistema. Não há e-mail, push nem WhatsApp. Avisos programados são conferidos a cada minuto por um agendamento da Cloudflare.

## Premissas adotadas (revisáveis)

- A ordem dos pilares Ação → Gestão → Escala como pré-requisito é uma **hipótese da demonstração**. O modelo é configurável em "Trilhas e etapas".
- Nomes de trilhas, textos de etapas, atividades, pacotes, quantidades e durações da demonstração são **fictícios** e estão marcados como "[Demo]" ou "(demo)". Nenhum conteúdo oficial de aula, trilha ou contrato foi inventado como se fosse real.
- Os nomes das profissionais e os tipos de entregável foram tirados dos materiais enviados. As durações da demonstração são exemplos.
- Uma entrega sem duração nunca é somada como zero: ela aparece à parte, como "sem duração".
- Uma entrega sem previsão nunca é classificada como "em dia".

## Decisões pendentes

A tela "Decisões pendentes" já vem com 10 questões que dependem da coordenação ou da direção, por exemplo:
- A ordem oficial das trilhas.
- Se os pilares devem ser pré-requisitos em sequência.
- As aulas, atividades e critérios oficiais de cada etapa.
- As quantidades e durações oficiais por pacote.
- Como tratar a pausa na vigência.
- A retenção de dados de alunas encerradas (LGPD).

Cada questão pode ser editada e marcada como decidida, com a data da decisão.
