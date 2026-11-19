/**
 * Página de login do Diamante Business (/diamante/entrar), para alunas e mentoras. HTML do próprio
 * Worker, sem depender da tela da equipe: só o formulário, que chama POST /api/ped/entrar.
 */
const DIAMANTE = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M2 9h20"/></svg>`

export function paginaEntrar(): Response {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar · Diamante Business</title>
<meta name="robots" content="noindex">
<style>
:root{--vinho:#5e1a33;--vinho-escuro:#3b1222;--vinho-hover:#722642;--dourado:#c9a96e;--dourado-texto:#9a7738;--fundo:#faf7f4;--tinta:#2a1d22;--suave:#6b5a60;--linha:#e7dcd6;--erro:#a8323a}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--tinta);background:var(--fundo);display:grid;grid-template-columns:minmax(0,1fr)}
@media(min-width:900px){body{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}}
.lado{display:none;background:radial-gradient(120% 90% at 20% 10%,#6d2340 0%,var(--vinho-escuro) 60%);color:#f6ece6;padding:56px;flex-direction:column;justify-content:space-between}
@media(min-width:900px){.lado{display:flex}}
.lado h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:2.4rem;line-height:1.15;margin:0 0 16px;font-weight:600}
.lado p{max-width:30rem;color:#d2bcc3;line-height:1.6;margin:0}
.marca{display:flex;align-items:center;gap:12px}
.marca .icone{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid rgba(201,169,110,.6);color:var(--dourado)}
.marca b{display:block;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:1.15rem}
.marca span{display:block;font-size:.8rem;opacity:.75}
.lado .rodape{font-size:.8rem;color:#b89aa5}
main{display:flex;align-items:center;justify-content:center;padding:32px 16px}
.cartao{width:100%;max-width:400px;background:#fff;border:1px solid var(--linha);border-radius:16px;padding:32px 28px;box-shadow:0 10px 30px rgba(59,18,34,.08)}
.cartao .marca{margin-bottom:28px;color:var(--vinho)}
.cartao .marca .icone{color:var(--dourado-texto);border-color:#dcc89f}
@media(min-width:900px){.cartao .marca{display:none}}
h1{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:1.7rem;margin:0 0 6px;color:var(--vinho-escuro)}
.sub{margin:0 0 24px;color:var(--suave);font-size:.95rem}
label{display:block;font-weight:600;font-size:.9rem;margin:16px 0 6px}
input{width:100%;font:inherit;padding:11px 12px;border:1px solid #d8c9c2;border-radius:10px;background:#fff;color:var(--tinta)}
input:focus{outline:2px solid var(--dourado);outline-offset:1px;border-color:var(--dourado)}
.linha{display:flex;justify-content:space-between;align-items:baseline}
.linha a{font-size:.85rem}
a{color:var(--vinho);font-weight:600}
button{margin-top:22px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:10px;background:var(--vinho);color:#fff;cursor:pointer}
button:hover{background:var(--vinho-hover)}
button[disabled]{opacity:.65;cursor:wait}
.erro{display:none;margin:16px 0 0;padding:10px 12px;border-radius:10px;background:#fbecee;color:var(--erro);font-size:.9rem}
.erro.ativo{display:block}
.dicas{margin:22px 0 0;padding:0;list-style:none;font-size:.85rem;color:var(--suave);line-height:1.5}
.dicas li+li{margin-top:6px}
.equipe{margin-top:22px;padding-top:16px;border-top:1px solid var(--linha);font-size:.85rem;color:var(--suave);text-align:center}
</style></head>
<body>
<aside class="lado">
  <div class="marca"><span class="icone">${DIAMANTE}</span><div><b>Diamante Business</b><span>Centro Liderar</span></div></div>
  <div><h2>Sua jornada empresarial, em um só lugar.</h2><p>Alunas acompanham o plano, as mentorias, as aulas e a biblioteca. Mentoras veem as alunas que acompanham, a agenda e os encontros.</p></div>
  <p class="rodape">Centro Liderar · Diamante Business</p>
</aside>
<main>
  <div class="cartao">
    <div class="marca"><span class="icone">${DIAMANTE}</span><div><b>Diamante Business</b><span>Centro Liderar</span></div></div>
    <h1>Entrar</h1>
    <p class="sub">Área das alunas e das mentoras.</p>
    <form id="form" novalidate>
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="email" required autofocus>
      <div class="linha"><label for="senha">Senha</label><a href="/portal/recuperar-senha">Esqueci minha senha</a></div>
      <input id="senha" name="senha" type="password" autocomplete="current-password" required>
      <p id="erro" class="erro" role="alert"></p>
      <button id="botao" type="submit">Entrar</button>
    </form>
    <ul class="dicas">
      <li><b>Primeiro acesso?</b> Use o link do convite que chegou no seu e-mail para criar a senha.</li>
      <li><b>Mentora:</b> se esqueceu a senha, peça à administração para redefinir.</li>
    </ul>
    <p class="equipe">Administração, Coordenação e Suporte: <a href="/entrar">entrar pelo backoffice</a></p>
  </div>
</main>
<script>
(function(){
  var f=document.getElementById('form'),b=document.getElementById('botao'),e=document.getElementById('erro');
  function falhar(m){e.textContent=m;e.className='erro ativo';b.disabled=false;b.textContent='Entrar'}
  f.addEventListener('submit',function(ev){
    ev.preventDefault();
    var email=f.email.value.trim(),senha=f.senha.value;
    if(!email||!senha)return falhar('Informe o e-mail e a senha.');
    b.disabled=true;b.textContent='Entrando…';e.className='erro';
    fetch('/api/ped/entrar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CL-App':'1'},body:JSON.stringify({email:email,senha:senha})})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{ok:r.ok,d:d}})})
      .then(function(x){if(x.ok&&x.d.destino)location.assign(x.d.destino);else falhar(x.d.erro||'Não foi possível entrar. Tente novamente.')})
      .catch(function(){falhar('Sem conexão. Confira a internet e tente novamente.')});
  });
})();
</script>
</body></html>`
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  })
}
