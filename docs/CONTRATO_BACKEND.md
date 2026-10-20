# Propuesta para la siguiente etapa · Spring Boot

Este documento prepara la integración. **Los endpoints, entidades y servicios siguientes todavía no están implementados.** La entrega actual funciona localmente y debe aprobarse antes de desarrollar el backend.

## Arquitectura de capas

| Capa | Responsabilidad |
| --- | --- |
| Controller | Recibir peticiones HTTP, validar DTO de entrada y devolver respuestas. |
| Service | Reglas del BSC, cálculos, permisos, cierre de ejercicios e importaciones transaccionales. |
| Repository | Consultas y persistencia mediante Spring Data JPA. |
| Entity | Modelo persistente y relaciones. |
| DTO / Mapper | Contratos de entrada/salida sin exponer entidades directamente. |

El frontend conservará las pantallas actuales. Puede servirse desde Spring Boot como recursos estáticos; Thymeleaf es opcional para la plantilla inicial. La elección se cerrará al empezar el backend, evitando reescribir las pantallas que ya funcionan.

## Modelo propuesto

- **Ejercicio:** año único, estado Planificado/En seguimiento/Cerrado, fuente y fecha de importación.
- **Corte:** ejercicio, tipo ANUAL/MENSUAL/TRIMESTRAL, código, fechas de inicio/fin. Un mes y un trimestre son cortes diferentes.
- **Perspectiva, Objetivo e Indicador:** catálogo de cada ejercicio. Indicador conserva unidad, sentido, fórmula descriptiva, frecuencia, responsable, área, umbrales, análisis y recomendación.
- **Meta:** indicador y corte únicos; valor y versiones de cambio. Las metas anuales no deben repartirse automáticamente.
- **Medición:** indicador, corte, valor, fecha de medición opcional, fecha de registro, usuario, observaciones y meta aplicada. Es necesario distinguir fecha del dato y fecha de carga/corrección.
- **Evidencia:** medición, nombre, tipo, tamaño y ubicación del archivo; contenido fuera del JSON de las entidades.
- **PlanAccion, Actividad y Seguimiento:** ejercicio, objetivo, KPI opcional, responsable, plazo, presupuesto opcional, avance, estado e historial.
- **RelacionEstrategica:** objetivos origen/destino del mismo ejercicio y explicación; sin ciclos.
- **Usuario, Rol y Area:** autenticación real, asignaciones y permisos; no reutilizar las contraseñas de demostración como credenciales productivas.
- **Auditoria e Importacion:** usuario, instante, acción, entidad y cambios; resumen/errores de cargas.

Los códigos se pueden repetir entre ejercicios; la identidad persistente debe distinguir ejercicio e identificador. Para comparar años convendrá añadir un identificador estable de indicador, ya que la versión local relaciona nombres normalizados, unidad y sentido.

## Grupos de endpoints propuestos

| Recurso | Operaciones previstas |
| --- | --- |
| `/api/ejercicios` | Listar, crear, copiar estructura, consultar y cambiar estado. |
| `/api/ejercicios/{id}/cortes` | Crear/listar cortes y consultar su planificación. |
| `/api/ejercicios/{id}/objetivos` | CRUD y desempeño por corte. |
| `/api/ejercicios/{id}/indicadores` | CRUD, filtros y ficha técnica. |
| `/api/indicadores/{id}/metas` | Consultar/cambiar metas por corte con historial. |
| `/api/indicadores/{id}/mediciones` | Registrar, consultar y corregir resultados conservando trazabilidad. |
| `/api/mediciones/{id}/evidencias` | Adjuntar, descargar y retirar evidencias con permiso. |
| `/api/ejercicios/{id}/planes` | CRUD de planes, actividades y notas de seguimiento. |
| `/api/ejercicios/{id}/relaciones` | Conexiones del mapa estratégico. |
| `/api/importaciones/preview` y `/api/importaciones/{id}/confirmar` | Revisar diferencias y aplicar actualización o reemplazo de un ejercicio en transacción. |
| `/api/reportes` | Resúmenes, histórico, comparaciones y exportaciones con los mismos filtros de pantalla. |

## Reglas que deberá conservar el servidor

1. Ejercicios aislados y cierre validado en Service, incluyendo importaciones y archivos.
2. Metas por corte; valores ausentes no se convierten en cero. Mantener reglas de cumplimiento del Excel, redondeo y promedios simples.
3. Última medición/corrección del corte como resultado vigente; conservar la meta usada y auditoría. Resolver concurrentes con versión/locking.
4. Copiar estructura sin copiar resultados. La copia de metas es una opción explícita.
5. Importar por transacción: revisión de cambios, confirmación, validación de estructura y conservación de historial según el modo. Reemplazar un año no afecta a los demás.
6. Reportes y exportaciones calculados con las mismas reglas y filtros.
7. Validación de archivos y permisos efectivos en el servidor. Guardar evidencias con sus metadatos y política de acceso.
8. El respaldo debe abarcar datos y archivos. Definir restauración y controles de integridad antes de reemplazar datos.

## Sustitución del guardado local

`js/storage.js` concentra la persistencia local y `js/features.js` las operaciones de pantalla. La migración requerirá un cliente HTTP asíncrono y servicios del frontend que consuman la API; no basta con cambiar una URL. El servidor será la fuente de verdad de datos, permisos y cálculos. El Excel será una entrada de importación y un archivo de referencia, no la base de datos.
