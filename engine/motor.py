#!/usr/bin/env python3
"""
Motor de inteligencia de inversión — perfil moderado.

Descarga precios reales (Yahoo Finance), calcula señales diarias y semanales,
el portafolio objetivo táctico, métricas de riesgo, escenarios y pruebas de
estrés históricas, y escribe los informes que consume el dashboard en site/.

Uso:
    python3 engine/motor.py            # informe al último cierre
    python3 engine/motor.py --intradia # incluye la vela parcial de hoy

Esto NO es asesoría financiera: son reglas cuantitativas transparentes para
apoyar tu decisión. Tú decides y ejecutas en Racional.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "portafolio.json"
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "site" / "data"
ARCHIVO = OUT / "archivo"
NY = ZoneInfo("America/New_York")

MACRO = {
    "^VIX": {"nombre": "VIX (miedo del mercado)", "unidad": "pts", "dec": 2},
    "^TNX": {"nombre": "Tasa Tesoro EE.UU. 10 años", "unidad": "%", "dec": 3},
    "DX-Y.NYB": {"nombre": "Índice dólar (DXY)", "unidad": "pts", "dec": 2},
    "CLP=X": {"nombre": "Dólar en Chile (USD/CLP)", "unidad": "CLP", "dec": 2},
    "HG=F": {"nombre": "Cobre (USD/lb)", "unidad": "USD", "dec": 3},
    "CL=F": {"nombre": "Petróleo WTI (USD/bbl)", "unidad": "USD", "dec": 2},
    "GC=F": {"nombre": "Oro (USD/oz)", "unidad": "USD", "dec": 1},
}

# Ventanas históricas reales para pruebas de estrés
HISTORICOS = [
    {"id": "covid", "nombre": "Crash COVID", "desde": "2020-02-19", "hasta": "2020-03-23",
     "descripcion": "Pandemia: el S&P 500 cayó ~34% en 5 semanas."},
    {"id": "inflacion2022", "nombre": "Bear market 2022", "desde": "2022-01-03", "hasta": "2022-10-12",
     "descripcion": "Inflación y alzas de tasas de la Fed: caen acciones y bonos a la vez."},
    {"id": "svb", "nombre": "Crisis bancaria SVB", "desde": "2023-03-08", "hasta": "2023-03-13",
     "descripcion": "Quiebra de Silicon Valley Bank: pánico bancario breve."},
    {"id": "carry2024", "nombre": "Desarme carry yen", "desde": "2024-07-16", "hasta": "2024-08-05",
     "descripcion": "Venta forzada global por el yen; el VIX tocó 65 intradía."},
    {"id": "aranceles2025", "nombre": "Shock aranceles 2025", "desde": "2025-04-02", "hasta": "2025-04-08",
     "descripcion": "Anuncio de aranceles de EE.UU.: caída de ~12% en 4 sesiones."},
]

# Escenarios hipotéticos (factores: S&P 500 %, tasas pb, oro %, cobre %, USD/CLP %)
ESCENARIOS = [
    {"id": "correccion", "nombre": "Corrección del S&P 500", "descripcion": "Caída típica de 10% que ocurre ~1 vez al año.",
     "f": {"spx": -10, "tasas_pb": -25, "oro": 2, "cobre": -5, "usdclp": 4}},
    {"id": "bear", "nombre": "Mercado bajista", "descripcion": "Caída de 25% en acciones, como 2022 o 2018-19.",
     "f": {"spx": -25, "tasas_pb": -75, "oro": 5, "cobre": -15, "usdclp": 10}},
    {"id": "tasas", "nombre": "Shock de tasas +100 pb", "descripcion": "Inflación sorpresa: la tasa a 10 años sube 1 punto.",
     "f": {"spx": -7, "tasas_pb": 100, "oro": -4, "cobre": -3, "usdclp": 3}},
    {"id": "recesion", "nombre": "Recesión en EE.UU.", "descripcion": "Acciones -20%, la Fed baja tasas, el oro sube, el peso se debilita.",
     "f": {"spx": -20, "tasas_pb": -150, "oro": 10, "cobre": -20, "usdclp": 12}},
    {"id": "rally", "nombre": "Rally alcista", "descripcion": "Aterrizaje suave: acciones +15% en pocos meses.",
     "f": {"spx": 15, "tasas_pb": -25, "oro": -3, "cobre": 8, "usdclp": -4}},
    {"id": "pesofuerte", "nombre": "Peso chileno fuerte", "descripcion": "El dólar cae 10% en Chile: tus activos en USD valen menos en CLP.",
     "f": {"spx": 3, "tasas_pb": 0, "oro": 2, "cobre": 10, "usdclp": -10}},
    {"id": "cobre", "nombre": "Desplome del cobre", "descripcion": "China se frena: cobre -20%, golpea a Chile y emergentes.",
     "f": {"spx": -4, "tasas_pb": -10, "oro": 0, "cobre": -20, "usdclp": 7}},
]


# ----------------------------------------------------------------------------- datos

def _safe(sym: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in sym)


def _parse(res: dict) -> pd.DataFrame:
    ts = res.get("timestamp") or []
    if not ts:
        return pd.DataFrame()
    off = res["meta"].get("gmtoffset", 0) or 0
    q = res["indicators"]["quote"][0]
    adj = (res["indicators"].get("adjclose") or [{}])[0].get("adjclose") or q["close"]
    idx = pd.to_datetime(np.array(ts, dtype="int64") + off, unit="s").normalize()
    df = pd.DataFrame({"open": q["open"], "high": q["high"], "low": q["low"],
                       "close_raw": q["close"], "close": adj, "volume": q.get("volume")}, index=idx, dtype="float64")
    df = df[~df.index.duplicated(keep="last")].dropna(subset=["close_raw", "close"])
    f = df["close"] / df["close_raw"]
    for c in ("open", "high", "low"):
        df[c] = (df[c] * f).fillna(df["close"])
    return df


def fetch(sym: str, rng: str = "10y") -> tuple[pd.DataFrame | None, bool]:
    """Devuelve (df, desde_cache)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cf = CACHE / f"{_safe(sym)}.json"
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(sym)}"
           f"?range={rng}&interval=1d&includeAdjustedClose=true")
    for intento in range(3):
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 (inversion-dashboard)"})
            with urlopen(req, timeout=25) as r:
                raw = json.load(r)
            res = raw["chart"]["result"][0]
            cf.write_text(json.dumps(res))
            return _parse(res), False
        except Exception:  # noqa: BLE001 — reintento y luego caché
            time.sleep(1.5 * (intento + 1))
    if cf.exists():
        return _parse(json.loads(cf.read_text())), True
    return None, False


# ----------------------------------------------------------------------------- indicadores

def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    au = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    ad = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + au / ad.replace(0, np.nan))


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    pc = df["close"].shift()
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def macd_hist(c: pd.Series) -> pd.Series:
    m = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    return m - m.ewm(span=9, adjust=False).mean()


def score_diario(c: pd.Series) -> pd.Series:
    """Puntaje de corto plazo (-100..100): tendencia 20d, pendiente, MACD, RSI, rupturas."""
    s20 = c.rolling(20).mean()
    pend = s20 / s20.shift(5) - 1
    h = macd_hist(c)
    r = rsi(c)
    hi20 = c.rolling(20).max().shift(1)
    lo20 = c.rolling(20).min().shift(1)
    s = (np.where(c > s20, 25, -25) + np.where(pend > 0, 15, -15) + np.where(h > 0, 20, -20)
         + np.where((h > 0) & (h.shift(3) <= 0), 10, 0) - np.where((h < 0) & (h.shift(3) >= 0), 10, 0)
         + np.select([r < 30, r > 70, r >= 50], [20, -20, 10], default=-10)
         + np.where(c >= hi20, 10, 0) - np.where(c <= lo20, 10, 0))
    out = pd.Series(np.clip(s, -100, 100), index=c.index, dtype="float64")
    out[s20.isna()] = np.nan
    return out


def score_semanal_base(c: pd.Series) -> pd.Series:
    """Puntaje de mediano plazo sin el ranking de momentum (-75..75)."""
    s50 = c.rolling(50).mean()
    s200 = c.rolling(200, min_periods=150).mean()
    w = c.resample("W-FRI").last()
    wr = rsi(w).reindex(c.index, method="ffill")
    r63 = c / c.shift(63) - 1
    s = (np.where(c > s200, 30, -30) + np.where(s50 > s200, 20, -20)
         + np.select([wr > 55, wr < 45], [15, -15], default=0) + np.where(r63 > 0, 10, -10))
    out = pd.Series(s, index=c.index, dtype="float64")
    out[s200.isna()] = np.nan
    return out


def etiqueta(comb: float | None) -> str:
    if comb is None or (isinstance(comb, float) and math.isnan(comb)):
        return "SIN DATOS"
    if comb >= 45:
        return "COMPRAR"
    if comb >= 15:
        return "ACUMULAR"
    if comb > -15:
        return "MANTENER"
    if comb > -45:
        return "REDUCIR"
    return "VENDER"


# ----------------------------------------------------------------------------- utilidades

def num(x, n=4):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, n)


def limpiar(o):
    if isinstance(o, dict):
        return {k: limpiar(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [limpiar(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return num(o, 6)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def pct(x, dec=1, signo=True):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "s/d"
    return f"{x * 100:+.{dec}f}%" if signo else f"{x * 100:.{dec}f}%"


# ----------------------------------------------------------------------------- motor

class Motor:
    def __init__(self, cfg: dict, intradia: bool):
        self.cfg = cfg
        self.reglas = cfg["reglas"]
        self.univ = cfg["universo"]
        self.tick = [u["ticker"] for u in self.univ]
        self.info = {u["ticker"]: u for u in self.univ}
        self.intradia = intradia
        self.avisos: list[str] = []

    # --- carga
    def cargar(self):
        syms = self.tick + list(MACRO)
        with ThreadPoolExecutor(max_workers=8) as ex:
            res = dict(zip(syms, ex.map(fetch, syms)))
        self.raw = {}
        for s, (df, cache) in res.items():
            if df is None or df.empty:
                self.avisos.append(f"Sin datos para {s}; se omite.")
                continue
            if cache:
                self.avisos.append(f"{s}: sin conexión, se usaron datos en caché.")
            self.raw[s] = df
        if "VOO" not in self.raw:
            sys.exit("ERROR: no se pudo descargar VOO (referencia). Revisa tu conexión.")
        ahora = dt.datetime.now(NY)
        if not self.intradia and ahora.time() < dt.time(16, 15):
            hoy = pd.Timestamp(ahora.date())
            for s, df in self.raw.items():
                if len(df) and df.index[-1] >= hoy:
                    self.raw[s] = df[df.index < hoy]
        self.tick = [t for t in self.tick if t in self.raw]
        cal = self.raw["VOO"].index
        self.cal = cal

        def alinear(s: pd.Series) -> pd.Series:
            return s.reindex(s.index.union(cal)).ffill(limit=5).reindex(cal)

        self.P = pd.DataFrame({s: alinear(df["close"]) for s, df in self.raw.items()})
        self.Praw = pd.DataFrame({s: alinear(df["close_raw"]) for s, df in self.raw.items()})
        self.R = self.P[self.tick].pct_change(fill_method=None)

    # --- puntajes
    def puntajes(self):
        self.SD = pd.DataFrame({t: score_diario(self.P[t].dropna()).reindex(self.cal) for t in self.tick})
        self.SWB = pd.DataFrame({t: score_semanal_base(self.P[t].dropna()).reindex(self.cal) for t in self.tick})
        self.MOM = self.P[self.tick].shift(21) / self.P[self.tick].shift(252) - 1
        riesgosos = [t for t in self.tick if self.info[t]["clase"] != "Liquidez"]
        rank = self.MOM[riesgosos].rank(axis=1, pct=True)
        comp = ((rank - 0.5) * 50).reindex(columns=self.tick).fillna(0)
        self.SW = (self.SWB + comp).clip(-100, 100)
        self.SC = 0.35 * self.SD + 0.65 * self.SW
        self.VOL60 = self.R.rolling(60).std() * math.sqrt(252)

    # --- régimen de mercado
    def regimen(self, i: int) -> dict:
        p = self.P["VOO"]
        s200 = p.rolling(200).mean().iloc[i]
        s50 = p.rolling(50).mean().iloc[i]
        voo = p.iloc[i]
        vix = self.P["^VIX"].iloc[i] if "^VIX" in self.P else np.nan
        rv = [t for t in self.tick if self.info[t]["clase"].startswith("RV") or self.info[t]["bloque"] == "satelite"]
        sma50 = self.P[rv].rolling(50).mean().iloc[i]
        amplitud = float((self.P[rv].iloc[i] > sma50).mean())
        pts = (1 if voo > s200 else -1) + (1 if s50 > s200 else -1)
        if not math.isnan(vix):
            pts += 1 if vix < 18 else (-2 if vix > 32 else (-1 if vix > 25 else 0))
        pts += 1 if amplitud > 0.6 else (-1 if amplitud < 0.4 else 0)
        nombre = "Favorable" if pts >= 2 else ("Defensivo" if pts <= -1 else "Neutral")
        return {"nombre": nombre, "puntos": pts, "vix": vix, "amplitud": amplitud,
                "voo_vs_sma200": voo / s200 - 1, "sma50_sobre_sma200": bool(s50 > s200)}

    # --- portafolio objetivo táctico
    def objetivo(self, i: int, reg: dict) -> dict:
        tilt_max = self.reglas["tilt_max"]
        sat_cfg = self.reglas["satelite"]
        w: dict[str, float] = {}
        razones: dict[str, str] = {}
        for t in self.tick:
            u = self.info[t]
            if u["bloque"] != "nucleo":
                continue
            ws = self.SW[t].iloc[i]
            tilt = 0.0 if math.isnan(ws) else float(np.clip(ws / 75, -1, 1)) * tilt_max
            if reg["nombre"] == "Defensivo" and u["clase"].startswith("RV"):
                tilt -= 0.15
            w[t] = u["peso"] * (1 + tilt)
            razones[t] = f"estratégico {u['peso']*100:.0f}% · ajuste táctico {tilt*100:+.0f}%"
        sats = [t for t in self.tick if self.info[t]["bloque"] == "satelite"]
        cand = [t for t in sats if self.SC[t].iloc[i] >= 20 and self.SW[t].iloc[i] > 0]
        cand = sorted(cand, key=lambda t: -self.SC[t].iloc[i])[: sat_cfg["n_max"]]
        usado = 0.0
        if cand:
            inv = {t: 1 / max(self.VOL60[t].iloc[i], 0.05) for t in cand}
            tot = sum(inv.values())
            for t in cand:
                w[t] = min(sat_cfg["peso_total"] * inv[t] / tot, sat_cfg["max_por_accion"])
                usado += w[t]
                razones[t] = f"satélite top momentum · puntaje {self.SC[t].iloc[i]:.0f}"
        sobrante = sat_cfg["peso_total"] - usado
        if sobrante > 0 and reg["nombre"] == "Favorable" and "VOO" in w:
            w["VOO"] += sobrante * 0.5
            razones["VOO"] += f" · +{sobrante*50:.1f}pp del bloque satélite"
        # Límites de renta variable para perfil moderado
        es_rv = lambda k: self.info[k]["clase"].startswith("RV") or self.info[k]["bloque"] == "satelite"
        rv = sum(v for k, v in w.items() if es_rv(k))
        rv_max, rv_min = self.reglas.get("rv_max", 0.70), self.reglas.get("rv_min", 0.40)
        if rv > rv_max:
            f = rv_max / rv
            w = {k: (v * f if es_rv(k) else v) for k, v in w.items()}
            razones["BIL"] = f"incluye {(rv-rv_max)*100:.1f}pp por techo de renta variable ({rv_max:.0%})"
        elif rv < rv_min and rv > 0:
            f = rv_min / rv
            w = {k: (v * f if es_rv(k) else v) for k, v in w.items()}
        bil = 1 - sum(w.values())
        if bil < 0.02:
            esc = 0.98 / sum(w.values())
            w = {k: v * esc for k, v in w.items()}
            bil = 0.02
        if "BIL" in self.tick:
            w["BIL"] = bil
            razones["BIL"] = razones.get("BIL", "") + (" · " if "BIL" in razones else "") + "liquidez residual (mín. 2%)"
        return {"pesos": {k: v for k, v in w.items() if v > 1e-6}, "razones": razones}

    # --- análisis por activo
    def activo(self, t: str) -> dict:
        df = self.raw[t].reindex(self.cal).ffill(limit=5)
        c = self.P[t]
        i = -1
        a = atr(df.dropna())
        a = a.reindex(self.cal).ffill()
        u = self.info[t]
        hi22 = c.rolling(22).max()
        s200 = c.rolling(200).mean().iloc[i]
        if u["bloque"] == "satelite":
            # Stop dinámico tipo chandelier: máximo de 22 días menos 3 ATR
            stop, tipo_stop = hi22.iloc[i] - 3 * a.iloc[i], "chandelier 3×ATR"
        elif u["clase"] == "Liquidez" or math.isnan(s200):
            stop, tipo_stop = np.nan, None
        else:
            # Núcleo: nivel de revisión = quiebre de tendencia (3% bajo la media de 200 días)
            stop, tipo_stop = 0.97 * s200, "revisión: 3% bajo media 200d"
        precio = float(self.Praw[t].iloc[i])
        r = self.R[t]
        r21 = (c / c.shift(21) - 1).iloc[-1260:].dropna()
        ytd0 = c[c.index < pd.Timestamp(self.cal[-1].year, 1, 1)]
        out = {
            "ticker": t, "nombre": u["nombre"], "clase": u["clase"], "bloque": u["bloque"],
            "precio": precio,
            "r1d": c.iloc[i] / c.iloc[i - 1] - 1, "r5d": c.iloc[i] / c.iloc[i - 5] - 1,
            "r21d": c.iloc[i] / c.iloc[i - 21] - 1, "r63d": c.iloc[i] / c.iloc[i - 63] - 1,
            "r252d": c.iloc[i] / c.iloc[i - 252] - 1 if c.iloc[:-252].notna().any() else None,
            "ytd": c.iloc[i] / ytd0.iloc[-1] - 1 if len(ytd0) else None,
            "rsi": rsi(c.dropna()).iloc[-1],
            "sma20": c.rolling(20).mean().iloc[i], "sma50": c.rolling(50).mean().iloc[i],
            "sma200": c.rolling(200).mean().iloc[i],
            "atr": a.iloc[i], "atr_pct": a.iloc[i] / c.iloc[i],
            "stop": stop * precio / c.iloc[i], "stop_dist": 1 - stop / c.iloc[i],
            "stop_activo": bool(c.iloc[i] < stop) if not math.isnan(stop) else False, "tipo_stop": tipo_stop,
            "vol20": r.iloc[-20:].std() * math.sqrt(252), "vol252": r.iloc[-252:].std() * math.sqrt(252),
            "vol_d": r.iloc[-60:].std(),
            "dd52": c.iloc[i] / c.iloc[-252:].max() - 1,
            "p21": {k: float(np.percentile(r21, q)) for k, q in (("p5", 5), ("p25", 25), ("p50", 50), ("p75", 75), ("p95", 95))} if len(r21) > 100 else None,
            "sd": self.SD[t].iloc[i], "sw": self.SW[t].iloc[i], "sc": self.SC[t].iloc[i],
            "sc_ayer": self.SC[t].iloc[i - 1], "sc_sem": self.SC[t].iloc[i - 5],
            "mom12_1": self.MOM[t].iloc[i],
        }
        out["accion"] = etiqueta(out["sc"])
        out["accion_ayer"] = etiqueta(out["sc_ayer"])
        out["accion_sem"] = etiqueta(out["sc_sem"])
        out["betas"] = self.betas.get(t)
        out["por_que"] = self.explicar(t)
        return out

    def explicar(self, t: str) -> list[str]:
        c = self.P[t]
        x = []
        s50, s200 = c.rolling(50).mean().iloc[-1], c.rolling(200).mean().iloc[-1]
        if not math.isnan(s200):
            x.append(("Sobre" if c.iloc[-1] > s200 else "Bajo") + f" su media de 200 días ({c.iloc[-1]/s200-1:+.1%}): tendencia de fondo "
                     + ("alcista." if c.iloc[-1] > s200 else "bajista."))
        if not math.isnan(s50) and not math.isnan(s200):
            x.append("Media 50d " + ("sobre" if s50 > s200 else "bajo") + " media 200d (" + ("cruce dorado" if s50 > s200 else "cruce de la muerte") + ").")
        rr = rsi(c.dropna()).iloc[-1]
        if rr > 70:
            x.append(f"RSI {rr:.0f}: sobrecomprado, riesgo de toma de utilidades.")
        elif rr < 30:
            x.append(f"RSI {rr:.0f}: sobrevendido, posible rebote técnico.")
        else:
            x.append(f"RSI {rr:.0f}: zona neutral.")
        h = macd_hist(c.dropna())
        x.append("MACD " + ("positivo: impulso de corto plazo al alza." if h.iloc[-1] > 0 else "negativo: impulso de corto plazo a la baja."))
        m = self.MOM[t].iloc[-1]
        if not math.isnan(m):
            x.append(f"Momentum 12-1 meses: {m:+.1%}.")
        return x

    # --- betas de factores (regresión semanal 3 años)
    def calcular_betas(self):
        W = self.P.resample("W-FRI").last().iloc[-157:]
        X = pd.DataFrame({
            "spx": W["VOO"].pct_change(),
            "tasas": W["^TNX"].diff() if "^TNX" in W else 0.0,  # puntos porcentuales
            "oro": W["GLD"].pct_change() if "GLD" in W else 0.0,
            "cobre": W["HG=F"].pct_change() if "HG=F" in W else 0.0,
        })
        self.betas = {}
        for t in self.tick:
            y = W[t].pct_change()
            d = pd.concat([y.rename("y"), X], axis=1).dropna()
            if len(d) < 40:
                continue
            A = np.column_stack([np.ones(len(d)), d[["spx", "tasas", "oro", "cobre"]].values])
            coef, *_ = np.linalg.lstsq(A, d["y"].values, rcond=None)
            pred = A @ coef
            r2 = 1 - ((d["y"] - pred) ** 2).sum() / ((d["y"] - d["y"].mean()) ** 2).sum()
            b = dict(zip(["spx", "tasas", "oro", "cobre"], coef[1:]))
            if t == "VOO":
                b = {"spx": 1.0, "tasas": 0.0, "oro": 0.0, "cobre": 0.0}
            b["r2"] = r2
            self.betas[t] = b

    def impacto_escenario(self, pesos: dict, f: dict) -> dict:
        por = {}
        for t, w in pesos.items():
            b = self.betas.get(t, {"spx": 0, "tasas": 0, "oro": 0, "cobre": 0})
            r = b["spx"] * f["spx"] / 100 + b["tasas"] * f["tasas_pb"] / 100 + b["oro"] * f["oro"] / 100 + b["cobre"] * f["cobre"] / 100
            por[t] = r
        usd = sum(pesos[t] * por[t] for t in pesos)
        clp = (1 + usd) * (1 + f["usdclp"] / 100) - 1
        return {"usd": usd, "clp": clp, "por_activo": por}

    def historicos(self):
        out = []
        for h in HISTORICOS:
            d0, d1 = pd.Timestamp(h["desde"]), pd.Timestamp(h["hasta"])
            P0 = self.P[self.P.index <= d0]
            P1 = self.P[self.P.index <= d1]
            if P0.empty or P1.empty:
                continue
            ret = {}
            for t in self.tick + ["CLP=X", "^VIX"]:
                if t in self.P:
                    a, b = P0[t].iloc[-1], P1[t].iloc[-1]
                    ret[t] = None if (pd.isna(a) or pd.isna(b)) else b / a - 1
            out.append({**h, "ret": ret})
        return out

    # --- riesgo del portafolio objetivo
    def riesgo(self, pesos: dict) -> dict:
        R = self.R.iloc[-756:].fillna(0)
        w = pd.Series(pesos).reindex(R.columns).fillna(0)
        pr = R @ w
        pr2 = pr.iloc[-504:]
        r5 = (1 + pr2).rolling(5).apply(np.prod, raw=True).dropna() - 1
        r21 = (1 + pr2).rolling(21).apply(np.prod, raw=True).dropna() - 1
        idx = (1 + pr).cumprod() * 100
        voo = (1 + R["VOO"]).cumprod() * 100
        sesenta = (1 + 0.6 * R["VOO"] + 0.4 * R.get("BND", 0)).cumprod() * 100

        def met(s: pd.Series):
            años = len(s) / 252
            rets = s.pct_change().dropna()
            return {"cagr": (s.iloc[-1] / 100) ** (1 / años) - 1, "vol": rets.std() * math.sqrt(252),
                    "max_dd": float((s / s.cummax() - 1).min()),
                    "sharpe": (rets.mean() * 252 - 0.04) / (rets.std() * math.sqrt(252))}

        paso = 3
        return {
            "vol_anual": pr.iloc[-252:].std() * math.sqrt(252),
            "var95_1d": -np.percentile(pr2, 5), "cvar95_1d": -pr2[pr2 <= np.percentile(pr2, 5)].mean(),
            "var95_5d": -np.percentile(r5, 5), "var95_21d": -np.percentile(r21, 5),
            "peor_mes": float(r21.min()), "mejor_mes": float(r21.max()),
            "backtest": {
                "fechas": [d.strftime("%Y-%m-%d") for d in idx.index[::paso]],
                "modelo": [num(v, 2) for v in idx.values[::paso]],
                "voo": [num(v, 2) for v in voo.values[::paso]],
                "sesenta": [num(v, 2) for v in sesenta.values[::paso]],
                "met": {"modelo": met(idx), "voo": met(voo), "sesenta": met(sesenta)},
            },
        }

    # --- macro
    def macro(self) -> list[dict]:
        out = []
        for s, m in MACRO.items():
            if s not in self.P:
                continue
            p = self.Praw[s].dropna()
            out.append({"simbolo": s, **m, "valor": p.iloc[-1],
                        "c1d": p.iloc[-1] / p.iloc[-2] - 1, "c5d": p.iloc[-1] / p.iloc[-6] - 1,
                        "c21d": p.iloc[-1] / p.iloc[-22] - 1,
                        "dif1d": p.iloc[-1] - p.iloc[-2], "dif5d": p.iloc[-1] - p.iloc[-6],
                        "serie": [num(v, 4) for v in p.iloc[-90:].values]})
        return out

    # --- narrativa
    def narrativa_diaria(self, reg, act, mac, alertas) -> list[dict]:
        m = {x["simbolo"]: x for x in mac}
        n = []
        vix = reg["vix"]
        n.append({"tipo": "regimen", "texto":
                  f"Régimen de mercado: {reg['nombre'].upper()}. El S&P 500 (VOO) está {pct(reg['voo_vs_sma200'])} respecto de su media de 200 días, "
                  f"el VIX en {vix:.1f} y {reg['amplitud']:.0%} de las acciones del universo sobre su media de 50 días."})
        voo = next(a for a in act if a["ticker"] == "VOO")
        n.append({"tipo": "mercado", "texto": f"En la sesión del {self.cal[-1]:%d-%m-%Y} el S&P 500 se movió {pct(voo['r1d'], 2)} ({pct(voo['r5d'])} en la semana, {pct(voo['ytd'])} en el año)."})
        if "CLP=X" in m:
            x = m["CLP=X"]
            efecto = "aumenta" if x["c1d"] > 0 else "reduce"
            n.append({"tipo": "fx", "texto": f"Dólar en Chile: ${x['valor']:.1f} ({pct(x['c1d'], 2)} día, {pct(x['c5d'])} semana). "
                      f"Un movimiento así {efecto} el valor en pesos de todo lo que tienes en USD en Racional."})
        if "^TNX" in m:
            x = m["^TNX"]
            n.append({"tipo": "tasas", "texto": f"Tasa a 10 años EE.UU.: {x['valor']:.2f}% ({x['dif1d']*100:+.0f} pb día, {x['dif5d']*100:+.0f} pb semana). "
                      + ("Tasas al alza presionan bonos (BND, IEF) y acciones de crecimiento." if x["dif5d"] > 0.05 else
                         "Tasas a la baja favorecen a los bonos." if x["dif5d"] < -0.05 else "Tasas estables.")})
        if "HG=F" in m:
            x = m["HG=F"]
            if abs(x["c5d"]) > 0.03:
                n.append({"tipo": "cobre", "texto": f"Cobre {pct(x['c5d'])} en la semana: relevante para ECH, SQM y el peso chileno."})
        movs = sorted([a for a in act if a["r1d"] is not None], key=lambda a: a["r1d"])
        n.append({"tipo": "movers", "texto": "Mayores alzas: " + ", ".join(f"{a['ticker']} {pct(a['r1d'])}" for a in movs[-3:][::-1])
                  + ". Mayores caídas: " + ", ".join(f"{a['ticker']} {pct(a['r1d'])}" for a in movs[:3]) + "."})
        cambios = [a for a in act if a["accion"] != a["accion_ayer"]]
        if cambios:
            n.append({"tipo": "senales", "texto": "Cambios de señal: " + "; ".join(f"{a['ticker']} {a['accion_ayer']} → {a['accion']}" for a in cambios) + "."})
        else:
            n.append({"tipo": "senales", "texto": "Sin cambios de señal respecto de la sesión anterior."})
        for al in alertas[:4]:
            n.append({"tipo": "alerta", "texto": al["texto"]})
        return n

    def narrativa_semanal(self, reg, reg5, act, obj, obj5, esc, mac) -> list[dict]:
        n = []
        n.append({"tipo": "regimen", "texto": f"Régimen: {reg5['nombre']} hace una semana → {reg['nombre']} hoy (puntos {reg5['puntos']} → {reg['puntos']})."})
        clases: dict[str, list] = {}
        for a in act:
            clases.setdefault(a["clase"], []).append(a["r5d"])
        txt = ", ".join(f"{k} {pct(float(np.mean(v)))}" for k, v in clases.items())
        n.append({"tipo": "clases", "texto": f"Rendimiento semanal promedio por clase: {txt}."})
        top = sorted(act, key=lambda a: -(a["sc"] or -999))[:3]
        bot = sorted(act, key=lambda a: (a["sc"] if a["sc"] is not None else 999))[:3]
        n.append({"tipo": "ranking", "texto": "Más fuertes (puntaje combinado): " + ", ".join(f"{a['ticker']} {a['sc']:.0f}" for a in top)
                  + ". Más débiles: " + ", ".join(f"{a['ticker']} {a['sc']:.0f}" for a in bot) + "."})
        cambios = []
        for t in sorted(set(obj["pesos"]) | set(obj5["pesos"])):
            a, b = obj5["pesos"].get(t, 0), obj["pesos"].get(t, 0)
            if abs(b - a) >= 0.005:
                cambios.append(f"{t} {a*100:.1f}% → {b*100:.1f}%")
        n.append({"tipo": "asignacion", "texto": ("Cambios en el portafolio objetivo: " + "; ".join(cambios) + ".") if cambios
                  else "El portafolio objetivo no cambió de forma relevante esta semana."})
        rv = sum(w for t, w in obj["pesos"].items() if self.info[t]["clase"].startswith("RV") or self.info[t]["bloque"] == "satelite")
        n.append({"tipo": "mezcla", "texto": f"Mezcla objetivo: {rv:.0%} renta variable, "
                  f"{sum(w for t, w in obj['pesos'].items() if self.info[t]['clase']=='Renta fija'):.0%} renta fija, "
                  f"{obj['pesos'].get('GLD', 0):.0%} oro, {obj['pesos'].get('BIL', 0):.0%} liquidez."})
        peor = min(esc, key=lambda e: e["impacto"]["clp"])
        n.append({"tipo": "estres", "texto": f"Escenario más dañino para el portafolio objetivo: {peor['nombre']} ({pct(peor['impacto']['clp'])} en CLP). Revisa la pestaña Escenarios para dimensionarlo en pesos."})
        return n

    def alertas(self, act, mac) -> list[dict]:
        al = []
        for a in act:
            if a["stop_activo"]:
                if a["bloque"] == "satelite":
                    al.append({"nivel": "critico", "ticker": a["ticker"], "texto": f"{a['ticker']} perforó su stop dinámico (${a['stop']:.2f}). Si la tienes, la regla es cerrar la posición."})
                else:
                    al.append({"nivel": "serio", "ticker": a["ticker"], "texto": f"{a['ticker']} quebró su tendencia de largo plazo (bajo ${a['stop']:.2f}, 3% bajo su media de 200 días). Revisa el peso en la reunión semanal."})
            if a["rsi"] is not None and a["rsi"] > 75:
                al.append({"nivel": "advertencia", "ticker": a["ticker"], "texto": f"{a['ticker']} muy sobrecomprado (RSI {a['rsi']:.0f}): evita comprar de golpe, escalona."})
            if a["rsi"] is not None and a["rsi"] < 25:
                al.append({"nivel": "advertencia", "ticker": a["ticker"], "texto": f"{a['ticker']} muy sobrevendido (RSI {a['rsi']:.0f}): posible rebote, pero confirma tendencia."})
            if a["vol20"] and a["vol252"] and a["vol20"] > 1.6 * a["vol252"]:
                al.append({"nivel": "advertencia", "ticker": a["ticker"], "texto": f"{a['ticker']} con volatilidad elevada ({a['vol20']:.0%} vs {a['vol252']:.0%} normal): reduce tamaño de órdenes."})
        m = {x["simbolo"]: x for x in mac}
        if "^VIX" in m and (m["^VIX"]["c1d"] > 0.15 or m["^VIX"]["valor"] > 25):
            al.append({"nivel": "serio", "ticker": "^VIX", "texto": f"VIX en {m['^VIX']['valor']:.1f} ({pct(m['^VIX']['c1d'])}): estrés elevado, prioriza no aumentar riesgo."})
        if "CLP=X" in m and abs(m["CLP=X"]["c1d"]) > 0.01:
            al.append({"nivel": "advertencia", "ticker": "CLP=X", "texto": f"USD/CLP se movió {pct(m['CLP=X']['c1d'])} en un día: si vas a convertir pesos, considera hacerlo en partes."})
        orden = {"critico": 0, "serio": 1, "advertencia": 2}
        return sorted(al, key=lambda x: orden[x["nivel"]])

    # --- informe completo
    def construir(self) -> dict:
        self.cargar()
        self.puntajes()
        self.calcular_betas()
        reg, reg1, reg5 = self.regimen(-1), self.regimen(-2), self.regimen(-6)
        obj, obj5 = self.objetivo(-1, reg), self.objetivo(-6, reg5)
        act = [self.activo(t) for t in self.tick]
        mac = self.macro()
        alertas = self.alertas(act, mac)
        esc = [{**e, "impacto": self.impacto_escenario(obj["pesos"], e["f"])} for e in ESCENARIOS]
        hist = self.historicos()
        for h in hist:
            r = sum(w * (h["ret"].get(t) if h["ret"].get(t) is not None else (self.betas.get(t, {}).get("spx", 1) * (h["ret"].get("VOO") or 0)))
                    for t, w in obj["pesos"].items())
            fx = h["ret"].get("CLP=X") or 0
            h["impacto"] = {"usd": r, "clp": (1 + r) * (1 + fx) - 1}
        riesgo = self.riesgo(obj["pesos"])
        cov = self.R.iloc[-252:].fillna(0).cov()

        n = 260
        fechas = [d.strftime("%Y-%m-%d") for d in self.cal[-n:]]
        series = {}
        for t in self.tick:
            c = self.Praw[t]
            f = self.Praw[t] / self.P[t]
            s50 = self.P[t].rolling(50).mean() * f
            s200 = self.P[t].rolling(200).mean() * f
            series[t] = {"c": [num(v, 2) for v in c.iloc[-n:]], "s50": [num(v, 2) for v in s50.iloc[-n:]],
                         "s200": [num(v, 2) for v in s200.iloc[-n:]],
                         "rsi": [num(v, 1) for v in rsi(self.P[t].dropna()).reindex(self.cal).iloc[-n:]],
                         "sc": [num(v, 0) for v in self.SC[t].iloc[-n:]]}

        fecha = self.cal[-1]
        iso = fecha.isocalendar()
        return limpiar({
            "meta": {"generado": dt.datetime.now(ZoneInfo("America/Santiago")).strftime("%Y-%m-%d %H:%M"),
                     "fecha_datos": fecha.strftime("%Y-%m-%d"), "semana": f"{iso.year}-W{iso.week:02d}",
                     "intradia": self.intradia, "perfil": self.cfg["perfil"], "avisos": self.avisos,
                     "usdclp": float(self.Praw["CLP=X"].dropna().iloc[-1]) if "CLP=X" in self.Praw else None},
            "reglas": self.reglas,
            "config": {"posiciones": self.cfg.get("posiciones", []), "efectivo_usd": self.cfg.get("efectivo_usd", 0),
                       "efectivo_clp": self.cfg.get("efectivo_clp", 0)},
            "universo": self.univ,
            "regimen": {"hoy": reg, "ayer": reg1, "semana": reg5},
            "objetivo": obj, "objetivo_semana_pasada": obj5,
            "activos": act, "macro": mac, "alertas": alertas,
            "narrativa_diaria": self.narrativa_diaria(reg, act, mac, alertas),
            "narrativa_semanal": self.narrativa_semanal(reg, reg5, act, obj, obj5, esc, mac),
            "escenarios": esc, "historicos": hist, "riesgo": riesgo,
            "cov": {"tickers": list(cov.columns), "m": [[num(v * 1e4, 4) for v in row] for row in cov.values]},
            "series": {"fechas": fechas, "activos": series},
        })


def decimal_cl(t: str) -> str:
    """Formato chileno: coma decimal en los textos generados."""
    import re
    return re.sub(r"(?<=\d)\.(?=\d)", ",", t)


def escribir(rep: dict):
    for k in ("narrativa_diaria", "narrativa_semanal", "alertas"):
        for n in rep[k]:
            n["texto"] = decimal_cl(n["texto"])
    ARCHIVO.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(rep, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (OUT / "latest.js").write_text("window.__REPORTE=" + txt + ";", encoding="utf-8")
    f, s = rep["meta"]["fecha_datos"], rep["meta"]["semana"]
    for nombre in (f"diario-{f}", f"semanal-{s}"):
        (ARCHIVO / f"{nombre}.js").write_text("window.__REPORTE=" + txt + ";", encoding="utf-8")
    # Retención: últimos 90 informes diarios y 104 semanales (≈ 2 años)
    for patron, n in (("diario-*.js", 90), ("semanal-*.js", 104)):
        for viejo in sorted(ARCHIVO.glob(patron), reverse=True)[n:]:
            viejo.unlink()
    idx_f = ARCHIVO / "indice.js"
    indice = {"diarios": [], "semanales": []}
    for p in sorted(ARCHIVO.glob("diario-*.js"), reverse=True):
        indice["diarios"].append(p.stem.replace("diario-", ""))
    for p in sorted(ARCHIVO.glob("semanal-*.js"), reverse=True):
        indice["semanales"].append(p.stem.replace("semanal-", ""))
    idx_f.write_text("window.__INDICE=" + json.dumps(indice) + ";", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--intradia", action="store_true", help="incluir la vela parcial de hoy")
    args = ap.parse_args()
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    t0 = time.time()
    rep = Motor(cfg, args.intradia).construir()
    escribir(rep)
    reg = rep["regimen"]["hoy"]
    print(f"✔ Informe generado con datos al {rep['meta']['fecha_datos']} en {time.time()-t0:.1f}s")
    print(f"  Régimen: {reg['nombre']} · VIX {reg['vix']:.1f} · USD/CLP {rep['meta']['usdclp']:.1f}")
    for a in rep["alertas"][:5]:
        print(f"  ! {a['texto']}")
    for w in rep["meta"]["avisos"]:
        print(f"  · {w}")
    print(f"  Abre site/index.html en tu navegador.")


if __name__ == "__main__":
    main()
