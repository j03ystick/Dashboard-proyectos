# Dashboard de proyectos

Tablero visual para dar seguimiento a los proyectos asignados: etapas, tareas, planes de trabajo,
cuadrillas, documentos, semáforos, alertas de retraso y control de presupuesto.

Es un sitio **estático** (HTML + CSS + JavaScript) que lee archivos **JSON**. No necesita servidor
ni base de datos, y los datos se pueden capturar en **Excel** y convertir a JSON con un script.

## Cómo verlo

Los navegadores no permiten leer archivos JSON si abres `index.html` con doble clic, así que hay
dos opciones:

**En tu computadora**

```bash
cd Dashboard-proyectos
python -m http.server 8000
```

Luego abre <http://localhost:8000>.

**En internet con GitHub Pages**

En GitHub: *Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`*.
El tablero queda en `https://<usuario>.github.io/Dashboard-proyectos/`.
⚠️ Si el repositorio es público, los datos también lo son.

## Qué muestra

**Vista general (portafolio)**

- Indicadores: número de proyectos por semáforo, alertas abiertas, tareas abiertas y presupuesto ejercido.
- Una tarjeta por proyecto con su semáforo, avance real contra esperado, consumo de presupuesto y etapa actual.
- Búsqueda y filtro por semáforo.
- Lista de alertas de todos los proyectos, ordenadas por gravedad.

**Detalle de proyecto** (clic en una tarjeta)

| Pestaña | Contenido |
|---|---|
| Resumen | Cronograma por etapa y tarea (tipo Gantt) con la fecha de corte, alertas del proyecto y bitácora |
| Tareas | Tabla con semáforo, responsable, cuadrilla, fechas, avance y horas plan/real |
| Planes de trabajo | Planes semanales con objetivos y actividades marcadas como hechas |
| Cuadrillas | Integrantes, líder, contacto y tareas en las que trabaja cada cuadrilla |
| Presupuesto | Gráfica y tabla de planeado, comprometido, ejercido y disponible por partida |
| Documentos | Documentos anexos con liga para abrirlos |

Incluye modo claro/oscuro (botón **Tema**) y se adapta a celular.

## Estructura del repositorio

```
index.html               Página principal
css/estilos.css          Estilos (colores en variables al inicio)
js/app.js                Carga de datos y vistas
js/calculos.js           Reglas de semáforos, avance, presupuesto y alertas
data/config.json         Configuración general y lista de proyectos a mostrar
data/proyectos/*.json    Un archivo por proyecto
documentos/              Archivos anexos (una carpeta por proyecto)
plantillas/              Plantillas de Excel
scripts/excel.py         Conversión Excel ⇄ JSON
```

## Cómo agregar o actualizar un proyecto

### Opción A: con Excel (recomendado)

1. Instala la librería una sola vez: `pip install openpyxl`
2. Copia `plantillas/plantilla_proyecto.xlsx` (o el Excel de un proyecto existente, por ejemplo `plantillas/PRY-2026-001.xlsx`).
3. Llena las hojas. La hoja **Instrucciones** explica cada una.
4. Convierte:

   ```bash
   python scripts/excel.py a-json plantillas/mi_proyecto.xlsx
   ```

   Esto crea o reemplaza `data/proyectos/<id>.json`, revisa que las referencias sean válidas
   (etapas, cuadrillas, tareas) y agrega el proyecto a `data/config.json` si es nuevo.
5. Sube los cambios a GitHub.

Para sacar a Excel un proyecto que ya está en JSON:

```bash
python scripts/excel.py a-excel data/proyectos/PRY-2026-001.json   # crea plantillas/PRY-2026-001.xlsx
```

### Opción B: editando el JSON

Copia uno de los archivos de `data/proyectos/`, cámbialo y agrega su ruta a la lista `proyectos` de
`data/config.json`.

## Modelo de datos

Todas las fechas van en formato `AAAA-MM-DD`. Los montos son números sin formato.

### `data/config.json`

| Campo | Descripción |
|---|---|
| `titulo` | Título que aparece en la barra superior |
| `responsable` | Tu nombre |
| `moneda` | Moneda para los montos (`MXN`, `USD`…) |
| `fecha_corte` | Fecha contra la que se evalúa todo. `null` = hoy. Útil para revisar "cómo estábamos" en una fecha |
| `proyectos` | Lista de rutas a los JSON de proyectos que se muestran |
| `umbrales` | Puntos de corte de los semáforos (ver abajo) |

### Proyecto (`data/proyectos/<id>.json`)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | Clave única, p. ej. `PRY-2026-001`. Es también el nombre del archivo |
| `nombre`, `cliente`, `ubicacion`, `responsable`, `descripcion` | texto | Datos generales |
| `estado` | texto | `planeacion`, `en_curso`, `pausado`, `terminado` o `cancelado` |
| `prioridad` | texto | `alta`, `media` o `baja` |
| `fecha_inicio`, `fecha_fin` | fecha | Fechas planeadas del proyecto |
| `moneda` | texto | Moneda del proyecto |
| `etapas` | lista | Ver **Etapa** |
| `tareas` | lista | Ver **Tarea** |
| `cuadrillas` | lista | Ver **Cuadrilla** |
| `planes_trabajo` | lista | Ver **Plan de trabajo** |
| `presupuesto.partidas` | lista | Ver **Partida** |
| `documentos` | lista | Ver **Documento** |
| `bitacora` | lista | Notas: `fecha`, `autor`, `nota` |

**Etapa**: `id` (p. ej. `E1`), `nombre`, `fecha_inicio`, `fecha_fin`.
El avance y semáforo de la etapa se calculan a partir de sus tareas.

**Tarea**

| Campo | Descripción |
|---|---|
| `id` | Clave, p. ej. `T01` |
| `etapa` | `id` de la etapa a la que pertenece |
| `nombre`, `responsable` | |
| `cuadrilla` | `id` de la cuadrilla asignada, o `null` |
| `fecha_inicio`, `fecha_fin` | Fechas planeadas |
| `fecha_fin_real` | Fecha en que realmente terminó, o `null` |
| `avance` | 0 a 100 |
| `horas_plan`, `horas_real` | Tiempo de ejecución. `horas_plan` también es el peso de la tarea en el avance |

**Cuadrilla**: `id` (p. ej. `C1`), `nombre`, `especialidad`, `lider`, `telefono`,
`integrantes` (lista de `nombre` y `rol`).

**Plan de trabajo**: `id`, `titulo`, `fecha_inicio`, `fecha_fin`, `objetivos` (lista de textos) y
`actividades` (cada una con `fecha`, `descripcion`, `tarea`, `cuadrilla`, `completada` verdadero/falso).

**Partida de presupuesto**: `id`, `concepto`, `categoria`, `etapa` (`id` o `null` si es general),
`planeado`, `comprometido` (contratado u ordenado) y `ejercido` (pagado).

**Documento**: `id`, `nombre`, `tipo` (Contrato, Plano, Permiso, Reporte, Minuta…), `etapa`, `fecha`,
`url` (ruta dentro de `documentos/` o un enlace externo).

En Excel, las cuadrillas y sus integrantes van en hojas separadas (`Cuadrillas` e `Integrantes`), igual
que los planes y sus actividades (`Planes` y `Actividades`).

## Reglas de semáforos y alertas

Todo se calcula en `js/calculos.js` contra la **fecha de corte**. Los números se ajustan en
`umbrales` de `data/config.json`.

**Avance esperado**: lo que una tarea debería llevar si avanzara parejo entre su inicio y su fin.
El avance del proyecto y de cada etapa es el promedio de sus tareas ponderado por `horas_plan`.

**Tarea**

| Semáforo | Condición |
|---|---|
| 🔵 Completada | avance = 100 |
| ⚪ Por iniciar | todavía no llega su fecha de inicio |
| 🔴 Vencida | pasó su fecha de fin y no está al 100 |
| 🔴 Atrasada | esperado − real ≥ `tarea_desviacion_rojo` (25 puntos) |
| 🟡 En riesgo | esperado − real ≥ `tarea_desviacion_amarillo` (10 puntos) |
| 🟡 Por vencer | faltan `tarea_dias_por_vencer` (5) días o menos y va abajo de 90% |
| 🟢 En tiempo | en otro caso |

**Proyecto**: toma el peor de dos semáforos.

- *Cronograma*: rojo si va `proyecto_desviacion_rojo` (15) puntos abajo de lo esperado; amarillo si va
  `proyecto_desviacion_amarillo` (5) puntos abajo o tiene alguna tarea en rojo.
- *Costo*: compara % del presupuesto ejercido contra % de avance físico. Rojo si el gasto va
  `presupuesto_desviacion_rojo` (15) puntos adelante del avance o si se ejerció más del total;
  amarillo si va `presupuesto_desviacion_amarillo` (5) puntos adelante o alguna partida está excedida.

**Alertas** que se generan:

- Crítica: tarea vencida.
- Alta: tarea atrasada, partida con ejercido mayor al planeado, gasto muy adelantado al avance.
- Media: tarea en riesgo o por vencer, partida con comprometido mayor al planeado, gasto adelantado al avance.

## Próximos pasos sugeridos

- Cargar los proyectos reales con la plantilla de Excel.
- Conectar otros repositorios de proyectos: cada repositorio puede tener su propio JSON y agregarse a
  `proyectos` en `config.json` con su URL (por ejemplo la URL "raw" de GitHub, si ese repositorio es público).
- Automatizar la conversión de Excel con una GitHub Action al subir un `.xlsx`.
- Exportar a PDF un reporte semanal por proyecto.
