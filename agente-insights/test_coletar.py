"""Testes do agente com a API simulada. Rode: python -m unittest agente-insights/test_coletar.py"""

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coletar  # noqa: E402


def api_falsa(respostas, recusar=()):
    chamadas = []

    def api(caminho, parametros, token):
        chamadas.append((caminho, dict(parametros)))
        if caminho.endswith("/insights"):
            metricas = parametros["metric"].split(",")
            if any(m in recusar for m in metricas):
                raise coletar.ErroApi("metric not supported", 400)
            return {"data": [{"name": m, "values": [{"value": respostas["metricas"][m]}]}
                             for m in metricas if m in respostas["metricas"]]}
        return respostas[caminho]

    api.chamadas = chamadas
    return api


POSTS = {
    "data": [
        # 23/10 01:30 em UTC = 22/10 22:30 em São Paulo
        {"id": "1", "caption": "Reel novo\nsegunda linha", "media_type": "VIDEO",
         "media_product_type": "REELS", "permalink": "https://instagram.com/reel/1",
         "timestamp": "2026-10-23T01:30:00+0000"},
        {"id": "2", "caption": "Carrossel", "media_type": "CAROUSEL_ALBUM",
         "media_product_type": "FEED", "permalink": "https://instagram.com/p/2",
         "timestamp": "2026-10-22T13:00:00+0000"},
        {"id": "3", "caption": "Antigo", "media_type": "IMAGE", "media_product_type": "FEED",
         "permalink": "https://instagram.com/p/3", "timestamp": "2026-10-21T13:00:00+0000"},
    ],
    "paging": {"next": "https://graph.facebook.com/proxima"},
}

METRICAS = {"reach": 100, "views": 250, "likes": 10, "comments": 2, "shares": 3,
            "saved": 4, "follows": 1, "ig_reels_avg_watch_time": 7450}

CONFIG = {"empresa": "Centro Liderar",
          "contas": [{"conta": "MQA", "usuario_instagram": "@mqa", "instagram_id": "", "regra": "mqa"},
                     {"conta": "Diamante Business", "usuario_instagram": "", "instagram_id": "", "regra": ""}]}


class TestColetar(unittest.TestCase):
    def respostas(self):
        return {
            "me/accounts": {"data": [{"name": "Página MQA",
                                      "instagram_business_account": {"id": "99", "username": "MQA"}}]},
            "99/media": POSTS,
            "metricas": METRICAS,
        }

    def test_coleta_so_posts_do_dia_no_fuso_de_sao_paulo(self):
        api = api_falsa(self.respostas())
        with tempfile.TemporaryDirectory() as pasta:
            resultados, texto = coletar.executar(date(2026, 10, 22), "t", CONFIG, Path(pasta), api)
            dados = json.loads((Path(pasta) / "insights.json").read_text(encoding="utf-8"))
        self.assertEqual([r["id"] for r in dados], ["ig-1", "ig-2"])
        # Parou ao achar um post mais antigo, sem seguir para a próxima página.
        self.assertNotIn("https://graph.facebook.com/proxima", [c[0] for c in api.chamadas])
        reel = next(r for r in dados if r["id"] == "ig-1")
        self.assertEqual((reel["type"], reel["format"], reel["rule"]), ("Reels", "Reels", "mqa"))
        self.assertEqual((reel["plays"], reel["saves"], reel["watch"]), (250, 4, 7.5))
        self.assertIsNone(reel["followers"])
        self.assertEqual(reel["description"], "Reel novo")
        carrossel = next(r for r in dados if r["id"] == "ig-2")
        self.assertEqual((carrossel["format"], carrossel["follows"]), ("Carrossel", 1))
        self.assertIn("instagram_id", resultados[1]["erro"])
        self.assertIn("Diamante Business", texto)

    def test_metrica_recusada_fica_vazia_e_resto_continua(self):
        api = api_falsa(self.respostas(), recusar={"follows"})
        with tempfile.TemporaryDirectory() as pasta:
            resultados, _ = coletar.executar(date(2026, 10, 22), "t", CONFIG, Path(pasta), api)
        carrossel = next(r for r in resultados[0]["registros"] if r["id"] == "ig-2")
        self.assertIsNone(carrossel["follows"])
        self.assertEqual(carrossel["reach"], 100)
        self.assertEqual(resultados[0]["recusadas"], {"follows"})

    def test_mesclar_atualiza_sem_duplicar_e_preserva_campos_manuais(self):
        antigo = {"id": "ig-1", "date": "2026-10-22", "account": "MQA", "funnel": "NUTRIÇÃO",
                  "category": "Orgânico", "collected": "ontem", "updated": "ontem", "link": "a",
                  "type": "Reels", "format": "Reels", "reach": 50, "clicks": 7}
        novo = {**antigo, "funnel": "", "category": "Não informado", "collected": "hoje",
                "updated": "hoje", "reach": 80, "clicks": None}
        [r] = coletar.mesclar([antigo], [novo])
        self.assertEqual((r["reach"], r["clicks"], r["funnel"], r["category"]), (80, 7, "NUTRIÇÃO", "Orgânico"))
        self.assertEqual((r["collected"], r["updated"]), ("ontem", "hoje"))

    def test_sem_token_avisa(self):
        import os
        os.environ.pop("META_ACCESS_TOKEN", None)
        self.assertEqual(coletar.main([]), 2)


if __name__ == "__main__":
    unittest.main()
