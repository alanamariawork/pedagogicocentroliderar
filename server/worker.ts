// Ponto de entrada do Worker do sistema pedagógico. O Workers só aceita handlers como exportação
// deste módulo; o atendimento está em server/paginas.ts.
import { atender, montar, type Env } from './paginas'
import { processarAvisos } from './servicos'
import { processarEnviosAvisos } from './avisosExternos'

export default {
  fetch: atender,
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    const m = montar(env)
    // Primeiro entrega os avisos do minuto no sino; depois envia a fila de e-mail e WhatsApp.
    ctx.waitUntil(processarAvisos(m.db).then(() => processarEnviosAvisos(m.db, m.ctx)))
  },
} satisfies ExportedHandler<Env>
