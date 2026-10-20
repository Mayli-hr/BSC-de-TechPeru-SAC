# BSC TechPeru SAC · Frontend v4

Aplicación web para consultar, planificar y seguir el Balanced Scorecard de TechPeru SAC. Incluye los datos reales del Excel recibido y las mejoras de seguimiento. **Esta entrega es el frontend. El backend Spring Boot todavía no está implementado.**

## Abrir

1. Descomprime todo el ZIP.
2. Entra a `BSC_Frontend_v4` y abre `index.html` con Chrome o Edge actualizado.
3. Pulsa Ingresar: `admin@demo.com` / `BSC2026!`. Los campos vienen completos.

No requiere Internet, compilación, servidor ni instalación. Se conservan las cuentas de demostración `gerente@demo.com` y `responsable@demo.com`, con la misma contraseña.

## Datos iniciales

El Excel aporta **2025: 4 perspectivas, 12 objetivos, 36 KPI y 36 resultados anuales acumulados**. Cumplimiento verificado: **84.2%**, con **11 logrados, 19 en riesgo y 6 críticos**. Incluye metas, reales, unidades, sentido de cálculo y los 36 análisis/recomendaciones. La copia del Excel en `datos/` permanece sin cambios.

No contiene historia mensual, fechas de medición, responsables, presupuestos, planes de acción ni conexiones causales. Esos campos quedan pendientes hasta registrarlos. La separación entre análisis y recomendación conserva el texto original y puede editarse en la ficha.

## Ejercicios y cortes

- **Ejercicio anual:** puedes crear años históricos o futuros entre 2000 y 2099, por ejemplo 2020, 2021 o 2027. En Administración → Crear ejercicio puedes copiar objetivos e indicadores del ejercicio activo o comenzar vacío.
- La copia de estructura **no copia resultados, mediciones, evidencias, análisis ni planes**. Copiar metas anuales es opcional y está desmarcado inicialmente. Conserva las relaciones del mapa si copias la estructura.
- El selector superior **Período** cambia de año; **Corte** cambia entre el acumulado anual, meses y trimestres de ese año. Los datos de cada ejercicio permanecen separados.
- Cortes admitidos: `2025`, `2025-01` y `2025-Q1` (hasta mes 12 y trimestre 4). Solo se admiten cortes del año activo. La fecha del resultado es opcional; si se indica debe pertenecer al corte.
- En **Administración → Planificar metas** puedes definir las metas de todos los KPI para un corte, incluso futuro. También puedes hacerlo por KPI desde su detalle.
- Las metas mensuales, trimestrales y anuales son independientes. **No se divide la meta anual ni se suman/promedian cortes automáticamente**: la agregación correcta depende de cada indicador. Registrar un mes o trimestre no cambia el acumulado anual; este se registra en su propio corte.
- Estados: **Planificado**, **En seguimiento** y **Cerrado**. Cerrar bloquea las modificaciones de datos del ejercicio; puedes consultar/exportar y reabrirlo en Administración. El cierre es un control del prototipo local.

## Pantallas

| Pantalla | Uso |
| --- | --- |
| Dashboard | Índice global, semáforos con filtros, perspectivas, cinco KPI prioritarios y cinco de mejor desempeño, resumen de planes. |
| Perspectivas | Pestañas de las cuatro perspectivas, objetivos e indicadores del corte. |
| Mapa estratégico | Objetivos y conexiones de causa y efecto definidas por ti, con explicación y prevención de ciclos. |
| Objetivos | Fichas y desempeño de los KPI asociados; creación y edición. |
| Indicadores | Búsqueda y filtros; ficha técnica, metas, resultados, brecha, análisis y recomendación. |
| Matriz BSC | Vista completa por perspectiva/objetivo con los análisis y recomendaciones del Excel. Exportación filtrada CSV y XLSX. |
| Registro de resultados | Historial por indicador/corte, meta aplicada, responsable, notas y evidencias. |
| Planes de acción | Crear planes desde recomendaciones, asignar responsable/plazo/presupuesto opcional, actividades, avance, vencimientos y bitácora. |
| Reportes | Resumen, perspectivas, KPI, matriz, atención, planes, historial del corte y comparación anual. CSV, XLSX e impresión/PDF. |
| Administración | Ejercicios, metas, áreas, cuentas de demostración, importación, respaldos y registro de cambios. |

Los gráficos muestran una distribución del semáforo hasta contar con al menos dos cortes con cumplimiento calculable. La evolución mensual o trimestral usa sus metas específicas; la comparación anual informa que los catálogos pueden diferir. El comparativo detallado relaciona KPI por nombre, unidad y sentido, y muestra los faltantes sin convertirlos en cero.

## Registrar resultados y evidencias

Desde un indicador o Registro de resultados, elige corte, valor y meta. Cada medición conserva **la meta usada en su registro** para interpretar el historial aunque después cambie la planificación. El valor vigente de un corte es el de su último registro o corrección, según la fecha de registro, no una suma de registros.

Puedes adjuntar hasta **tres evidencias por medición**, en PNG, JPG, WebP o PDF, de hasta **5 MB cada una**. Se pueden consultar y descargar desde el historial. Los archivos se guardan en este navegador; usa el respaldo ZIP para trasladarlos junto con los datos.

## Planes de acción

La recomendación se propone como descripción al crear un plan desde un KPI. Completa responsable, inicio y vencimiento. El presupuesto es opcional. En Seguimiento puedes añadir actividades y notas. Con actividades, el avance es el porcentaje de actividades completadas; sin ellas puedes registrar un avance manual. El historial conserva usuario, estado, fecha, avance y nota. Un plan pendiente fuera de plazo se identifica como vencido.

## Actualizar desde Excel

1. Usa una copia del Excel incluido en `datos/` con su estructura original.
2. Edita **Meta (F)** y **Real (G)** de **BSC Completo**. Conserva las columnas, perspectivas y códigos de objetivo. Para cambiar análisis/recomendaciones, edita la columna I de las hojas por perspectiva.
3. Guarda como `.xlsx` y pulsa **Cargar Excel** en la web. Límite: 10 MB, sin contraseña.
4. Revisa nuevos, modificados, ausentes y valores anteriores/nuevos. Puedes cancelar.
5. **Actualizar** conserva historial, metas de otros cortes, evidencias, planes, conexiones y registros no presentes en el archivo. Relaciona KPI por nombre normalizado; conserva sus responsables/áreas asignados. No aplica los resultados anuales a meses o trimestres.
6. **Reemplazar SOLO este ejercicio** descarta el catálogo, historial y planes de ese año y usa el contenido del archivo. Los demás años se conservan. Exporta un respaldo antes si necesitas guardar esa historia.

El año se obtiene del Excel. Si no existe se crea un ejercicio; si está cerrado hay que reabrirlo para importar. **Meta y Real de BSC Completo son la fuente principal**; las hojas de perspectiva aportan los análisis. Si hay diferencias entre hojas se avisa en la revisión. El resumen se recalcula; no se toman los textos fijos de la hoja Dashboard.

Cambiar el Excel de la carpeta no actualiza automáticamente la web. Los cambios hechos en la web tampoco escriben sobre el Excel. Los XLSX exportados son **reportes**, no la plantilla de importación original. Para trasladar todo el trabajo, usa el respaldo ZIP.

## Cálculo

- Directo: Real / Meta × 100. Inverso: Meta / Real × 100.
- Se redondea cada cumplimiento a un decimal y no se limita al 100%.
- Umbrales iniciales: verde desde 90%, ámbar desde 75%, rojo por debajo de 75%. Se pueden ajustar en la ficha del KPI.
- **Verde no significa meta completa**: la brecha indica cuánto falta para llegar al 100% o mejorar la meta según el sentido. En unidades `%`, la brecha se expresa en puntos porcentuales.
- Índice global: promedio simple de los KPI calculables, como en el Excel; igual criterio por perspectiva y objetivo. Se retiraron los controles de ponderación que no intervenían en ese cálculo.
- Vacíos no equivalen a cero. Siguiendo las fórmulas del archivo, meta o real igual a cero produce “sin cálculo” y no entra al promedio.
- Para un KPI nuevo de rango: 100% dentro de los límites y reducción proporcional a la distancia fuera de ellos. No es un tipo presente en los 36 KPI originales.

## Guardado y copias

Esta versión guarda los datos en `localStorage` y las evidencias en IndexedDB del navegador. No hay base de datos de servidor ni datos compartidos entre equipos. Mantén el mismo navegador, perfil y ubicación de la carpeta; el modo privado, mover la carpeta o borrar los datos de navegación puede hacer que no aparezca ese estado.

- **Respaldo ZIP:** todos los ejercicios, usuarios de demostración, metas, mediciones, planes, conexiones, bitácoras y archivos de evidencia. Es la copia completa y se restaura desde Administración.
- **Exportar JSON:** datos de todos los ejercicios y referencias a evidencias, **sin los archivos adjuntos**. No sustituye al ZIP si usas evidencias.
- **Restaurar respaldo ZIP / JSON:** muestra una revisión y reemplaza los datos de todos los ejercicios del navegador. No modifica el Excel original.
- **Restaurar Excel inicial:** reemplaza únicamente 2025 con el conjunto original; mantiene los otros ejercicios.

CSV y XLSX reflejan el tipo de reporte y los filtros visibles. Para PDF utiliza Imprimir / PDF y elige Guardar como PDF en el navegador.

## Código y siguiente etapa

`index.html` es la entrada. `css/styles.css` conserva la base visual y `css/features.css` contiene los componentes nuevos. `js/app.js` conserva el arranque y los formularios base; `js/features.js` integra las nuevas pantallas y reglas. `js/storage.js` concentra ejercicios/persistencia/evidencias; `js/export.js`, exportaciones/respaldos; `js/excel.js`, lectura y adaptación del Excel; `js/datos-techperu.js`, datos iniciales. `js/vendor/` contiene Chart.js 4.4.4 y JSZip 3.10.1 con sus licencias, para funcionar sin conexión. `html/` conserva accesos directos a las pantallas; abre la misma aplicación.

La autenticación y los roles son de demostración. El siguiente paso será conectar este frontend a Spring Boot mediante **arquitectura de capas: Controller → Service → Repository → base de datos**, con entidades y DTO. No se incluye código backend en este ZIP. Consulta `docs/CONTRATO_BACKEND.md` para la propuesta que deberá validarse al iniciar esa etapa.

## Verificación

Se contrastó el conjunto original con el Excel y se probaron las diez pantallas sin conexión, 36 KPI/12 objetivos/84.2%, filtros, mediciones anuales/mensuales/trimestrales, metas independientes, evidencias, planes y actividades, conexiones del mapa, importación con revisión/cancelación/actualización, ejercicios 2020/2025/2027, cierre/reapertura, recarga, reportes CSV/XLSX y respaldo/restauración ZIP en un navegador nuevo con sus evidencias. Se comprobó disposición de escritorio/móvil y selección de año en móvil, sin errores JavaScript en esas pruebas.
