# O que foi testado

## Testes automáticos (`npm test`: 29 testes, todos passando)

Os testes de aceite (`tests/aceite.test.ts`) sobem o servidor real com um banco em memória e a demonstração. Depois, fazem as chamadas pela API com cada perfil.

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
- O perfil comercial não vê notas.
- A mentora só vê as próprias matrículas.
- O sistema impede ciclos entre etapas.
- Desmarcar libera o horário sem reduzir a obrigação.
- A transferência na renovação não duplica a obrigação.

Os testes de cálculo (`tests/calculos.test.ts`) cobrem:
- A soma de horas sem contar a sobreposição duas vezes.
- A classificação de cada entrega em um único grupo do mês.
- O indicador de atraso ("sem previsão" nunca conta como "em dia").
- A detecção de ciclo entre etapas.
- As quantidades com ajustes.
- A sugestão de datas e o formato DD/MM/AAAA.

## Verificação no navegador (Chromium)

Foram abertas todas as telas com os perfis Administração, Mentora, Comercial e Suporte (desktop e celular de 390 px) e o portal de quatro alunas no celular. As seis fichas foram abertas em todas as abas. Não houve erro de JavaScript nem falha de carregamento.

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
