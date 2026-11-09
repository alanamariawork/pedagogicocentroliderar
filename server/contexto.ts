/**
 * O que o sistema pedagógico usa de fora dele, atrás de interfaces simples para os testes poderem
 * trocar a implementação:
 *   - Clientes (backoffice): a identidade da aluna mora em `pessoa`. Criar ou alterar nome, e-mail,
 *     telefone e CPF passa SEMPRE pela regra do backoffice (validação, CPF único, auditoria e fila
 *     de gravação). Em produção a chamada vai pelo service binding BACKOFFICE (server/integracao.ts).
 *   - Arquivos: os anexos ficam no R2 (o D1 não guarda valores acima de 2 MB).
 */

export interface DadosPessoa {
  nome: string
  email?: string | null
  telefone?: string | null
  cpf?: string | null
}

/** Quem pediu a alteração: a conta e o escopo da sessão (o backoffice confere as permissões de novo). */
export interface Autor {
  usuarioId: string
  escopo: 'equipe' | 'portal'
}

/**
 * Resultado do convite do Portal, como o backoffice devolve. 'enviado' = e-mail saiu agora;
 * 'ja_tem_acesso' = a conta já foi ativada; as demais (ja_convidada, reenvio_recente, sem_email,
 * email_invalido, envio_em_andamento, falha_envio) vêm com a mensagem do backoffice.
 */
export interface ConvitePortal {
  situacao: string
  mensagem: string
}

export interface Clientes {
  /** Cria a pessoa em Clientes e devolve o id. Erros de validação voltam com a mensagem do backoffice. */
  criarPessoa(autor: Autor, dados: DadosPessoa): Promise<{ id: string }>
  /**
   * Altera nome, e-mail, telefone ou CPF da pessoa em Clientes. Campo ausente = não muda.
   * O autor pode ser da equipe ou a própria aluna (só o telefone, pelo portal).
   */
  atualizarPessoa(autor: Autor, pessoaId: string, dados: Partial<DadosPessoa>): Promise<void>
  /** Convida a pessoa para o Portal (e-mail de primeiro acesso do backoffice). */
  convidarPortal(autor: Autor, pessoaId: string, reenviar?: boolean): Promise<ConvitePortal>
}

export interface Arquivos {
  guardar(chave: string, dados: ArrayBuffer, tipo: string): Promise<void>
  ler(chave: string): Promise<ArrayBuffer | null>
  apagar(chaves: string[]): Promise<void>
}

export interface ContextoApp {
  clientes: Clientes
  arquivos: Arquivos
}

/** Arquivos no R2. */
export function arquivosR2(bucket: R2Bucket): Arquivos {
  return {
    async guardar(chave, dados, tipo) {
      await bucket.put(chave, dados, { httpMetadata: { contentType: tipo } })
    },
    async ler(chave) {
      const o = await bucket.get(chave)
      return o ? await o.arrayBuffer() : null
    },
    async apagar(chaves) {
      if (chaves.length) await bucket.delete(chaves)
    },
  }
}
