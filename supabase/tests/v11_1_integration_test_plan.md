# Plan de pruebas V11.1 — solo entorno desechable

**No ejecutar en producción.** No se ejecutó SQL ni se conectó a Supabase al
preparar este plan. Los escenarios que usan la migración o Storage requieren
una rama Supabase descartable y datos de prueba sin valor.

## Requisitos

- PostgreSQL 17.11, misma versión/mismo deparser que el destino.
- Proyecto/branch Supabase descartable con Auth y Storage habilitados.
- Snapshot previo a V11: las cinco tablas aprobadas, triggers y policies
  reconocidos por el preflight; bucket `reportes` vacío o con datos de prueba.
- Un usuario ciudadano y dos usuarios administradores de prueba.
- JWT reales para las pruebas PostgREST/Storage. Nunca usar service-role para
  invocar `crear_reporte_completo()`.
- Copia de seguridad de la rama y logs del SQL Editor/PostgREST/Storage.

## 1. Capturar evidencia real antes de migrar

Ejecutar únicamente la auditoría
[`audit_mi_calle_v11_1.sql`](../audits/audit_mi_calle_v11_1.sql) antes de la
migración y guardar el resultado completo. Comparar especialmente:

- `session_user`, `current_user`, `auth.uid()`, rol JWT y nivel de aislamiento;
- definición completa de `registrar_cambio_estado()` con el cuerpo exigido por
  el preflight;
- triggers `auth.users`/tablas públicas, `tgtype`, `tgattr` y deparser;
- policies Storage completas y permisos efectivos;
- vistas, ACL, membresías y funciones `SECURITY DEFINER`.

Si el cuerpo de `registrar_cambio_estado()` o cualquier precondición no
coincide, detenerse; no editar el preflight para que pase.

## 2. PostgreSQL 17.11: catálogo y deparser

Aplicar V11.1 únicamente en la rama descartable con `psql` y parada por error:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261119_stabilize_mi_calle_v11_1.sql
```

Después ejecutar el probe transaccional:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\supabase\tests\v11_1_catalog_compatibility.sql
```

Debe validar el deparser completo de `WITH CHECK`, los arreglos `tgattr[0]` /
`tgattr[1]` para triggers sin columnas y `UPDATE OF`, y terminar con
`ROLLBACK`. No depende de `tgattr::smallint[]`; ese cast se eliminó de la
migración. Si el probe de deparser falla, corregir la expresión esperada solo
tras inspeccionar el `pg_policies.with_check` real y repetirlo en PG 17.11.

## 3. Contrato de fotos y permisos

Con JWT ciudadano y una imagen de prueba:

1. Subir `evidencias/<UUID aleatorio>.(jpg|png|webp)` al bucket `reportes`,
   `upsert:false`; validar que solo coincidan extensiones y MIME aprobados.
2. Intentar `upsert:true`, otra carpeta, extensión no aprobada, MIME/tamaño
   declarado no permitido, nombre no UUID, UUID mayúsculo/forma inválida, ruta
   ya reservada, ruta ya asociada a otro reporte y objeto de otro propietario.
   Todas deben rechazarse.
3. Confirmar que JWT ciudadano no puede listar `storage.objects`, hacer
   `UPDATE`, `DELETE` ni asociar por RPC un objeto de otro usuario.
4. Comprobar que service-role puede consultar existencia y ejecutar la API
   `remove()` (que requiere `SELECT` y `DELETE` efectivos), pero no tiene
   `EXECUTE` en la RPC ciudadana `crear_reporte_completo()`.
5. Descargar una imagen pública por su URL y confirmar que esto no habilita
   listado del bucket ni `SELECT` de `storage.objects` como `anon`.

## 4. Carrera asociación ↔ limpieza (dos sesiones)

Preparar primero un objeto en Storage mediante el JWT real de un ciudadano.
Usar la misma ruta y UUID de reporte durante cada escenario.

### Asociación obtiene primero el bloqueo

1. En sesión A, iniciar `BEGIN ISOLATION LEVEL READ COMMITTED`, establecer el
   contexto JWT de prueba aceptado por el proyecto y llamar
   `crear_reporte_completo()` con los parámetros exactos. No confirmar aún.
2. En sesión B, con contexto service-role, llamar
   `mi_calle_reservar_limpieza_fotografia(path, id_reporte)` y mantener la
   sesión esperando el bloqueo.
3. Confirmar la sesión A. La llamada de B debe completar como `asociado`.
   **No llamar `Storage.remove()`**; confirmar reporte y fotografía presentes.

### Reserva obtiene primero el bloqueo

1. En sesión B, reservar la ruta sin asociación; debe devolver `pendiente`.
   Confirmar la transacción, pero no eliminar aún.
2. En sesión A, como ciudadano autenticado, llamar
   `crear_reporte_completo()` con esa ruta; debe fallar por tombstone.
3. Usar el backend de prueba para eliminar solo esa ruta, confirmar ausencia
   con `Storage.exists()` y finalizar la reserva.
4. Reintentar una llamada de limpieza y confirmar idempotencia; la ruta
   continúa rechazada para una nueva asociación.

Repetir ambos órdenes concurrentes varias veces y verificar que nunca aparece
una fila de fotografía después de que una ruta quedó reservada, ni se borra un
objeto con una asociación confirmada.

## 5. Errores, timeout y reconciliación

- Forzar una respuesta RPC definitiva antes del commit: debe inspeccionar,
  reservar, eliminar, confirmar ausencia y finalizar.
- Simular timeout tras commit: inspección debe devolver `confirmado` y el
  backend responder éxito sin borrar.
- Simular timeout sin commit o resultado ambiguo: conservar el objeto; no
  reservar ni borrar automáticamente.
- Hacer fallar `remove()`, `exists()` y la finalización por separado. La fila
  debe permanecer `pendiente`, registrar intentos/error y bloquear asociación.
- Repetir `npm run reconcile:photos` en el branch y comprobar que el proceso
  es idempotente, limitado a 100 por lote y no incluye objetos recientes,
  rutas no aprobadas ni asociaciones.
- El script no tiene dry-run; validar el conjunto reclamado manualmente antes
  de habilitar una programación recurrente.

## 6. Roles, vistas, bootstrap y rollback

- Probar las vistas desde PostgREST como `anon`/`authenticated`; comprobar
  columnas y tipos, `security_invoker`, y ausencia de `id_usuario`,
  `id_administrador` y `observacion`.
- Probar revocación concurrente de administrador y cambios/consultas
  administrativas con dos sesiones `READ COMMITTED`.
- En SQL Editor de la rama, ejecutar primero un `SELECT` de
  `session_user`, `current_user`, `auth.uid()`, `current_setting('role', true)`,
  `transaction_isolation` y `mi_calle.bootstrap_first_admin`. El bootstrap
  solo se ensaya si `session_user = current_user = 'postgres'`, `auth.uid()` es
  NULL y la transacción es `READ COMMITTED`; nunca asumirlo por el nombre del
  rol mostrado en la interfaz.
- Para rollback de postcheck: usar una **copia desechable** del archivo de
  migración, cambiar deliberadamente una expresión esperada del postcheck,
  ejecutarla con `ON_ERROR_STOP`, confirmar el error y volver a ejecutar la
  auditoría. No editar ni ejecutar esa variante fuera del branch descartable.

Registrar resultado, versión exacta, JWT-role, orden de sesiones, RPC/HTTP
status y estado de Storage para cada caso. Ninguno de estos pasos se considera
validado hasta que se ejecute y se adjunte evidencia real.
