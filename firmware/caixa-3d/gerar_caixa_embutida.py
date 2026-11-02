"""Caixa compacta para a placa ESP32 com relé embutido (LC "ESP32 Relay X1", DC 7-60V).

Uso:  python gerar_caixa_embutida.py   (precisa de: pip install manifold3d trimesh numpy)

Medidas em milímetros. A placa (aprox. 60 x 55 mm, confirmar com régua quando chegar)
fica parafusada em 4 pinos com furo; não precisa de conversor nem de fios internos.
Saem 4 fios pelo prensa-cabo PG7: 2 de energia (12/24 V da central) e 2 do relé (botoeira).
"""
from manifold3d import Manifold

from gerar_caixa import SEG, cilindro, retangulo, salvar

# ---- placa ----
PLACA_X, PLACA_Y = 60.0, 55.0      # tamanho da placa
FURO_DX, FURO_DY = 3.5, 3.5        # distância dos furos de fixação até a borda
PINO_H = 5.0                        # altura dos pinos que seguram a placa

# ---- caixa ----
IN_X, IN_Y, IN_Z = 76.0, 64.0, 30.0
PAREDE = 2.4
R_FORA = 5.0
EXT_X, EXT_Y = IN_X + 2 * PAREDE, IN_Y + 2 * PAREDE
ALTURA = IN_Z + PAREDE

POSTE_R, POSTE_FURO = 3.6, 1.25     # 2 postes da tampa, no meio das laterais (M3 x 10)
POSTE_X = IN_X / 2 - POSTE_R

ORELHA_L, ORELHA_C, ORELHA_E = 14.0, 40.0, 4.0
FURO_FIX = 2.4

PG7 = 12.6 / 2
PG7_X, PG7_Z = 2.0, PAREDE + 10.0   # parede da frente (y negativo)

TAMPA_E, FOLGA = 2.6, 0.35
PLACA_CX, PLACA_CY = 0.0, 2.5       # placa um pouco para trás, dá espaço aos fios na frente


def corpo():
    fora = retangulo(EXT_X, EXT_Y, R_FORA).extrude(ALTURA)
    dentro = retangulo(IN_X, IN_Y, R_FORA - PAREDE).extrude(IN_Z + 1).translate((0, 0, PAREDE))
    caixa = fora - dentro

    for sx in (-1, 1):  # postes da tampa
        caixa = caixa + cilindro(POSTE_R, IN_Z, sx * POSTE_X, 0, PAREDE)
        caixa = caixa - cilindro(POSTE_FURO, 14, sx * POSTE_X, 0, ALTURA - 13.5)

    for sx in (-1, 1):  # pinos da placa (parafuso M3 x 6 autoatarraxante)
        for sy in (-1, 1):
            x = PLACA_CX + sx * (PLACA_X / 2 - FURO_DX)
            y = PLACA_CY + sy * (PLACA_Y / 2 - FURO_DY)
            caixa = caixa + cilindro(3.0, PINO_H, x, y, PAREDE)
            caixa = caixa - cilindro(1.25, PINO_H + 1, x, y, PAREDE + 0.8)

    for sx in (-1, 1):  # orelhas de fixação no motor
        orelha = retangulo(ORELHA_L + R_FORA, ORELHA_C, 4.0).extrude(ORELHA_E)
        caixa = caixa + orelha.translate((sx * (EXT_X / 2 + ORELHA_L / 2 - R_FORA / 2 + 0.01), 0, 0))
        for y in (-ORELHA_C / 2 + 8, ORELHA_C / 2 - 8):
            caixa = caixa - cilindro(FURO_FIX, ORELHA_E + 2, sx * (EXT_X / 2 + ORELHA_L / 2 - 1), y, -1)

    furo = Manifold.cylinder(PAREDE * 3, PG7, PG7, SEG).rotate((90, 0, 0)).translate((PG7_X, -EXT_Y / 2 + PAREDE * 1.5, PG7_Z))
    return caixa - furo


def tampa():
    placa = retangulo(EXT_X, EXT_Y, R_FORA).extrude(TAMPA_E)
    aba = (retangulo(IN_X - 2 * FOLGA, IN_Y - 2 * FOLGA, R_FORA - PAREDE)
           - retangulo(IN_X - 2 * FOLGA - 3.2, IN_Y - 2 * FOLGA - 3.2, 1.0)).extrude(3.0).translate((0, 0, -3.0))
    for sx in (-1, 1):
        aba = aba - cilindro(POSTE_R + 0.8, 5, sx * POSTE_X, 0, -4)
    t = placa + aba
    for sx in (-1, 1):
        t = t - cilindro(1.7, TAMPA_E + 8, sx * POSTE_X, 0, -5)
        t = t - Manifold.cylinder(1.6, 1.7, 3.2, SEG).translate((sx * POSTE_X, 0, TAMPA_E - 1.6))
    return t.rotate((180, 0, 0)).translate((0, 0, TAMPA_E))


if __name__ == "__main__":
    salvar(corpo(), "caixa-embutida.stl")
    salvar(tampa(), "tampa-embutida.stl")
