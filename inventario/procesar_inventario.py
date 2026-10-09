"""Procesa los informes Siigo 'Movimiento ventas y compras' y genera la plantilla de inventario real."""
import re, sys, glob, os
from collections import Counter
import pandas as pd

NO_REQ = ("NOREQUIERE", "NOAPLICA")

def norm_inv(s):
    s = s.upper().replace(" ", "").replace(".R", "-R").strip("-.,;:")
    if s in ("N/A", "NA", ""): return "N/A" if s else ""
    if s.startswith(NO_REQ): return "NO REQUIERE"
    m = re.match(r"^(\d{3,5})([A-Z]{1,3})-?(\d+)(?:-?(R\d+))?$", s)
    if m:
        return f"{m.group(1)}{m.group(2)}-{m.group(3)}" + (f"-{m.group(4)}" if m.group(4) else "")
    return s

def norm_fv(a, b, c=None):
    """Acepta MM/AA, MM/AAAA, AAAA/MM y DD/MM/AAAA. Devuelve MM/AAAA o None si es inválida."""
    a, b = int(a), int(b)
    if c is not None: m, y = b, int(c)          # DD/MM/AAAA
    elif a > 999: y, m = a, b                    # AAAA/MM
    else: m, y = a, b
    if y < 100: y += 2000
    if not 1 <= m <= 12 or not 2000 <= y <= 2100: return None
    return f"{m:02d}/{y}"

MESES = {"ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8,
         "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12}
SEP = r"\s*[:;._]*\s*"
LOTE_RE = re.compile(r"(?:^|[\s|])L(?:OTE)?(?:\s*[:;}.]+\s*|\s+)([A-Z0-9][A-Z0-9\-/]*?)(?=FV|\s|\||$)")
LOTE_INICIO_RE = re.compile(r"^([A-Z0-9][A-Z0-9\-]{3,})\s*\|?\s*(?:FV|V)\s*[:;.]*\s*\d")
INVIMA_RE = re.compile(r"\d{3,5}\s*(?:DM|RD|M|EBC|DN)\s*-?\s*\d{4,}(?:\s*[-.]?\s*R\d+)?")
KW_FV = r"(?:FV|(?<![A-Z])V|(?<![A-Z])F\.|VENCE|VTO)"
FV_PATTERNS = [
    (re.compile(KW_FV + SEP + r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})(?!\d)"), lambda g: (g[1], g[2])),  # DD/MM/AAAA
    (re.compile(KW_FV + SEP + r"(\d{4})(\d{2})\d{2}(?!\d)"), lambda g: (g[1], g[0])),                     # AAAAMMDD
    (re.compile(KW_FV + SEP + r"(\d{4})\s*/\s*(\d{1,2})(?!\d)"), lambda g: (g[1], g[0])),                 # AAAA/MM
    (re.compile(KW_FV + SEP + r"(\d{1,2})\s*/+\s*(\d{2,4})(?!\d)"), lambda g: (g[0], g[1])),              # MM/AA(AA)
    (re.compile(KW_FV + SEP + r"(\d{2})(\d{4}|\d{2})(?!\d)"), lambda g: (g[0], g[1])),                    # MMAAAA / MMAA
    (re.compile(KW_FV + SEP + r"([A-Z]{3})\s*/\s*(\d{2,4})(?!\d)"), lambda g: (MESES.get(g[0], 0), g[1])),# SEP/2027
    (re.compile(r"(?<![\d/])(\d{2})\s*/\s*(\d{2}|\d{4})(?![\d/])"), lambda g: (g[0], g[1])),              # sin palabra clave
]
FV_NA_RE = re.compile(KW_FV + SEP + r"N/?A")
INV_RE = re.compile(r"(?<![A-Z])(?:RI|INVIMA|INV|RS)" + SEP + r"([^|]*?)(?=\s*(?:\||CUM|USO|RI|$))")

def leer_fv(t, notas):
    for rx, conv in FV_PATTERNS:
        m = rx.search(t)
        if m:
            mm, yy = conv(m.groups())
            fv = norm_fv(mm, yy)
            if fv: return "N/A" if fv.endswith(("/2099", "/2080")) else fv
            notas.append(f"FV inválida en origen ({m.group(0).strip()})")
            return ""
    return "N/A" if FV_NA_RE.search(t) else ""

def parse_q(txt):
    """Lee el texto de la columna Q. Devuelve dict con lote, fv, invima y notas, o None si no trae lote."""
    if not isinstance(txt, str): return None
    t = " ".join(txt.upper().replace("\n", " | ").split())
    m = LOTE_RE.search(t) or LOTE_INICIO_RE.search(t)
    if not m: return None
    lote = m.group(1).strip("-/")
    if lote in ("N/A", "NA", "") or INVIMA_RE.fullmatch(lote): return None
    notas = []
    if len(LOTE_RE.findall(t)) > 1: notas.append("el registro trae varios lotes; se tomó el primero")
    fv = leer_fv(t, notas)
    inv = ""
    for im in INV_RE.finditer(t):
        cand = im.group(1).strip()
        if cand:
            inv = norm_inv(cand.lstrip("_- ")); break
    if not inv or not (INVIMA_RE.search(inv) or inv in ("N/A", "NO REQUIERE") or inv.isdigit()):
        b = INVIMA_RE.search(t)  # registro escrito sin palabra clave o con error de digitación (I9NV, R:)
        if b: inv = norm_inv(b.group(0))
    if not inv:
        c = re.search(r"CER(?:T)?\s*[:.]?\s*(\S+)", t)
        if c: inv = "CERT " + c.group(1)
    return {"lote": lote, "fv": fv, "inv": inv, "notas": "; ".join(notas)}

def clave_lote(lote):
    """Clave para unir el mismo lote escrito distinto (sin guiones/espacios ni ceros a la izquierda)."""
    return re.sub(r"[\s\-/]", "", lote).lstrip("0") or lote

def cargar(files):
    frames = []
    for f in files:
        mes = re.sub(r"^[0-9a-f]+-", "", os.path.basename(f))[:-5].upper()
        df = pd.read_excel(f, header=6, dtype={"Código": str, "Cantidad": str})
        frames.append(df.assign(Mes=mes, Archivo=os.path.basename(f)))
    d = pd.concat(frames, ignore_index=True)
    total = len(d)
    d = d[d["Tipo clasificación"].eq("Producto") & d["Tipo transacción"].isin(["Factura de compra", "Factura de venta"])].copy()
    d["Cantidad"] = pd.to_numeric(d["Cantidad"].str.replace(",", ".", regex=False), errors="coerce").fillna(0)
    d["Código"] = d["Código"].str.strip().str.upper()
    d["Fecha"] = pd.to_datetime(d["Fecha elaboración"])
    return d, total


NO_FISICOS_PREFIJO = ("SRM",)        # servicios de mantenimiento
NO_FISICOS_CODIGO = {"RPF002"}       # flete
HOY = pd.Timestamp("today").normalize()

def mayoritario(valores):
    v = [x for x in valores if x]
    return Counter(v).most_common(1)[0][0] if v else ""

def analizar(d):
    parsed = d["Nombre"].map(parse_q)
    d["Lote"] = parsed.map(lambda r: r["lote"] if r else "")
    d["FV leída"] = parsed.map(lambda r: r["fv"] if r else "")
    d["Invima leído"] = parsed.map(lambda r: r["inv"] if r else "")
    d["Nota lectura"] = parsed.map(lambda r: r["notas"] if r else "")
    d["Clave lote"] = d["Lote"].map(lambda x: clave_lote(x) if x else "")
    d["Es compra"] = d["Tipo transacción"].eq("Factura de compra")

    # ---- Homologación por (código, lote): el valor más repetido gana
    lotes = []
    con_lote = d[d["Clave lote"] != ""]
    inv_producto = con_lote.groupby("Código")["Invima leído"].agg(
        lambda s: mayoritario([x for x in s if x not in ("N/A",)]) or mayoritario(list(s)))
    for (cod, clave), g in con_lote.groupby(["Código", "Clave lote"]):
        fvs = [x for x in g["FV leída"] if x]
        invs = [x for x in g["Invima leído"] if x]
        fv = mayoritario(fvs); inv = mayoritario(invs)
        notas = []
        if len(set(fvs)) > 1: notas.append("FV distintas en origen: " + ", ".join(sorted(set(fvs))) + f" → se usó {fv}")
        if len(set(invs)) > 1: notas.append("Invima distintos en origen: " + ", ".join(sorted(set(invs))) + f" → se usó {inv}")
        if not inv and inv_producto.get(cod):
            inv = inv_producto[cod]; notas.append("Invima completado con el registro más usado del producto")
        if not fv: notas.append("Sin fecha de vencimiento legible")
        notas += sorted({n for n in g["Nota lectura"] if n})
        comp = g[g["Es compra"]]; vent = g[~g["Es compra"]]
        venc = None
        if re.fullmatch(r"\d{2}/\d{4}", fv or ""):
            venc = pd.Timestamp(int(fv[3:]), int(fv[:2]), 1) + pd.offsets.MonthEnd(0)
        lotes.append({
            "Código": cod, "Lote": mayoritario(list(g["Lote"])), "FV": fv or "", "Invima": inv or "",
            "Última compra": comp["Fecha"].max() if len(comp) else pd.NaT,
            "Última venta": vent["Fecha"].max() if len(vent) else pd.NaT,
            "Unid. compradas": comp["Cantidad"].sum(), "Unid. vendidas": vent["Cantidad"].sum(),
            "Registros": len(g), "Escrituras distintas": g["Nombre"].nunique(),
            "Ejemplos de escritura": " ‖ ".join(list(dict.fromkeys(" ".join(str(x).split()) for x in g["Nombre"]))[:3]),
            "Vencido": bool(venc is not None and venc < HOY),
            "Notas": "; ".join(notas),
        })
    L = pd.DataFrame(lotes)
    # Orden de prioridad: primero lotes con compra (más reciente primero), luego lotes vistos solo en ventas.
    L["_tiene_compra"] = L["Última compra"].notna()
    L["_fecha"] = L["Última compra"].fillna(L["Última venta"])
    L["_fv_ord"] = L["FV"].map(lambda f: f[3:] + f[:2] if re.fullmatch(r"\d{2}/\d{4}", f) else "")
    L = L.sort_values(["Código", "_tiene_compra", "_fecha", "_fv_ord"], ascending=[True, False, False, False])
    L["Orden"] = L.groupby("Código").cumcount() + 1
    L["Seleccionado"] = L["Orden"].map(lambda o: f"Opción {o}" if o <= 2 else "")
    L["Criterio"] = L.apply(lambda r: ("Compra " if r["_tiene_compra"] else "Solo en ventas ") + r["_fecha"].strftime("%d/%m/%Y"), axis=1)

    # ---- Rotación por código
    R = d.groupby("Código").agg(
        Entradas=("Cantidad", lambda s: s[d.loc[s.index, "Es compra"]].sum()),
        Salidas=("Cantidad", lambda s: s[~d.loc[s.index, "Es compra"]].sum()),
        Mov_compra=("Es compra", "sum"), Mov_total=("Es compra", "size"),
    )
    R["Mov_venta"] = R["Mov_total"] - R["Mov_compra"]
    R["Total movido"] = R["Entradas"] + R["Salidas"]
    R = R.sort_values(["Total movido", "Mov_total"], ascending=False)
    R["Ranking"] = range(1, len(R) + 1)
    R["Físico"] = [not (c.startswith(NO_FISICOS_PREFIJO) or c in NO_FISICOS_CODIGO) for c in R.index]

    # ---- Nombre provisional: texto de col. Q cuando describe el producto (no trae lote)
    desc = d[(d["Lote"] == "") & d["Nombre"].notna() & ~d["Nombre"].str.upper().str.match(r"^\s*(RI|INV|L\b|L:|REGISTRO)", na=False)]
    nombres = desc.groupby("Código")["Nombre"].agg(lambda s: " ".join(mayoritario(list(s)).split()))
    return d, L, R, nombres
