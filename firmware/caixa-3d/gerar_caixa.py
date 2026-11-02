"""Gera os arquivos STL da caixa do AuggeControl para impressão 3D.

Uso:  python gerar_caixa.py   (precisa de: pip install manifold3d trimesh numpy)

Medidas em milímetros. Cabe: ESP32 DevKit V1 (55 x 28), módulo relé 1 canal (50 x 26)
e conversor 12/24V -> 5V USB (40 x 20). Saída dos fios por prensa-cabo PG7.
"""
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import CrossSection, JoinType, Manifold

SEG = 64  # suavidade dos círculos

# ---- medidas principais ----
IN_X, IN_Y, IN_Z = 104.0, 74.0, 40.0   # espaço interno
PAREDE = 2.4                            # paredes e fundo
R_FORA = 6.0                            # raio dos cantos por fora
EXT_X, EXT_Y = IN_X + 2 * PAREDE, IN_Y + 2 * PAREDE
ALTURA = IN_Z + PAREDE

POSTE_R = 3.6        # postes dos parafusos da tampa (M3 x 10, autoatarraxante)
POSTE_FURO = 1.25    # furo de 2,5 mm
POSTE_DX = IN_X / 2 - POSTE_R
POSTE_DY = IN_Y / 2 - POSTE_R

ORELHA_L, ORELHA_C, ORELHA_E = 16.0, 44.0, 4.0  # orelhas de fixação: largura, comprimento, espessura
FURO_FIX = 2.4                                   # furo de 4,8 mm (parafuso 4 mm / bucha 6)

PG7 = 12.6 / 2       # furo do prensa-cabo PG7
PG7_X = 15.0         # posição na parede da frente

TAMPA_E = 2.6
FOLGA = 0.35


def retangulo(x, y, r):
    """Retângulo arredondado centrado (CrossSection)."""
    base = CrossSection.square((x - 2 * r, y - 2 * r), center=True)
    return base.offset(r, JoinType.Round, circular_segments=SEG)


def cilindro(r, h, x=0.0, y=0.0, z=0.0):
    return Manifold.cylinder(h, r, r, SEG).translate((x, y, z))


def corpo():
    fora = retangulo(EXT_X, EXT_Y, R_FORA).extrude(ALTURA)
    dentro = retangulo(IN_X, IN_Y, R_FORA - PAREDE).extrude(IN_Z + 1).translate((0, 0, PAREDE))
    caixa = fora - dentro

    # postes da tampa
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * POSTE_DX, sy * POSTE_DY
            caixa = caixa + cilindro(POSTE_R, IN_Z, x, y, PAREDE)
            caixa = caixa - cilindro(POSTE_FURO, 14, x, y, ALTURA - 13.5)

    # orelhas de fixação (esquerda e direita), com 2 furos cada
    for sx in (-1, 1):
        orelha = retangulo(ORELHA_L + R_FORA, ORELHA_C, 4.0).extrude(ORELHA_E)
        orelha = orelha.translate((sx * (EXT_X / 2 + ORELHA_L / 2 - R_FORA / 2 + 0.01), 0, 0))
        caixa = caixa + orelha
        for y in (-ORELHA_C / 2 + 9, ORELHA_C / 2 - 9):
            caixa = caixa - cilindro(FURO_FIX, ORELHA_E + 2, sx * (EXT_X / 2 + ORELHA_L / 2 - 1), y, -1)

    # furo do prensa-cabo (parede da frente, y negativo)
    furo = Manifold.cylinder(PAREDE * 3, PG7, PG7, SEG).rotate((90, 0, 0)).translate((PG7_X, -EXT_Y / 2 + PAREDE * 1.5, PAREDE + 11))
    caixa = caixa - furo

    # marcações no fundo interno: onde colar cada placa (1 mm de baixo relevo)
    def marca(cx, cy, w, h):
        borda = retangulo(w + 1.6, h + 1.6, 1.5) - retangulo(w, h, 1.0)
        return borda.extrude(0.8).translate((cx, cy, PAREDE))
    caixa = caixa + marca(-16.5, 18.0, 55, 28)    # ESP32 (fundo da caixa = y positivo)
    caixa = caixa + marca(-20.0, -18.0, 50, 26)   # relé
    caixa = caixa + marca(37.0, -6.0, 20, 40)     # conversor
    return caixa


def tampa():
    placa = retangulo(EXT_X, EXT_Y, R_FORA).extrude(TAMPA_E)
    # aba interna que encaixa na boca da caixa (veda chuva)
    aba = (retangulo(IN_X - 2 * FOLGA, IN_Y - 2 * FOLGA, R_FORA - PAREDE)
           - retangulo(IN_X - 2 * FOLGA - 3.2, IN_Y - 2 * FOLGA - 3.2, 1.0)).extrude(3.0)
    aba = aba.translate((0, 0, -3.0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            aba = aba - cilindro(POSTE_R + 0.8, 5, sx * POSTE_DX, sy * POSTE_DY, -4)
    t = placa + aba
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * POSTE_DX, sy * POSTE_DY
            t = t - cilindro(1.7, TAMPA_E + 8, x, y, -5)                       # furo M3
            t = t - Manifold.cylinder(1.6, 1.7, 3.2, SEG).translate((x, y, TAMPA_E - 1.6))  # escareado
    # vira de cabeça para baixo para imprimir com a face lisa na mesa
    return t.rotate((180, 0, 0)).translate((0, 0, TAMPA_E))


def salvar(m, nome):
    mesh = m.to_mesh()
    tm = trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts), process=False)
    destino = Path(__file__).with_name(nome)
    tm.export(destino)
    lim = tm.bounds
    print(f"{nome}: {lim[1][0]-lim[0][0]:.1f} x {lim[1][1]-lim[0][1]:.1f} x {lim[1][2]-lim[0][2]:.1f} mm, "
          f"estanque={tm.is_watertight}, volume={tm.volume/1000:.1f} cm3")


if __name__ == "__main__":
    salvar(corpo(), "caixa-auggecontrol.stl")
    salvar(tampa(), "tampa-auggecontrol.stl")
