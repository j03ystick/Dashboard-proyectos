#!/usr/bin/env python3
"""
Convierte proyectos entre Excel (.xlsx) y JSON para el dashboard.

Uso:
  python scripts/excel.py a-json  plantillas/mi_proyecto.xlsx      # Excel -> data/proyectos/<id>.json
  python scripts/excel.py a-excel data/proyectos/PRY-2026-001.json  # JSON  -> plantillas/<id>.xlsx
  python scripts/excel.py plantilla                                 # crea plantillas/plantilla_proyecto.xlsx vacía

Requiere: pip install openpyxl
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.worksheet.datavalidation import DataValidation
except ImportError:
    sys.exit("Falta openpyxl. Instálalo con:  pip install openpyxl")

RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "data" / "config.json"

# Campos de la hoja "Proyecto" (formato campo | valor)
CAMPOS_PROYECTO = [
    ("id", "Clave única, p. ej. PRY-2026-004"),
    ("nombre", "Nombre del proyecto"),
    ("cliente", ""),
    ("ubicacion", ""),
    ("responsable", ""),
    ("estado", "planeacion | en_curso | pausado | terminado | cancelado"),
    ("prioridad", "alta | media | baja"),
    ("fecha_inicio", "AAAA-MM-DD"),
    ("fecha_fin", "AAAA-MM-DD"),
    ("moneda", "MXN, USD..."),
    ("descripcion", ""),
]

# Hojas tabulares: nombre de hoja -> columnas
TABLAS = {
    "Etapas": ["id", "nombre", "fecha_inicio", "fecha_fin"],
    "Tareas": ["id", "etapa", "nombre", "responsable", "cuadrilla", "fecha_inicio", "fecha_fin",
               "fecha_fin_real", "avance", "horas_plan", "horas_real"],
    "Cuadrillas": ["id", "nombre", "especialidad", "lider", "telefono"],
    "Integrantes": ["cuadrilla", "nombre", "rol"],
    "Planes": ["id", "titulo", "fecha_inicio", "fecha_fin", "objetivos"],
    "Actividades": ["plan", "fecha", "descripcion", "tarea", "cuadrilla", "completada"],
    "Presupuesto": ["id", "concepto", "categoria", "etapa", "planeado", "comprometido", "ejercido"],
    "Documentos": ["id", "nombre", "tipo", "etapa", "fecha", "url"],
    "Bitacora": ["fecha", "autor", "nota"],
}
NUMERICOS = {"avance", "horas_plan", "horas_real", "planeado", "comprometido", "ejercido"}
FECHAS = {"fecha_inicio", "fecha_fin", "fecha_fin_real", "fecha"}

INSTRUCCIONES = [
    "PLANTILLA DE PROYECTO PARA EL DASHBOARD",
    "",
    "1. Llena la hoja 'Proyecto' (columna B) y las demás hojas, una fila por registro.",
    "2. Fechas en formato AAAA-MM-DD o como fecha de Excel.",
    "3. 'avance' es un número de 0 a 100. Montos sin signo de pesos.",
    "4. Las columnas 'etapa', 'cuadrilla', 'tarea' y 'plan' usan el 'id' de su hoja (E1, C1, T01, PT-47...).",
    "5. En 'Planes', separa los objetivos con punto y coma (;).",
    "6. En 'Actividades', 'completada' es Sí o No.",
    "7. Deja vacía una celda si no aplica. No cambies los encabezados de la fila 1.",
    "8. Convierte con:  python scripts/excel.py a-json ruta/al/archivo.xlsx",
]

ENCABEZADO = PatternFill("solid", fgColor="1F4E79")


# ---------------------------------------------------------------- utilidades
def a_texto_fecha(v):
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date().isoformat()
    except ValueError:
        try:
            return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
        except ValueError:
            raise ValueError(f"Fecha no válida: {s!r} (usa AAAA-MM-DD)")


def a_numero(v):
    if v in (None, ""):
        return 0
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else float(v)
    s = str(v).replace("$", "").replace(",", "").replace("%", "").strip()
    n = float(s)
    return int(n) if n.is_integer() else n


def limpio(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def leer_tabla(wb, hoja):
    if hoja not in wb.sheetnames:
        return []
    ws = wb[hoja]
    filas = list(ws.iter_rows(values_only=True))
    if not filas:
        return []
    cab = [str(c).strip() if c else "" for c in filas[0]]
    out = []
    for n, fila in enumerate(filas[1:], start=2):
        if all(c in (None, "") for c in fila):
            continue
        reg = {}
        for col, val in zip(cab, fila):
            if not col:
                continue
            try:
                if col in FECHAS:
                    reg[col] = a_texto_fecha(val)
                elif col in NUMERICOS:
                    reg[col] = a_numero(val)
                else:
                    reg[col] = limpio(val)
            except ValueError as e:
                raise ValueError(f"Hoja '{hoja}', fila {n}, columna '{col}': {e}")
        out.append(reg)
    return out


# ---------------------------------------------------------------- Excel -> JSON
def excel_a_json(ruta_xlsx):
    wb = load_workbook(ruta_xlsx, data_only=True)
    if "Proyecto" not in wb.sheetnames:
        sys.exit("El archivo no tiene la hoja 'Proyecto'.")
    p = {}
    for fila in wb["Proyecto"].iter_rows(min_row=2, values_only=True):
        if not fila or not fila[0]:
            continue
        campo, valor = str(fila[0]).strip(), fila[1] if len(fila) > 1 else None
        p[campo] = a_texto_fecha(valor) if campo in FECHAS else limpio(valor)
    if not p.get("id"):
        sys.exit("La hoja 'Proyecto' necesita un 'id'.")

    p["etapas"] = leer_tabla(wb, "Etapas")
    p["tareas"] = leer_tabla(wb, "Tareas")

    integrantes = leer_tabla(wb, "Integrantes")
    p["cuadrillas"] = []
    for c in leer_tabla(wb, "Cuadrillas"):
        c["integrantes"] = [{"nombre": i["nombre"], "rol": i.get("rol")} for i in integrantes if i.get("cuadrilla") == c["id"]]
        p["cuadrillas"].append(c)

    actividades = leer_tabla(wb, "Actividades")
    p["planes_trabajo"] = []
    for pl in leer_tabla(wb, "Planes"):
        pl["objetivos"] = [o.strip() for o in (pl.get("objetivos") or "").split(";") if o.strip()]
        pl["actividades"] = [
            {"fecha": a.get("fecha"), "descripcion": a.get("descripcion"), "tarea": a.get("tarea"),
             "cuadrilla": a.get("cuadrilla"), "completada": str(a.get("completada") or "").lower() in ("sí", "si", "x", "1", "true", "verdadero")}
            for a in actividades if a.get("plan") == pl["id"]
        ]
        p["planes_trabajo"].append(pl)

    p["presupuesto"] = {"partidas": leer_tabla(wb, "Presupuesto")}
    p["documentos"] = leer_tabla(wb, "Documentos")
    p["bitacora"] = leer_tabla(wb, "Bitacora")

    validar(p)

    destino = RAIZ / "data" / "proyectos" / f"{p['id']}.json"
    destino.write_text(json.dumps(p, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✓ Guardado {destino.relative_to(RAIZ)}")
    registrar_en_config(destino)


def validar(p):
    errores = []
    etapas = {e["id"] for e in p["etapas"]}
    cuadrillas = {c["id"] for c in p["cuadrillas"]}
    tareas = {t["id"] for t in p["tareas"]}
    for t in p["tareas"]:
        if t.get("etapa") not in etapas:
            errores.append(f"Tarea {t.get('id')}: la etapa '{t.get('etapa')}' no existe en 'Etapas'.")
        if t.get("cuadrilla") and t["cuadrilla"] not in cuadrillas:
            errores.append(f"Tarea {t.get('id')}: la cuadrilla '{t['cuadrilla']}' no existe.")
        if not (0 <= (t.get("avance") or 0) <= 100):
            errores.append(f"Tarea {t.get('id')}: el avance debe estar entre 0 y 100.")
        if not t.get("fecha_inicio") or not t.get("fecha_fin"):
            errores.append(f"Tarea {t.get('id')}: faltan fechas de inicio o fin.")
    for pl in p["planes_trabajo"]:
        for a in pl["actividades"]:
            if a.get("tarea") and a["tarea"] not in tareas:
                errores.append(f"Plan {pl['id']}: la tarea '{a['tarea']}' no existe.")
    if errores:
        sys.exit("Se encontraron errores, no se guardó nada:\n  - " + "\n  - ".join(errores))


def registrar_en_config(destino):
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    rel = destino.relative_to(RAIZ).as_posix()
    if rel not in cfg["proyectos"]:
        cfg["proyectos"].append(rel)
        CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"✓ Agregado a data/config.json")


# ---------------------------------------------------------------- JSON -> Excel
def nuevo_libro():
    wb = Workbook()
    ws = wb.active
    ws.title = "Instrucciones"
    for i, t in enumerate(INSTRUCCIONES, start=1):
        ws.cell(row=i, column=1, value=t)
    ws["A1"].font = Font(bold=True, size=13)
    ws.column_dimensions["A"].width = 110
    return wb


def encabezados(ws, cols):
    for j, c in enumerate(cols, start=1):
        celda = ws.cell(row=1, column=j, value=c)
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = ENCABEZADO
        celda.alignment = Alignment(vertical="center")
        ws.column_dimensions[celda.column_letter].width = max(14, len(c) + 4)
    ws.freeze_panes = "A2"


def escribir_libro(p, destino):
    wb = nuevo_libro()
    ws = wb.create_sheet("Proyecto")
    encabezados(ws, ["campo", "valor", "ayuda"])
    ws.column_dimensions["B"].width = 60
    ws.column_dimensions["C"].width = 50
    for i, (campo, ayuda) in enumerate(CAMPOS_PROYECTO, start=2):
        ws.cell(row=i, column=1, value=campo).font = Font(bold=True)
        ws.cell(row=i, column=2, value=p.get(campo))
        ws.cell(row=i, column=3, value=ayuda).font = Font(italic=True, color="777777")

    filas = {
        "Etapas": p.get("etapas", []),
        "Tareas": p.get("tareas", []),
        "Cuadrillas": p.get("cuadrillas", []),
        "Integrantes": [{"cuadrilla": c["id"], **i} for c in p.get("cuadrillas", []) for i in c.get("integrantes", [])],
        "Planes": [{**pl, "objetivos": "; ".join(pl.get("objetivos", []))} for pl in p.get("planes_trabajo", [])],
        "Actividades": [{"plan": pl["id"], **a, "completada": "Sí" if a.get("completada") else "No"}
                        for pl in p.get("planes_trabajo", []) for a in pl.get("actividades", [])],
        "Presupuesto": p.get("presupuesto", {}).get("partidas", []),
        "Documentos": p.get("documentos", []),
        "Bitacora": p.get("bitacora", []),
    }
    for hoja, cols in TABLAS.items():
        ws = wb.create_sheet(hoja)
        encabezados(ws, cols)
        for i, reg in enumerate(filas[hoja], start=2):
            for j, c in enumerate(cols, start=1):
                ws.cell(row=i, column=j, value=reg.get(c))
        if hoja == "Actividades":
            dv = DataValidation(type="list", formula1='"Sí,No"', allow_blank=True)
            ws.add_data_validation(dv)
            dv.add("F2:F500")
        if hoja == "Tareas":
            dv = DataValidation(type="whole", operator="between", formula1="0", formula2="100", allow_blank=True,
                                error="El avance va de 0 a 100", showErrorMessage=True)
            ws.add_data_validation(dv)
            dv.add("I2:I500")
    destino.parent.mkdir(parents=True, exist_ok=True)
    wb.save(destino)
    print(f"✓ Guardado {destino.relative_to(RAIZ) if destino.is_relative_to(RAIZ) else destino}")


def json_a_excel(ruta_json):
    p = json.loads(Path(ruta_json).read_text(encoding="utf-8"))
    escribir_libro(p, RAIZ / "plantillas" / f"{p['id']}.xlsx")


def plantilla_vacia():
    escribir_libro({"estado": "planeacion", "prioridad": "media", "moneda": "MXN"},
                   RAIZ / "plantillas" / "plantilla_proyecto.xlsx")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("a-json", "a-excel", "plantilla"):
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "plantilla":
        plantilla_vacia()
    elif len(sys.argv) < 3:
        sys.exit(__doc__)
    elif cmd == "a-json":
        excel_a_json(sys.argv[2])
    else:
        json_a_excel(sys.argv[2])
