# Limitações, premissas e decisões em aberto

## O que não foi feito nesta versão

- **Importação de planilha (P5):** não foi implementada. A planilha de acompanhamento atual contém dados reais e não foi importada. O cadastro é feito pela tela.
- **Integrações:** não há integração com WhatsApp, Google Agenda, Hotmart, Notion ou e-mail, e nada foi simulado. Contatos e agendamentos são registros manuais e o sistema não envia nenhuma mensagem.
- **Alertas:** são calculados no momento em que alguém abre a tela. Não há notificação ativa nem histórico de "alerta lido".
- **Recuperação de senha:** não há "esqueci minha senha" por e-mail. A administração redefine a senha e a pessoa troca no primeiro acesso.
- **Anexos:** a aluna pode anexar arquivos ao "Enviar o que fiz" (até 5 por envio, 10 MB cada, só tipos da lista). Os arquivos ficam dentro do banco e sempre são baixados, nunca abertos no sistema. Não há antivírus nem prévia do arquivo na tela. A equipe ainda não anexa arquivos ao registrar uma evidência, e contratos continuam como texto ou link.
- **Encontro realizado:** a reserva do horário continua ocupando a agenda, o que é o comportamento esperado para o histórico. A agenda não tem visão de mês nem arrastar e soltar.
- **Banco:** SQLite em um único servidor serve bem um piloto com uma equipe pequena. Para muitos acessos simultâneos ou mais de um servidor, o próximo passo seria migrar para PostgreSQL.
- **Publicação:** nada foi publicado. Veja o README.

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
