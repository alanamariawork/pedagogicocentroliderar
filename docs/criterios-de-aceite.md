# O que foi testado

## Testes automáticos (`npm test`: 64 testes, todos passando)

Os testes de aceite (`tests/aceite.test.ts`) abrem um D1 local com as migrations do backoffice e do pedagógico, criam a demonstração fictícia e fazem as chamadas pela API com cada perfil. Os testes de integração (`tests/integracao.test.ts`) cobrem o login único, o bloqueio da aluna e a ligação com Clientes.

| Critério | Teste |
|---|---|
| CA01 | Renovação preserva o histórico e a pessoa é contada uma vez |
| CA02 | Duas matrículas com a mesma duração podem ter quantidades diferentes |
| CA03 | Editar o modelo de pacote não altera matrículas existentes |
| CA04 | O painel mensal lista quem precisa de encontro e calcula a demanda por profissional |
| CA05 | É possível agendar mesmo com atividades pedagógicas pendentes |
| CA06 | Reagendar preserva a data anterior, o motivo e o autor, sem duplicar a obrigação |
| CA07 | Duas tentativas simultâneas não reservam o mesmo horário |
| CA08 | O pré-requisito pedagógico e o item não contratado aparecem de forma distinta |
| CA09 | Só um perfil autorizado valida o avanço, e as exceções ficam registradas |
| CA10 | A aluna vê o próximo passo e não acessa dados de outra pessoa (nem pela URL nem pela API) |
| CA11 | Pausar não muda a vigência nem as previsões sem uma decisão explícita |
| CA12 | Contatos e reagendamentos não multiplicam encontros nem horas |
| CA13 | "Realizado" exige a data real e rejeita uma data futura |
| CA14 | A aluna vê a conquista autorizada e não vê as notas internas |
| CA15 | Os dados permanecem depois de reiniciar o servidor e abrir uma nova sessão |
| CA16 | Registros sem duração ou previsão aparecem como incompletos |

Além desses, há testes de segurança e consistência:
- CSRF.
- O Suporte/CS não vê anotações pedagógicas privadas.
- O perfil Comercial não existe e não pode ser criado.
- Anexos: só tipos permitidos, upload exige o cabeçalho CSRF, a aluna não anexa nem baixa arquivos de outra aluna, e a equipe vê os anexos na fila de validações.
- Cada aluna recebe um ID sequencial na primeira matrícula; a renovação mantém o ID e a busca encontra pelo ID.
- A mentora só vê as próprias matrículas.
- O sistema impede ciclos entre etapas.
- Desmarcar libera o horário sem reduzir a obrigação.
- A transferência na renovação não duplica a obrigação.

Portal da Aluna, fase 1 (7 testes):
- A migração cria as tabelas novas e converte as turmas em texto.
- O Início traz a semana do programa, o próximo passo, os encontros, os atalhos e as metas da própria aluna.
- Meus Dados: a aluna edita só contato e redes; nome, e-mail e matrícula não mudam pela API do portal.
- Diagnóstico: valida as perguntas, bloqueia a versão de fim antes da hora e a equipe lê as respostas pela ficha.
- Metas: exigem valor inicial e alvo diferentes, e uma aluna não altera nem exclui a meta de outra.
- Avisos: agendar um encontro gera aviso para a aluna, e marcar como lido funciona.
- Links: só a equipe com `config:editar` cadastra; a aluna vê a lista.

Administrativo, fase 1 (7 testes):
- A migração 3 cria as listas e dá status e data de entrada a cada aluna com matrícula.
- O Suporte/CS vê todas as alunas. Sem "ver todas", o perfil vê só a própria carteira na lista, na ficha, na jornada e no painel, e a aluna que ele cadastra entra na carteira.
- O estado da aluna só aceita opções da lista certa e fica no histórico; a mentora não edita.
- Pausar e retomar a matrícula muda o status da aluna.
- As listas configuráveis são separadas entre si e só quem tem `config:editar` mexe.
- O painel da Visão Geral soma o mesmo total em todos os agrupamentos.
- Saúde, engajamento, risco e observação nunca podem ser marcados como visíveis à aluna.

Avisos da equipe (2 testes):
- O aviso imediato chega só à aluna escolhida; o link só pode abrir uma página do portal; a mentora não envia.
- O aviso recorrente repete na data certa, não manda atrasados em lote, respeita a data final e pode ser pausado e retomado.

Os testes de cálculo (`tests/calculos.test.ts`) cobrem:
- A soma de horas sem contar a sobreposição duas vezes.
- A classificação de cada entrega em um único grupo do mês.
- O indicador de atraso ("sem previsão" nunca conta como "em dia").
- A detecção de ciclo entre etapas.
- As quantidades com ajustes.
- A sugestão de datas e o formato DD/MM/AAAA.

## Verificação no navegador (Chromium)

Foram abertas todas as telas com os perfis Administração, Coordenação, Mentora e Suporte (desktop e celular de 390 px) e o portal das alunas no celular e no computador (1360 px). Também foram conferidas as abas da Mentora (Minha agenda e Alunas da agenda). As seis fichas foram abertas em todas as abas. Não houve erro de JavaScript nem falha de carregamento.

Fluxos executados clicando na tela, todos concluídos:
1. Agendar um encontro pela tela Entregas do mês, escolhendo um horário livre.
2. Registrar um contato.
3. A aluna enviar uma atividade pelo portal no celular.
4. A aluna tentar chamar a API da equipe e receber 403.
5. A coordenação validar a atividade pela fila de Validações. O portal da aluna mostra o progresso atualizado.
6. Decidir os prazos de uma pausa, estendendo a vigência.
7. Registrar uma conquista e validá-la, liberando-a para a aluna.
8. Cadastrar a disponibilidade repetida por 4 semanas e ver o sistema recusar um horário sobreposto.
9. Editar um pacote, criar uma decisão pendente e criar um usuário.
