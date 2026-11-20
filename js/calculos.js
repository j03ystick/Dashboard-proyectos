// =========================================================
// Cálculos: avance, semáforos, presupuesto y alertas.
// No dibuja nada; solo recibe datos y devuelve resultados.
// =========================================================

const DIA = 24 * 60 * 60 * 1000;

export function fecha(txt) {
  if (!txt) return null;
  const [a, m, d] = txt.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function hoyLocal() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

export function dias(desde, hasta) {
  return Math.round((hasta - desde) / DIA);
}

/** Orden de gravedad para elegir el "peor" semáforo. */
const GRAVEDAD = { completada: 0, pendiente: 1, verde: 2, amarillo: 3, rojo: 4 };
export function peor(...colores) {
  return colores.reduce((a, b) => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a), "completada");
}

/** % de avance que debería llevar algo entre inicio y fin a la fecha de corte. */
export function avanceEsperado(inicio, fin, corte) {
  const i = fecha(inicio), f = fecha(fin);
  if (corte <= i) return 0;
  if (corte >= f) return 100;
  return ((corte - i) / (f - i)) * 100;
}

/** Semáforo de una tarea. */
export function estadoTarea(t, corte, u) {
  const esperado = avanceEsperado(t.fecha_inicio, t.fecha_fin, corte);
  const fin = fecha(t.fecha_fin);
  const base = { esperado, desviacion: esperado - t.avance, diasRetraso: 0 };

  if (t.avance >= 100) {
    const real = fecha(t.fecha_fin_real);
    const tarde = real ? Math.max(0, dias(fin, real)) : 0;
    return { ...base, color: "completada", etiqueta: tarde ? `Completada (+${tarde} d)` : "Completada", diasRetraso: tarde };
  }
  if (corte > fin) {
    const d = dias(fin, corte);
    return { ...base, color: "rojo", etiqueta: `Vencida (${d} d)`, diasRetraso: d };
  }
  if (corte < fecha(t.fecha_inicio)) return { ...base, color: "pendiente", etiqueta: "Por iniciar" };
  if (base.desviacion >= u.tarea_desviacion_rojo) return { ...base, color: "rojo", etiqueta: "Atrasada" };
  if (base.desviacion >= u.tarea_desviacion_amarillo) return { ...base, color: "amarillo", etiqueta: "En riesgo" };
  const restantes = dias(corte, fin);
  if (restantes <= u.tarea_dias_por_vencer && t.avance < 90)
    return { ...base, color: "amarillo", etiqueta: `Vence en ${restantes} d` };
  return { ...base, color: "verde", etiqueta: "En tiempo" };
}

/** Promedio ponderado por horas planeadas (o 1 si no hay horas). */
function ponderado(tareas, fn) {
  let suma = 0, peso = 0;
  for (const t of tareas) {
    const w = t.horas_plan > 0 ? t.horas_plan : 1;
    suma += fn(t) * w;
    peso += w;
  }
  return peso ? suma / peso : 0;
}

export function resumenPresupuesto(p) {
  const partidas = (p.presupuesto?.partidas ?? []).map((x) => ({
    ...x,
    excedido: x.ejercido > x.planeado || x.comprometido > x.planeado,
  }));
  const planeado = partidas.reduce((s, x) => s + (x.planeado || 0), 0);
  const comprometido = partidas.reduce((s, x) => s + (x.comprometido || 0), 0);
  const ejercido = partidas.reduce((s, x) => s + (x.ejercido || 0), 0);
  return { partidas, planeado, comprometido, ejercido, consumo: planeado ? (ejercido / planeado) * 100 : 0 };
}

/**
 * Analiza un proyecto completo y devuelve todo lo que la vista necesita.
 */
export function analizarProyecto(p, corte, u) {
  const tareas = (p.tareas ?? []).map((t) => ({ ...t, estado: estadoTarea(t, corte, u) }));
  const avance = ponderado(tareas, (t) => t.avance);
  const esperado = ponderado(tareas, (t) => t.estado.esperado);

  const etapas = (p.etapas ?? []).map((e) => {
    const ts = tareas.filter((t) => t.etapa === e.id);
    const av = ts.length ? ponderado(ts, (t) => t.avance) : 0;
    const es = ts.length ? ponderado(ts, (t) => t.estado.esperado) : avanceEsperado(e.fecha_inicio, e.fecha_fin, corte);
    let color = ts.length ? peor(...ts.map((t) => t.estado.color)) : "pendiente";
    if (ts.length && ts.every((t) => t.avance >= 100)) color = "completada";
    else if (color === "completada") color = "verde";
    return { ...e, tareas: ts, avance: av, esperado: es, color };
  });

  const ppto = resumenPresupuesto(p);

  // Semáforo de cronograma
  const desvCrono = esperado - avance;
  let colorCrono = "verde";
  if (desvCrono >= u.proyecto_desviacion_rojo) colorCrono = "rojo";
  else if (desvCrono >= u.proyecto_desviacion_amarillo || tareas.some((t) => t.estado.color === "rojo")) colorCrono = "amarillo";

  // Semáforo de costo: compara % ejercido contra % de avance real
  const desvCosto = ppto.consumo - avance;
  let colorCosto = "verde";
  if (ppto.ejercido > ppto.planeado || desvCosto >= u.presupuesto_desviacion_rojo) colorCosto = "rojo";
  else if (desvCosto >= u.presupuesto_desviacion_amarillo || ppto.partidas.some((x) => x.excedido)) colorCosto = "amarillo";

  let color = peor(colorCrono, colorCosto);
  if (p.estado === "terminado") color = "completada";
  if (p.estado === "planeacion" && avance === 0) color = colorCosto === "rojo" ? "rojo" : "pendiente";

  const alertas = generarAlertas(p, tareas, ppto, { desvCrono, desvCosto, avance }, corte, u);

  return {
    proyecto: p,
    tareas, etapas, ppto, alertas,
    avance, esperado, desvCrono, desvCosto,
    colorCrono, colorCosto, color,
    completadas: tareas.filter((t) => t.avance >= 100).length,
    diasRestantes: dias(corte, fecha(p.fecha_fin)),
  };
}

const ORDEN_ALERTA = { critica: 0, alta: 1, media: 2 };

function generarAlertas(p, tareas, ppto, ind, corte, u) {
  const a = [];
  const ref = { proyectoId: p.id, proyecto: p.nombre };
  for (const t of tareas) {
    const e = t.estado;
    if (e.color === "rojo" && e.diasRetraso > 0)
      a.push({ ...ref, nivel: "critica", tipo: "Tarea vencida", titulo: t.nombre,
        detalle: `Debía terminar el ${formatoFecha(t.fecha_fin)}; lleva ${e.diasRetraso} días de retraso con ${t.avance}% de avance.` });
    else if (e.color === "rojo")
      a.push({ ...ref, nivel: "alta", tipo: "Tarea atrasada", titulo: t.nombre,
        detalle: `Avance ${t.avance}% contra ${Math.round(e.esperado)}% esperado a la fecha.` });
    else if (e.color === "amarillo")
      a.push({ ...ref, nivel: "media", tipo: "Tarea en riesgo", titulo: t.nombre,
        detalle: `${e.etiqueta}. Avance ${t.avance}% contra ${Math.round(e.esperado)}% esperado.` });
  }
  for (const x of ppto.partidas) {
    if (x.ejercido > x.planeado)
      a.push({ ...ref, nivel: "alta", tipo: "Partida sobreejercida", titulo: x.concepto,
        detalle: `Ejercido ${moneda(x.ejercido)} contra ${moneda(x.planeado)} planeado (+${moneda(x.ejercido - x.planeado)}).` });
    else if (x.comprometido > x.planeado)
      a.push({ ...ref, nivel: "media", tipo: "Partida sobrecomprometida", titulo: x.concepto,
        detalle: `Comprometido ${moneda(x.comprometido)} contra ${moneda(x.planeado)} planeado.` });
  }
  if (ind.desvCosto >= u.presupuesto_desviacion_amarillo)
    a.push({ ...ref, nivel: ind.desvCosto >= u.presupuesto_desviacion_rojo ? "alta" : "media", tipo: "Gasto adelantado al avance",
      titulo: "Presupuesto", detalle: `Se ha ejercido ${Math.round(ppto.consumo)}% del presupuesto con ${Math.round(ind.avance)}% de avance físico.` });
  return a.sort((x, y) => ORDEN_ALERTA[x.nivel] - ORDEN_ALERTA[y.nivel]);
}

// ---------- Formatos ----------
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function formatoFecha(txt) {
  const d = typeof txt === "string" ? fecha(txt) : txt;
  if (!d) return "—";
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export function mesCorto(d) { return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; }

let _moneda = "MXN";
export function fijarMoneda(m) { _moneda = m || "MXN"; }
export function moneda(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: _moneda, maximumFractionDigits: 0 }).format(n || 0);
}
export function monedaCorta(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)} M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)} k`;
  return `$${Math.round(n)}`;
}
export const pct = (n) => `${Math.round(n)}%`;
