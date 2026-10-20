# Cambios del frontend v4

Se conservan la identidad visual, navegación, módulos CRUD útiles y datos reales del Excel. Se amplía el flujo para planificar y hacer seguimiento.

## Añadido

- Ejercicios históricos y futuros, selector de año, copia de estructura sin resultados, metas opcionales y estados del ejercicio.
- Cortes anuales, mensuales y trimestrales con metas propias; planificación de metas por lote y por KPI.
- Pestañas de perspectivas y matriz completa con análisis/recomendación.
- Brecha hasta la meta completa y sentido del indicador, separados del semáforo de alerta.
- Semáforos clicables, rankings y resumen de acciones del dashboard.
- Mediciones con meta histórica, observaciones, fecha opcional y evidencias descargables.
- Planes vinculados a recomendaciones, actividades, progreso, estados, plazos, vencimientos y bitácora.
- Conexiones explícitas entre objetivos, con explicación y validación de ciclos.
- Importación con revisión de cambios: actualizar conservando historia o reemplazar solo un ejercicio.
- Reportes filtrados por tipo, búsqueda, perspectiva/estado; CSV, XLSX y PDF mediante impresión; comparación anual.
- Respaldo/restauración de todos los ejercicios y evidencias en ZIP; JSON de datos.
- Áreas configurables, registro de cambios y guía de uso.

## Ajustado o retirado

- Los controles de peso se retiraron de las fichas activas: el Excel usa promedios simples.
- Se reemplazó la tendencia ficticia por distribución del semáforo mientras no existan al menos dos resultados calculables de cortes distintos.
- Se eliminaron desplegables decorativos sin acción; ayuda y notificaciones abren información real del BSC.
- Los reportes de planes muestran planes y sus estados, y las exportaciones usan el mismo conjunto de datos de la vista.
- Los meses no se comparan automáticamente contra la meta anual, ni se inventa su evolución.
- El año dejó de ser un campo que sobreescribe el conjunto actual: cada ejercicio se guarda por separado.

## Pendiente para Spring Boot

Base de datos, autenticación real, permisos en servidor, acceso compartido/concurrente y persistencia central de evidencias. Se propone arquitectura de capas en CONTRATO_BACKEND.md.
