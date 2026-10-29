"""Agente de Insights do Instagram.

Busca, pela API oficial do Instagram (Graph API da Meta), os posts publicados
há N dias (padrão: 7) em cada conta de `contas.json` e grava as métricas em
`dados/`, no mesmo formato dos registros de Insights do sistema de marketing
(`RegistroInsight`).

Uso:
    python agente-insights/coletar.py                 # posts de 7 dias atrás
    python agente-insights/coletar.py --data 2026-10-22
    python agente-insights/coletar.py --listar-contas # mostra as contas que o token enxerga

O token vem da variável de ambiente META_ACCESS_TOKEN. Só usa a biblioteca
padrão do Python.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

VERSAO_API = "v23.0"
BASE_API = f"https://graph.facebook.com/{VERSAO_API}"
FUSO = ZoneInfo("America/Sao_Paulo")
PASTA = Path(__file__).resolve().parent
PASTA_DADOS = PASTA / "dados"

# Campos de métricas do sistema, na ordem da tela de Insights.
CHAVES_METRICAS = [
    "nonfollowers", "followers", "clicks", "reach", "plays", "reposts",
    "repeats", "watch", "likes", "comments", "shares", "saves", "follows",
]

# Métricas pedidas à API para cada tipo de publicação. Se a API recusar o
# pacote, o agente tenta uma a uma e fica só com as aceitas.
METRICAS_API = {
    "REELS": ["reach", "views", "likes", "comments", "shares", "saved", "ig_reels_avg_watch_time"],
    "FEED": ["reach", "views", "likes", "comments", "shares", "saved", "follows"],
}

# Métrica da API → campo do sistema. Alcance de seguidores/não seguidores,
# cliques no link, republicações e repetições não vêm por post na API: ficam
# vazios (null), que no sistema é diferente de zero.
MAPA_METRICAS = {
    "reach": "reach",
    "views": "plays",
    "likes": "likes",
    "comments": "comments",
    "shares": "shares",
    "saved": "saves",
    "follows": "follows",
}


class ErroApi(Exception):
    def __init__(self, mensagem: str, status: int | None = None):
        super().__init__(mensagem)
        self.status = status


def chamar_api(caminho: str, parametros: dict, token: str) -> dict:
    """GET na Graph API. `caminho` pode ser relativo ou uma URL completa (paginação)."""
    if caminho.startswith("http"):
        url = caminho
    else:
        consulta = urllib.parse.urlencode({**parametros, "access_token": token})
        url = f"{BASE_API}/{caminho.lstrip('/')}?{consulta}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resposta:
            return json.loads(resposta.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        try:
            detalhe = json.loads(erro.read().decode("utf-8")).get("error", {}).get("message", "")
        except Exception:
            detalhe = ""
        raise ErroApi(detalhe or f"HTTP {erro.code}", erro.code) from None
    except urllib.error.URLError as erro:
        raise ErroApi(f"Falha de conexão: {erro.reason}") from None


def listar_contas_do_token(token: str, api=chamar_api) -> list[dict]:
    """Contas profissionais do Instagram ligadas às Páginas que o token administra."""
    contas = []
    caminho, parametros = "me/accounts", {
        "fields": "name,instagram_business_account{id,username,name}",
        "limit": 100,
    }
    while caminho:
        resposta = api(caminho, parametros, token)
        for pagina in resposta.get("data", []):
            ig = pagina.get("instagram_business_account")
            if ig:
                contas.append({
                    "pagina": pagina.get("name", ""),
                    "instagram_id": ig.get("id", ""),
                    "usuario": ig.get("username", ""),
                })
        caminho, parametros = resposta.get("paging", {}).get("next"), {}
    return contas


def resolver_ids(contas: list[dict], token: str, api=chamar_api) -> list[dict]:
    """Preenche `instagram_id` a partir do @usuário quando ele não foi informado."""
    faltando = [c for c in contas if not c.get("instagram_id") and c.get("usuario_instagram")]
    if not faltando:
        return contas
    por_usuario = {c["usuario"].lower(): c["instagram_id"] for c in listar_contas_do_token(token, api)}
    for conta in faltando:
        conta["instagram_id"] = por_usuario.get(conta["usuario_instagram"].lstrip("@").lower(), "")
    return contas


def data_local(timestamp: str) -> date:
    """Data de publicação no fuso de São Paulo, a partir do timestamp da API."""
    instante = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S%z")
    return instante.astimezone(FUSO).date()


def posts_do_dia(instagram_id: str, dia: date, token: str, api=chamar_api) -> list[dict]:
    """Posts do feed e Reels publicados em `dia`. A API devolve do mais novo ao mais antigo."""
    posts = []
    caminho = f"{instagram_id}/media"
    parametros = {
        "fields": "id,caption,media_type,media_product_type,permalink,timestamp",
        "limit": 50,
    }
    while caminho:
        resposta = api(caminho, parametros, token)
        pagina = resposta.get("data", [])
        posts += [p for p in pagina if data_local(p["timestamp"]) == dia]
        # Olha a página inteira antes de parar: um post fixado antigo pode vir no topo.
        if pagina and data_local(pagina[-1]["timestamp"]) < dia:
            return posts
        caminho, parametros = resposta.get("paging", {}).get("next"), {}
    return posts


def buscar_metricas(post: dict, token: str, api=chamar_api) -> tuple[dict, list[str]]:
    """Valores brutos das métricas do post e a lista das que a API recusou."""
    produto = "REELS" if post.get("media_product_type") == "REELS" else "FEED"
    pedidas = METRICAS_API[produto]

    def pedir(metricas):
        resposta = api(f"{post['id']}/insights", {"metric": ",".join(metricas)}, token)
        valores = {}
        for item in resposta.get("data", []):
            lista = item.get("values") or [{}]
            valores[item["name"]] = lista[0].get("value", item.get("total_value", {}).get("value"))
        return valores

    try:
        return pedir(pedidas), []
    except ErroApi as erro:
        if erro.status not in (400, None):
            raise
    valores, recusadas = {}, []
    for metrica in pedidas:
        try:
            valores.update(pedir([metrica]))
        except ErroApi as erro:
            if erro.status not in (400, None):
                raise
            recusadas.append(metrica)
    return valores, recusadas


def tipo_e_formato(post: dict) -> tuple[str, str]:
    if post.get("media_product_type") == "REELS":
        return "Reels", "Reels"
    if post.get("media_type") == "CAROUSEL_ALBUM":
        return "Feed", "Carrossel"
    if post.get("media_type") == "VIDEO":
        return "Feed", "Reels"
    return "Feed", "Estático"


def montar_registro(post: dict, valores: dict, conta: dict, empresa: str, agora: str) -> dict:
    tipo, formato = tipo_e_formato(post)
    legenda = (post.get("caption") or "").strip()
    registro = {
        "id": f"ig-{post['id']}",
        "company": empresa,
        "account": conta["conta"],
        "date": data_local(post["timestamp"]).isoformat(),
        "rule": conta.get("regra", ""),
        "collected": agora,
        "updated": agora,
        "notes": "Coletado automaticamente pela API do Instagram.",
        "type": tipo,
        "funnel": "",
        "format": formato,
        "description": legenda.splitlines()[0][:120] if legenda else "",
        "link": post.get("permalink", ""),
        "category": "Não informado",
    }
    for chave in CHAVES_METRICAS:
        registro[chave] = None
    for metrica_api, chave in MAPA_METRICAS.items():
        if valores.get(metrica_api) is not None:
            registro[chave] = valores[metrica_api]
    if valores.get("ig_reels_avg_watch_time") is not None:
        registro["watch"] = round(valores["ig_reels_avg_watch_time"] / 1000, 1)
    return registro


def mesclar(existentes: list[dict], novos: list[dict]) -> list[dict]:
    """Junta por `id`: atualiza métricas de quem já existe, sem duplicar.

    Mantém `collected` da primeira coleta e não sobrescreve campos que alguém
    preencheu à mão (funil, categoria, observações) com os valores padrão.
    """
    por_id = {r["id"]: r for r in existentes}
    for novo in novos:
        antigo = por_id.get(novo["id"])
        if antigo is None:
            por_id[novo["id"]] = novo
            continue
        atualizado = {**antigo}
        for chave in CHAVES_METRICAS:
            if novo.get(chave) is not None:
                atualizado[chave] = novo[chave]
        for chave in ("updated", "link", "type", "format"):
            atualizado[chave] = novo[chave]
        por_id[novo["id"]] = atualizado
    return sorted(por_id.values(), key=lambda r: (r["date"], r["account"], r["id"]))


def gravar(registros: list[dict], pasta: Path) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "insights.json").write_text(
        json.dumps(registros, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    colunas = ["id", "company", "account", "date", "rule", "type", "format", "funnel",
               "category", "description", "link", *CHAVES_METRICAS, "collected", "updated", "notes"]
    with open(pasta / "insights.csv", "w", newline="", encoding="utf-8-sig") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas, extrasaction="ignore")
        escritor.writeheader()
        for r in registros:
            escritor.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in colunas})


def relatorio(dia: date, resultados: list[dict]) -> str:
    linhas = [f"# Insights do Instagram — posts de {dia.strftime('%d/%m/%Y')}", ""]
    for r in resultados:
        linhas.append(f"## {r['conta']}")
        if r.get("erro"):
            linhas += [f"⚠️ {r['erro']}", ""]
            continue
        if not r["registros"]:
            linhas += ["Nenhum post nesse dia.", ""]
            continue
        linhas += ["| Post | Formato | Alcance | Visualizações | Curtidas | Coment. | Compart. | Salvam. |",
                   "|---|---|---|---|---|---|---|---|"]
        for x in r["registros"]:
            nome = (x["description"] or "(sem legenda)").replace("|", "/")[:50]
            celulas = [x.get(k) for k in ("reach", "plays", "likes", "comments", "shares", "saves")]
            linhas.append(f"| [{nome}]({x['link']}) | {x['format']} | "
                          + " | ".join("—" if v is None else str(v) for v in celulas) + " |")
        if r.get("recusadas"):
            linhas.append(f"\nMétricas que a API não entregou: {', '.join(sorted(r['recusadas']))}.")
        linhas.append("")
    return "\n".join(linhas)


def executar(dia: date, token: str, config: dict, pasta: Path, api=chamar_api) -> tuple[list[dict], str]:
    agora = datetime.now(timezone.utc).astimezone(FUSO).isoformat(timespec="seconds")
    empresa = config.get("empresa", "Centro Liderar")
    contas = resolver_ids([dict(c) for c in config["contas"]], token, api)
    resultados, novos = [], []
    for conta in contas:
        resultado = {"conta": conta["conta"], "registros": [], "recusadas": set()}
        resultados.append(resultado)
        if not conta.get("instagram_id"):
            resultado["erro"] = ("Conta sem instagram_id e sem @usuário reconhecido pelo token. "
                                 "Preencha em agente-insights/contas.json.")
            continue
        try:
            for post in posts_do_dia(conta["instagram_id"], dia, token, api):
                valores, recusadas = buscar_metricas(post, token, api)
                resultado["recusadas"].update(recusadas)
                resultado["registros"].append(montar_registro(post, valores, conta, empresa, agora))
        except ErroApi as erro:
            resultado["erro"] = f"Erro da API do Instagram: {erro}"
        novos += resultado["registros"]

    arquivo = pasta / "insights.json"
    existentes = json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else []
    gravar(mesclar(existentes, novos), pasta)
    texto = relatorio(dia, resultados)
    (pasta / "ultimo-relatorio.md").write_text(texto + "\n", encoding="utf-8")
    return resultados, texto


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Coleta Insights do Instagram dos posts de N dias atrás.")
    parser.add_argument("--data", help="Data dos posts (AAAA-MM-DD). Padrão: hoje menos --dias.")
    parser.add_argument("--dias", type=int, default=7, help="Quantos dias atrás (padrão 7).")
    parser.add_argument("--listar-contas", action="store_true", help="Lista as contas que o token enxerga.")
    args = parser.parse_args(argv)

    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        print("Falta o token: defina a variável de ambiente META_ACCESS_TOKEN (veja agente-insights/README.md).",
              file=sys.stderr)
        return 2

    if args.listar_contas:
        for c in listar_contas_do_token(token):
            print(f"@{c['usuario']}  instagram_id={c['instagram_id']}  (Página: {c['pagina']})")
        return 0

    hoje = datetime.now(FUSO).date()
    dia = date.fromisoformat(args.data) if args.data else hoje - timedelta(days=args.dias)
    config = json.loads((PASTA / "contas.json").read_text(encoding="utf-8"))
    resultados, texto = executar(dia, token, config, PASTA_DADOS)
    print(texto)
    # Código de saída 1 só se nenhuma conta funcionou.
    return 1 if all(r.get("erro") for r in resultados) else 0


if __name__ == "__main__":
    sys.exit(main())
