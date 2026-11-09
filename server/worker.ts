// Ponto de entrada do Worker do sistema pedagógico. O Workers só aceita handlers como exportação
// deste módulo; o atendimento está em server/paginas.ts.
import { atender, montar, type Env } from './paginas'
import { processarAvisos } from './servicos'

export default {
  fetch: atender,
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processarAvisos(montar(env).db))
  },
} satisfies ExportedHandler<Env>
