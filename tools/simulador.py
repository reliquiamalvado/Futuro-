#!/usr/bin/env python3
"""Simula o ESP32 no computador para testar o app sem hardware.

    python3 tools/simulador.py            # http://localhost:8080, senha "teste"
    python3 tools/simulador.py --porta 9000 --token minhasenha --separados

O portão simulado leva alguns segundos para abrir/fechar e cada "acionar"
alterna o movimento, como uma central de portão de verdade.
"""
import argparse
import hmac
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
TIPOS = {"/": ("index.html", "text/html; charset=utf-8"),
         "/manifest.json": ("manifest.json", "application/manifest+json"),
         "/icon.svg": ("icon.svg", "image/svg+xml")}
TEMPO_CURSO = 4.0
INTERVALO_MIN = 1.5


class Portao:
    def __init__(self):
        self.trava = threading.Lock()
        self.estado = "fechado"
        self.destino = None
        self.fim = 0.0
        self.ultimo = 0.0

    def _atualizar(self):
        if self.destino and time.monotonic() >= self.fim:
            self.estado, self.destino = self.destino, None

    def status(self):
        with self.trava:
            self._atualizar()
            return "movendo" if self.destino else self.estado

    def comando(self, acao):
        with self.trava:
            agora = time.monotonic()
            if agora - self.ultimo < INTERVALO_MIN:
                return False
            self.ultimo = agora
            self._atualizar()
            if acao == "acionar":
                if self.destino:  # em movimento: para
                    self.estado, self.destino = "desconhecido", None
                    return True
                acao = "fechar" if self.estado == "aberto" else "abrir"
            alvo = "aberto" if acao == "abrir" else "fechado"
            if self.estado != alvo:
                self.destino, self.fim = alvo, agora + TEMPO_CURSO
            print(f"[relé] pulso -> {acao}")
            return True


def criar_handler(token, separados, portao):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, codigo, dados):
            corpo = json.dumps(dados).encode()
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def _autorizado(self):
            if hmac.compare_digest(self.headers.get("X-Token", ""), token):
                return True
            self._json(401, {"erro": "nao autorizado"})
            return False

        def do_GET(self):
            if self.path in TIPOS:
                arquivo, tipo = TIPOS[self.path]
                corpo = (APP / arquivo).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", tipo)
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)
            elif self.path == "/api/status":
                if self._autorizado():
                    self._json(200, {"estado": portao.status(), "abrirFecharSeparados": separados})
            else:
                self._json(404, {"erro": "nao encontrado"})

        def do_POST(self):
            acao = self.path.removeprefix("/api/")
            if acao not in ("abrir", "fechar", "acionar"):
                return self._json(404, {"erro": "nao encontrado"})
            if not self._autorizado():
                return
            if portao.comando(acao):
                self._json(200, {"ok": True})
            else:
                self._json(429, {"erro": "aguarde"})

        def log_message(self, fmt, *args):
            pass

    return Handler


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--porta", type=int, default=8080)
    p.add_argument("--token", default="teste")
    p.add_argument("--separados", action="store_true", help="simula central com abrir/fechar separados")
    a = p.parse_args()
    srv = ThreadingHTTPServer(("0.0.0.0", a.porta), criar_handler(a.token, a.separados, Portao()))
    print(f"Simulador em http://localhost:{a.porta}  (senha: {a.token})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
