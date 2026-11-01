#!/usr/bin/env python3
"""Embute os arquivos de app/ em firmware/portao/pagina.h.

Rode sempre que alterar algo em app/:
    python3 tools/gerar_header.py
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
APP = RAIZ / "app"
SAIDA = RAIZ / "firmware" / "portao" / "pagina.h"

ARQUIVOS = [
    ("PAGINA_HTML", "index.html"),
    ("MANIFEST_JSON", "manifest.json"),
    ("ICONE_SVG", "icon.svg"),
]
DELIM = "PORTAO_RAW"


def main() -> None:
    partes = [
        "// ARQUIVO GERADO por tools/gerar_header.py - não edite à mão.",
        "// Edite os arquivos em app/ e rode o script novamente.",
        "#pragma once",
        "#include <pgmspace.h>",
        "",
    ]
    for nome, arquivo in ARQUIVOS:
        conteudo = (APP / arquivo).read_text(encoding="utf-8")
        if f"){DELIM}\"" in conteudo:
            raise SystemExit(f"{arquivo} contém o delimitador {DELIM}")
        partes.append(f'const char {nome}[] PROGMEM = R"{DELIM}({conteudo}){DELIM}";')
        partes.append("")
    SAIDA.write_text("\n".join(partes), encoding="utf-8")
    print(f"Gerado {SAIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
