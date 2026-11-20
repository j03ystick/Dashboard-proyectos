// =========================================================
// Dashboard de proyectos — carga de datos, rutas y vistas.
// =========================================================
import {
  analizarProyecto, fecha, hoyLocal, formatoFecha, mesCorto, moneda, monedaCorta, pct, fijarMoneda, dias,
} from "./calculos.js";

const UMBRALES_BASE = {
  tarea_desviacion_amarillo: 10, tarea_desviacion_rojo: 25, tarea_dias_por_vencer: 5,
  proyecto_desviacion_amarillo: 5, proyecto_desviacion_rojo: 15,
  presupuesto_desviacion_amarillo: 5, presupuesto_desviacion_rojo: 15,
};
const ETIQUETA_COLOR = { verde: "En tiempo", amarillo: "En riesgo", rojo: "Crítico", completada: "Terminado", pendiente: "Por iniciar" };
const ETIQUETA_ESTADO = { planeacion: "Planeación", en_curso: "En curso", pausado: "Pausado", terminado: "Terminado", cancelado: "Cancelado" };
const ICONO_ALERTA = { critica: "●", alta: "▲", media: "◆" };

const estado = { config: null, corte: null, analisis: [], filtro: { texto: "", color: "" }, pestana: "resumen" };
const $app = document.getElementById("app");

// ---------- Utilidades de HTML ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sem = (color, texto) => `<span class="sem ${color}">${esc(texto ?? ETIQUETA_COLOR[color])}</span>`;
const pill = (color, texto) => `<span class="pill">${sem(color, texto)}</span>`;
function barraProg(valor, esperado, clase = "") {
  const v = Math.max(0, Math.min(100, valor));
  const marca = esperado != null ? `<span class="marca-esperado" style="left:${Math.min(100, esperado)}%"></span>` : "";
  return `<div class="barra-prog ${clase}"><span class="relleno" style="width:${v}%"></span>${marca}</div>`;
}

// ---------- Carga ----------
async function cargarJSON(ruta) {
  const r = await fetch(ruta, { cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
  return r.json();
}

async function iniciar() {
  try {
    const config = await cargarJSON("data/config.json");
    config.umbrales = { ...UMBRALES_BASE, ...(config.umbrales || {}) };
    fijarMoneda(config.moneda);
    estado.config = config;
    estado.corte = config.fecha_corte ? fecha(config.fecha_corte) : hoyLocal();
    const proyectos = await Promise.all(config.proyectos.map(cargarJSON));
    estado.analisis = proyectos.map((p) => analizarProyecto(p, estado.corte, config.umbrales));
    document.getElementById("titulo").textContent = config.titulo || "Seguimiento de proyectos";
    document.title = config.titulo || "Seguimiento de proyectos";
    document.getElementById("corte").textContent = `Fecha de corte: ${formatoFecha(estado.corte)}`;
    window.addEventListener("hashchange", rutear);
    rutear();
  } catch (e) {
    console.error(e);
    const archivo = location.protocol === "file:";
    $app.innerHTML = `<div class="tarjeta error-carga">
      <h2>No se pudieron cargar los datos</h2>
      <p class="muted">${esc(e.message)}</p>
      ${archivo ? `<p>Abriste el archivo directamente. Los navegadores bloquean la lectura de JSON así; ábrelo con un servidor local:</p>
      <p><code>python -m http.server 8000</code> en la carpeta del proyecto y luego visita <code>http://localhost:8000</code>.</p>
      <p>O publícalo con GitHub Pages (ver README).</p>` : `<p>Revisa que el archivo exista y que el JSON sea válido.</p>`}
    </div>`;
  }
}

function rutear() {
  const m = location.hash.match(/^#\/proyecto\/([^/]+)(?:\/(\w+))?/);
  if (m) {
    const a = estado.analisis.find((x) => x.proyecto.id === decodeURIComponent(m[1]));
    if (a) { estado.pestana = m[2] || "resumen"; return vistaProyecto(a); }
  }
  vistaPortafolio();
}

// =========================================================
// Vista 1: Portafolio
// =========================================================
function vistaPortafolio() {
  const A = estado.analisis;
  const cuenta = (c) => A.filter((a) => a.color === c).length;
  const totPlan = A.reduce((s, a) => s + a.ppto.planeado, 0);
  const totEjer = A.reduce((s, a) => s + a.ppto.ejercido, 0);
  const alertas = A.flatMap((a) => a.alertas);
  const criticas = alertas.filter((x) => x.nivel === "critica").length;
  const tareasAbiertas = A.reduce((s, a) => s + a.tareas.length - a.completadas, 0);

  $app.innerHTML = `
    <section class="kpis">
      <div class="tarjeta kpi">
        <div class="etiqueta">Proyectos</div>
        <div class="valor">${A.length}</div>
        <div class="semaforos">${sem("verde", `${cuenta("verde")} en tiempo`)}${sem("amarillo", `${cuenta("amarillo")} en riesgo`)}${sem("rojo", `${cuenta("rojo")} críticos`)}</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">Alertas abiertas</div>
        <div class="valor">${alertas.length}</div>
        <div class="detalle">${criticas} críticas (tareas vencidas)</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">Tareas abiertas</div>
        <div class="valor">${tareasAbiertas}</div>
        <div class="detalle">de ${A.reduce((s, a) => s + a.tareas.length, 0)} tareas en total</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">Presupuesto ejercido</div>
        <div class="valor">${monedaCorta(totEjer)}</div>
        <div class="detalle">${pct(totPlan ? (totEjer / totPlan) * 100 : 0)} de ${monedaCorta(totPlan)} planeado</div>
      </div>
    </section>

    <section class="seccion">
      <header><h2>Proyectos</h2><span class="muted">La marca negra en cada barra indica dónde debería ir a la fecha de corte.</span></header>
      <div class="filtros">
        <input id="f-texto" type="search" placeholder="Buscar por nombre, cliente o ubicación" value="${esc(estado.filtro.texto)}">
        <select id="f-color">
          <option value="">Todos los semáforos</option>
          ${["rojo", "amarillo", "verde", "completada", "pendiente"].map((c) => `<option value="${c}" ${estado.filtro.color === c ? "selected" : ""}>${ETIQUETA_COLOR[c]}</option>`).join("")}
        </select>
      </div>
      <div class="proyectos" id="lista-proyectos"></div>
    </section>

    <section class="seccion">
      <header><h2>Alertas</h2><span class="muted">Ordenadas por gravedad</span></header>
      <div class="tarjeta">${listaAlertas(alertas, true)}</div>
    </section>`;

  const pintar = () => {
    const t = estado.filtro.texto.toLowerCase();
    const lista = A.filter((a) => {
      const p = a.proyecto;
      const txt = `${p.id} ${p.nombre} ${p.cliente} ${p.ubicacion}`.toLowerCase();
      return (!t || txt.includes(t)) && (!estado.filtro.color || a.color === estado.filtro.color);
    }).sort((x, y) => ["rojo", "amarillo", "verde", "pendiente", "completada"].indexOf(x.color) - ["rojo", "amarillo", "verde", "pendiente", "completada"].indexOf(y.color));
    document.getElementById("lista-proyectos").innerHTML = lista.length ? lista.map(tarjetaProyecto).join("") : `<div class="vacio">Ningún proyecto coincide con el filtro.</div>`;
  };
  document.getElementById("f-texto").addEventListener("input", (e) => { estado.filtro.texto = e.target.value; pintar(); });
  document.getElementById("f-color").addEventListener("change", (e) => { estado.filtro.color = e.target.value; pintar(); });
  pintar();
}

function tarjetaProyecto(a) {
  const p = a.proyecto;
  const etapaActual = a.etapas.find((e) => e.color !== "completada" && fecha(e.fecha_inicio) <= estado.corte) || a.etapas.find((e) => e.color !== "completada");
  const excedido = a.ppto.ejercido > a.ppto.planeado;
  return `<a class="tarjeta proyecto" href="#/proyecto/${encodeURIComponent(p.id)}">
    <div class="cab">
      <div><div class="id">${esc(p.id)} · ${esc(ETIQUETA_ESTADO[p.estado] || p.estado)}</div><h3>${esc(p.nombre)}</h3></div>
      ${pill(a.color)}
    </div>
    <div class="meta"><span>${esc(p.cliente)}</span><span>${esc(p.ubicacion)}</span></div>
    <div>
      <div class="prog-fila" data-tip="Avance real ${pct(a.avance)}\nEsperado a la fecha ${pct(a.esperado)}"><span class="muted">Avance</span>${barraProg(a.avance, a.esperado)}<span class="num">${pct(a.avance)}</span></div>
      <div class="prog-fila" data-tip="Ejercido ${moneda(a.ppto.ejercido)}\nPlaneado ${moneda(a.ppto.planeado)}"><span class="muted">Presupuesto</span>${barraProg(a.ppto.consumo, a.avance, "costo" + (excedido ? " excedido" : ""))}<span class="num">${pct(a.ppto.consumo)}</span></div>
    </div>
    <div class="pie">
      <span>Etapa: ${esc(etapaActual?.nombre || "—")}</span>
      <span>${a.alertas.length ? `${a.alertas.length} alertas` : "Sin alertas"} · ${a.diasRestantes >= 0 ? `${a.diasRestantes} d restantes` : `${-a.diasRestantes} d vencido`}</span>
    </div>
  </a>`;
}

function listaAlertas(alertas, conProyecto) {
  if (!alertas.length) return `<div class="vacio">Sin alertas. Todo va según lo planeado.</div>`;
  return `<ul class="alertas">${alertas.map((x) => `
    <li class="${x.nivel}">
      <span class="ico" aria-hidden="true">${ICONO_ALERTA[x.nivel]}</span>
      <div><div class="titulo">${esc(x.tipo)}: ${esc(x.titulo)}</div><div class="desc">${esc(x.detalle)}</div></div>
      ${conProyecto ? `<a class="small" href="#/proyecto/${encodeURIComponent(x.proyectoId)}">${esc(x.proyectoId)}</a>` : `<span class="etiq">${x.nivel}</span>`}
    </li>`).join("")}</ul>`;
}

// =========================================================
// Vista 2: Detalle de proyecto
// =========================================================
const PESTANAS = [
  ["resumen", "Resumen"], ["tareas", "Tareas"], ["plan", "Planes de trabajo"],
  ["cuadrillas", "Cuadrillas"], ["presupuesto", "Presupuesto"], ["documentos", "Documentos"],
];

function vistaProyecto(a) {
  const p = a.proyecto;
  const cuentas = {
    tareas: a.tareas.length, plan: p.planes_trabajo?.length ?? 0, cuadrillas: p.cuadrillas?.length ?? 0,
    presupuesto: a.ppto.partidas.length, documentos: p.documentos?.length ?? 0, resumen: a.alertas.length || "",
  };
  $app.innerHTML = `
    <a class="volver" href="#/">← Todos los proyectos</a>
    <div class="cab-proyecto">
      <div>
        <div class="muted small">${esc(p.id)} · ${esc(ETIQUETA_ESTADO[p.estado] || p.estado)} · Prioridad ${esc(p.prioridad)}</div>
        <h1>${esc(p.nombre)}</h1>
        <div class="meta"><span>${esc(p.cliente)}</span><span>${esc(p.ubicacion)}</span><span>Responsable: ${esc(p.responsable)}</span><span>${formatoFecha(p.fecha_inicio)} → ${formatoFecha(p.fecha_fin)}</span></div>
        ${p.descripcion ? `<p class="descripcion">${esc(p.descripcion)}</p>` : ""}
      </div>
      ${pill(a.color)}
    </div>

    <section class="kpis seccion">
      <div class="tarjeta kpi">
        <div class="etiqueta">Avance físico</div>
        <div class="valor">${pct(a.avance)}</div>
        <div class="detalle">Esperado ${pct(a.esperado)} · ${sem(a.colorCrono, Math.round(a.desvCrono) > 0 ? `${Math.round(a.desvCrono)} ${Math.round(a.desvCrono) === 1 ? "punto" : "puntos"} abajo` : "en programa")}</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">Presupuesto ejercido</div>
        <div class="valor">${monedaCorta(a.ppto.ejercido)}</div>
        <div class="detalle">${pct(a.ppto.consumo)} de ${monedaCorta(a.ppto.planeado)} · ${sem(a.colorCosto, a.colorCosto === "verde" ? "bajo control" : a.colorCosto === "rojo" ? "fuera de control" : "vigilar")}</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">Tareas</div>
        <div class="valor">${a.completadas}/${a.tareas.length}</div>
        <div class="detalle">${a.tareas.filter((t) => t.estado.color === "rojo").length} atrasadas o vencidas</div>
      </div>
      <div class="tarjeta kpi">
        <div class="etiqueta">${a.diasRestantes >= 0 ? "Días restantes" : "Días de retraso"}</div>
        <div class="valor">${Math.abs(a.diasRestantes)}</div>
        <div class="detalle">Entrega ${formatoFecha(p.fecha_fin)}</div>
      </div>
    </section>

    <nav class="pestanas" role="tablist">
      ${PESTANAS.map(([id, txt]) => `<button role="tab" data-p="${id}" aria-selected="${estado.pestana === id}">${txt}${cuentas[id] !== "" ? `<span class="cuenta">${cuentas[id]}</span>` : ""}</button>`).join("")}
    </nav>
    <div id="contenido-pestana" class="seccion"></div>`;

  $app.querySelectorAll(".pestanas button").forEach((b) =>
    b.addEventListener("click", () => { history.replaceState(null, "", `#/proyecto/${encodeURIComponent(p.id)}/${b.dataset.p}`); rutear(); }));

  const render = { resumen: pResumen, tareas: pTareas, plan: pPlanes, cuadrillas: pCuadrillas, presupuesto: pPresupuesto, documentos: pDocumentos }[estado.pestana] || pResumen;
  document.getElementById("contenido-pestana").innerHTML = render(a);
  window.scrollTo({ top: 0 });
}

// ---------- Pestaña: Resumen (cronograma + alertas + bitácora) ----------
function pResumen(a) {
  const p = a.proyecto;
  return `
    <div class="tarjeta">
      <header style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <h2>Cronograma por etapa</h2>
        <div class="leyenda" style="margin:0">
          <span><i class="sw" style="background:var(--verde)"></i>En tiempo</span>
          <span><i class="sw" style="background:var(--amarillo)"></i>En riesgo</span>
          <span><i class="sw" style="background:var(--rojo)"></i>Atrasada / vencida</span>
          <span><i class="sw" style="background:var(--acento)"></i>Terminada</span>
          <span><i class="sw" style="background:var(--gris)"></i>Por iniciar</span>
        </div>
      </header>
      ${gantt(a)}
      <p class="muted small" style="margin:10px 0 0">La parte rellena de cada barra es el avance real. La línea roja vertical es la fecha de corte.</p>
    </div>
    <div class="dos-col seccion">
      <div class="tarjeta"><h2 style="margin-bottom:8px">Alertas del proyecto</h2>${listaAlertas(a.alertas, false)}</div>
      <div class="tarjeta"><h2 style="margin-bottom:8px">Bitácora</h2>
        ${p.bitacora?.length ? `<ul class="bitacora">${[...p.bitacora].sort((x, y) => y.fecha.localeCompare(x.fecha)).map((b) =>
          `<li><div class="small muted">${formatoFecha(b.fecha)} · ${esc(b.autor)}</div>${esc(b.nota)}</li>`).join("")}</ul>` : `<div class="vacio">Sin notas.</div>`}
      </div>
    </div>`;
}

function gantt(a) {
  const p = a.proyecto;
  const fechas = [p.fecha_inicio, p.fecha_fin, ...a.etapas.flatMap((e) => [e.fecha_inicio, e.fecha_fin]), ...a.tareas.flatMap((t) => [t.fecha_inicio, t.fecha_fin])].map(fecha);
  const ini = new Date(Math.min(...fechas)), fin = new Date(Math.max(...fechas));
  const total = Math.max(1, dias(ini, fin));
  const x = (txt) => (dias(ini, typeof txt === "string" ? fecha(txt) : txt) / total) * 100;

  const meses = [];
  for (let d = new Date(ini.getFullYear(), ini.getMonth() + (ini.getDate() > 1 ? 1 : 0), 1); d <= fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);

  const bar = (item, color, tip) => {
    const l = x(item.fecha_inicio), w = Math.max(0.8, x(item.fecha_fin) - l);
    return `<div class="bar ${color}" style="left:${l}%;width:${w}%" data-tip="${esc(tip)}"><i style="width:${Math.min(100, item.avance)}%"></i></div>`;
  };
  const filas = a.etapas.map((e) => `
    <div class="fila etapa"><div class="nombre" title="${esc(e.nombre)}">${esc(e.nombre)}</div>
      <div class="pista">${bar(e, e.color, `${e.nombre}\n${formatoFecha(e.fecha_inicio)} → ${formatoFecha(e.fecha_fin)}\nAvance ${pct(e.avance)} (esperado ${pct(e.esperado)})`)}</div></div>
    ${e.tareas.map((t) => `
    <div class="fila tarea"><div class="nombre" title="${esc(t.nombre)}">${esc(t.nombre)}</div>
      <div class="pista">${bar(t, t.estado.color, `${t.nombre}\n${formatoFecha(t.fecha_inicio)} → ${formatoFecha(t.fecha_fin)}\nAvance ${t.avance}% (esperado ${pct(t.estado.esperado)})\n${t.estado.etiqueta}${t.responsable ? `\nResponsable: ${t.responsable}` : ""}`)}</div></div>`).join("")}
  `).join("");

  const corte = estado.corte;
  const hoy = corte >= ini && corte <= fin ? `<div class="hoy" style="left:calc(var(--col) + 12px + (100% - var(--col) - 12px) * ${x(corte) / 100})"><span class="hoy-et">Hoy</span></div>` : "";
  return `<div class="gantt">
    <div class="escala"><div></div><div class="meses">${meses.map((m) => `<span style="left:${x(m)}%">${mesCorto(m)}</span>`).join("")}</div></div>
    <div class="gantt-cuerpo">${filas}${hoy}</div>
  </div>`;
}

// ---------- Pestaña: Tareas ----------
function pTareas(a) {
  const p = a.proyecto;
  const etapa = Object.fromEntries(a.etapas.map((e) => [e.id, e.nombre]));
  const cuadrilla = Object.fromEntries((p.cuadrillas ?? []).map((c) => [c.id, c.nombre]));
  const filas = a.tareas.map((t) => {
    const varH = t.horas_real - t.horas_plan;
    return `<tr>
      <td>${sem(t.estado.color, t.estado.etiqueta)}</td>
      <td><strong>${esc(t.nombre)}</strong><div class="small muted">${esc(t.id)} · ${esc(etapa[t.etapa] || t.etapa)}</div></td>
      <td>${esc(t.responsable || "—")}</td>
      <td>${esc(cuadrilla[t.cuadrilla] || "—")}</td>
      <td class="num">${formatoFecha(t.fecha_inicio)}</td>
      <td class="num">${formatoFecha(t.fecha_fin)}${t.fecha_fin_real ? `<div class="small muted">Real: ${formatoFecha(t.fecha_fin_real)}</div>` : ""}</td>
      <td><div class="mini-prog" data-tip="Avance ${t.avance}%\nEsperado ${pct(t.estado.esperado)}">${barraProg(t.avance, t.estado.esperado)}<span class="num">${t.avance}%</span></div></td>
      <td class="n">${t.horas_plan ?? "—"}</td>
      <td class="n ${t.avance >= 100 && varH > 0 ? "texto-rojo" : ""}">${t.horas_real ?? "—"}</td>
    </tr>`;
  }).join("");
  const hp = a.tareas.reduce((s, t) => s + (t.horas_plan || 0), 0), hr = a.tareas.reduce((s, t) => s + (t.horas_real || 0), 0);
  return `<div class="tarjeta tabla-cont"><table>
    <thead><tr><th>Semáforo</th><th>Tarea</th><th>Responsable</th><th>Cuadrilla</th><th>Inicio</th><th>Fin plan</th><th>Avance</th><th class="n">Horas plan</th><th class="n">Horas real</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="7">Total</td><td class="n">${hp}</td><td class="n">${hr}</td></tr></tfoot>
  </table></div>`;
}

// ---------- Pestaña: Planes de trabajo ----------
function pPlanes(a) {
  const p = a.proyecto;
  const planes = p.planes_trabajo ?? [];
  if (!planes.length) return `<div class="tarjeta vacio">Este proyecto aún no tiene planes de trabajo.</div>`;
  const tarea = Object.fromEntries(a.tareas.map((t) => [t.id, t.nombre]));
  const cuadrilla = Object.fromEntries((p.cuadrillas ?? []).map((c) => [c.id, c.nombre]));
  return `<div class="rejilla-tarjetas">${[...planes].sort((x, y) => y.fecha_inicio.localeCompare(x.fecha_inicio)).map((pl) => {
    const hechas = pl.actividades?.filter((x) => x.completada).length ?? 0, tot = pl.actividades?.length ?? 0;
    return `<div class="tarjeta plan">
      <h3>${esc(pl.titulo)}</h3>
      <div class="small muted">${formatoFecha(pl.fecha_inicio)} → ${formatoFecha(pl.fecha_fin)} · ${hechas}/${tot} actividades</div>
      ${pl.objetivos?.length ? `<div class="seccion" style="margin-top:12px"><strong class="small">Objetivos</strong><ul>${pl.objetivos.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>` : ""}
      <div style="margin-top:12px"><strong class="small">Actividades</strong>
        <table style="margin-top:4px"><tbody>${(pl.actividades ?? []).map((x) => `<tr>
          <td><span class="check ${x.completada ? "si" : "no"}" aria-label="${x.completada ? "Completada" : "Pendiente"}">${x.completada ? "✓" : "○"}</span></td>
          <td class="num small">${formatoFecha(x.fecha)}</td>
          <td>${esc(x.descripcion)}<div class="small muted">${esc([tarea[x.tarea], cuadrilla[x.cuadrilla]].filter(Boolean).join(" · "))}</div></td>
        </tr>`).join("")}</tbody></table>
      </div>
    </div>`;
  }).join("")}</div>`;
}

// ---------- Pestaña: Cuadrillas ----------
function pCuadrillas(a) {
  const p = a.proyecto;
  if (!p.cuadrillas?.length) return `<div class="tarjeta vacio">Sin cuadrillas asignadas.</div>`;
  return `<div class="rejilla-tarjetas">${p.cuadrillas.map((c) => {
    const ts = a.tareas.filter((t) => t.cuadrilla === c.id);
    const activas = ts.filter((t) => t.avance < 100 && fecha(t.fecha_inicio) <= estado.corte);
    return `<div class="tarjeta cuadrilla">
      <div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(c.nombre)}</h3><span class="etiq">${(c.integrantes ?? []).length} personas</span></div>
      <div class="small muted">${esc(c.especialidad || "")} · Líder: ${esc(c.lider || "—")}${c.telefono ? ` · ${esc(c.telefono)}` : ""}</div>
      <ul>${(c.integrantes ?? []).map((i) => `<li>${esc(i.nombre)} <span class="muted small">— ${esc(i.rol)}</span></li>`).join("")}</ul>
      <div style="margin-top:12px"><strong class="small">Trabajando en</strong>
        ${activas.length ? `<ul>${activas.map((t) => `<li>${esc(t.nombre)} ${sem(t.estado.color, `${t.avance}%`)}</li>`).join("")}</ul>` : `<div class="small muted">Sin tareas activas.</div>`}
      </div>
      <div class="small muted" style="margin-top:8px">${ts.length} tareas asignadas en total</div>
    </div>`;
  }).join("")}</div>`;
}

// ---------- Pestaña: Presupuesto ----------
function pPresupuesto(a) {
  const { partidas, planeado, comprometido, ejercido } = a.ppto;
  const max = Math.max(...partidas.map((x) => Math.max(x.planeado, x.comprometido, x.ejercido)), 1);
  const etapa = Object.fromEntries(a.etapas.map((e) => [e.id, e.nombre]));
  const w = (n) => (n / max) * 100;
  return `
    <div class="tarjeta">
      <header style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px">
        <h2>Ejercido contra planeado por partida</h2>
        <div class="leyenda" style="margin:0">
          <span><i class="sw" style="background:var(--superficie-2);border:1px solid var(--eje)"></i>Planeado</span>
          <span><i class="sw" style="background:var(--acento-suave)"></i>Comprometido</span>
          <span><i class="sw" style="background:var(--acento)"></i>Ejercido</span>
          <span><i class="sw" style="background:var(--rojo)"></i>Ejercido sobre lo planeado</span>
        </div>
      </header>
      ${partidas.map((x) => `<div class="ppto-fila" data-tip="${esc(`${x.concepto}\nPlaneado ${moneda(x.planeado)}\nComprometido ${moneda(x.comprometido)}\nEjercido ${moneda(x.ejercido)}`)}">
        <div class="nombre">${esc(x.concepto)}</div>
        <div class="ppto-barra">
          <span class="plan" style="width:${w(x.planeado)}%"></span>
          <span class="comp" style="width:${w(x.comprometido)}%"></span>
          <span class="ejer ${x.ejercido > x.planeado ? "excedido" : ""}" style="width:${w(x.ejercido)}%"></span>
        </div>
        <div class="monto">${monedaCorta(x.ejercido)} / ${monedaCorta(x.planeado)}</div>
      </div>`).join("")}
    </div>
    <div class="tarjeta tabla-cont seccion"><table>
      <thead><tr><th>Partida</th><th>Categoría</th><th>Etapa</th><th class="n">Planeado</th><th class="n">Comprometido</th><th class="n">Ejercido</th><th class="n">Disponible</th><th class="n">% ejercido</th></tr></thead>
      <tbody>${partidas.map((x) => {
        const disp = x.planeado - x.ejercido;
        return `<tr>
          <td>${x.excedido ? sem("rojo", x.concepto) : esc(x.concepto)}</td><td>${esc(x.categoria || "—")}</td><td>${esc(etapa[x.etapa] || "General")}</td>
          <td class="n">${moneda(x.planeado)}</td><td class="n ${x.comprometido > x.planeado ? "texto-rojo" : ""}">${moneda(x.comprometido)}</td>
          <td class="n ${x.ejercido > x.planeado ? "texto-rojo" : ""}">${moneda(x.ejercido)}</td>
          <td class="n ${disp < 0 ? "texto-rojo" : ""}">${moneda(disp)}</td><td class="n">${pct(x.planeado ? (x.ejercido / x.planeado) * 100 : 0)}</td>
        </tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="n">${moneda(planeado)}</td><td class="n">${moneda(comprometido)}</td><td class="n">${moneda(ejercido)}</td><td class="n ${planeado - ejercido < 0 ? "texto-rojo" : ""}">${moneda(planeado - ejercido)}</td><td class="n">${pct(a.ppto.consumo)}</td></tr></tfoot>
    </table></div>`;
}

// ---------- Pestaña: Documentos ----------
function pDocumentos(a) {
  const p = a.proyecto;
  const docs = p.documentos ?? [];
  if (!docs.length) return `<div class="tarjeta vacio">Sin documentos anexos.</div>`;
  const etapa = Object.fromEntries(a.etapas.map((e) => [e.id, e.nombre]));
  return `<div class="tarjeta tabla-cont"><table>
    <thead><tr><th>Documento</th><th>Tipo</th><th>Etapa</th><th>Fecha</th><th></th></tr></thead>
    <tbody>${[...docs].sort((x, y) => (y.fecha || "").localeCompare(x.fecha || "")).map((d) => `<tr>
      <td><strong>${esc(d.nombre)}</strong></td><td><span class="etiq">${esc(d.tipo || "—")}</span></td>
      <td>${esc(etapa[d.etapa] || "General")}</td><td class="num">${formatoFecha(d.fecha)}</td>
      <td>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : ""}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

// ---------- Tooltip compartido ----------
const $tip = document.getElementById("tooltip");
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el) { $tip.style.display = "none"; return; }
  $tip.textContent = el.dataset.tip;
  $tip.style.display = "block";
});
document.addEventListener("mousemove", (e) => {
  if ($tip.style.display !== "block") return;
  const r = $tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  $tip.style.left = `${x}px`; $tip.style.top = `${y}px`;
});

// ---------- Tema claro/oscuro ----------
document.getElementById("tema").addEventListener("click", () => {
  const actual = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const nuevo = actual === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem("tema", nuevo); } catch {}
});
try { const t = localStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t; } catch {}

iniciar();
