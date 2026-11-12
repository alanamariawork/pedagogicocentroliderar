# Diamante Business | Gestão da Jornada

Sistema pedagógico do Centro Liderar (Grupo Mendes) para acompanhar as mentoradas do programa Diamante Business: matrículas, entregáveis contratados, entregas do mês, agenda e capacidade, contatos e impedimentos, jornada pedagógica com validação humana, conquistas, satisfação e o portal da aluna.

Ele entra no lugar das páginas “Produtos & Entrega” do backoffice e roda dentro do mesmo endereço:

| Quem | Endereço | Login |
|---|---|---|
| Equipe (Administração, Coordenação, Suporte/CS, Mentora) | `/produtos/`, pelo menu “Produtos & Entrega” do backoffice | o do backoffice |
| Aluna | `/portal/diamante-business/` | o do Portal (convite por e-mail) |

Não há login próprio, cadastro de pessoas próprio nem banco separado. Contas, sessões e Clientes são os do backoffice; o pedagógico guarda só o que é dele, em tabelas `ped_` do mesmo D1. Os detalhes estão em [docs/arquitetura.md](docs/arquitetura.md).

> Nenhum dado real de aluna foi importado. Conteúdos de trilhas, etapas e pacotes são cadastrados pela equipe na própria tela.

## Desenvolvimento local

Você precisa de **Node.js 20.11 ou mais recente**.

```bash
npm install
npm run dev:dados   # banco local (.wrangler/state) com as migrations do backoffice e do pedagógico
                    # e dados fictícios (@demo.local); mostra um cookie de sessão por perfil
npm run dev         # build + wrangler dev em http://localhost:8787/produtos/
```

O banco local é um D1 de verdade (o mesmo motor da Cloudflare), só na sua máquina. Os dados fictícios existem só nele: nada de demonstração vai para produção.

## Testes

```bash
npm test            # 64 testes em D1 local: aceite (CA01–CA16), login único e ligação com Clientes, cálculos
npm run typecheck
```

Os testes aplicam as migrations do backoffice (cópia em `d1/backoffice/`) e as do pedagógico num D1 local e percorrem a API e as páginas com cada perfil. Veja [docs/criterios-de-aceite.md](docs/criterios-de-aceite.md).

## Publicar

Nada foi publicado. A publicação depende de uma alteração no backoffice (pacote à parte) e segue a ordem de [docs/producao.md](docs/producao.md). Nenhum segredo fica no código.

## Documentação

- [docs/uso.md](docs/uso.md): o guia de uso por perfil e tela.
- [docs/arquitetura.md](docs/arquitetura.md): a estrutura, o login único, a ligação com Clientes, o modelo de dados e onde cada regra RN01–RN16 está implementada.
- [docs/producao.md](docs/producao.md): o roteiro de publicação e o checklist de teste por perfil.
- [docs/criterios-de-aceite.md](docs/criterios-de-aceite.md): o que foi testado e como.
- [docs/limitacoes.md](docs/limitacoes.md): as limitações, as premissas e as decisões em aberto.
