# Backend de Mi Calle

## Instalación

```bash
npm install
```

## Variables de entorno

Configura estas variables en `.env` y en Render:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_clave_anon_o_publishable
SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role
SESSION_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
EMAIL_SERVICE=gmail
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=tu-app-password
VERIFICATION_URL=https://tu-backend.onrender.com/verify
PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY` solo debe existir en el backend. No debe incluirse
en HTML, JavaScript del navegador ni repositorios públicos.
`SUPABASE_ANON_KEY` (o `SUPABASE_PUBLISHABLE_KEY`) se usa con el JWT Supabase
del usuario. El cliente service-role no debe invocar RPC de usuario ni simular
su identidad.

## Flujos de autenticación heredados

- `POST /api/auth/register`: recibe `nombre_completo`, `email` y `password`.
- `POST /api/auth/login`: recibe `email` y `password`, después de verificar el correo.
- `PUT /api/users/me`: requiere `Authorization: Bearer <session>` y actualiza
  `nombre_completo` y `telefono_contacto` del usuario autenticado. El teléfono
  puede ser nulo o estar vacío.
- `GET /verify?token=...`: verifica el token y activa la cuenta.

Estos endpoints aún representan el sistema HMAC/`public.usuarios` anterior y
no son compatibles con la arquitectura Auth V11. No deben usarse como prueba
de compatibilidad con Supabase Auth.

## Reportes V11.1 propuestos

`POST /reportes` requiere `Authorization: Bearer <access_token Supabase>` y
`multipart/form-data` con `tipo_problema`, `descripcion`, `latitud`,
`longitud`, `direccion_texto` y `fotografia` JPEG/PNG/WebP de máximo 5 MB.
El backend verifica el JWT, valida firma y decodificación de imagen, sube con
`upsert:false` a `reportes/evidencias/<UUID aleatorio>.<jpg|png|webp>` y llama a
`crear_reporte_completo(...)` con el cliente que lleva el JWT real del usuario.
El nombre aleatorio no reemplaza la comprobación SQL de bucket, ruta,
`owner_id`, MIME, tamaño y existencia del objeto.

La llamada a `crear_reporte_completo()` siempre usa el cliente del ciudadano;
la clave `service_role` nunca se usa para simular `auth.uid()`. El backend
inspecciona resultados inciertos mediante una RPC servidor-only, no con
consultas directas de service-role a las tablas de negocio.

### Compensación y reconciliación de Storage

PostgreSQL no revierte bytes almacenados en Storage. Si la RPC devuelve un
error definitivo, el backend pide primero una reserva de limpieza. La RPC
reserva la ruta solo si no existe reporte/fotografía asociado y bloquea la fila
de `storage.objects`; `crear_reporte_completo()` toma el mismo bloqueo y
rechaza cualquier ruta tombstoned. Así, asociación y eliminación no compiten
mediante una comprobación separada vulnerable a TOCTOU.

Después de reservar, el backend llama `Storage.remove()` únicamente para la
ruta temporal recibida, registra el resultado, y comprueba la ausencia con
`Storage.exists()`. Solo entonces marca la reserva como eliminada. Si el objeto
sigue presente, el API falla, la comprobación es incierta o falla la
finalización, la reserva permanece pendiente, se registra el error y la ruta
no puede volver a asociarse. No se conceden `UPDATE` ni `DELETE` a
`anon`/`authenticated`; el API de Storage necesita `SELECT` y `DELETE` efectivos
para el cliente servidor `service_role`.

Ante timeout o respuesta incierta de la RPC de creación, el backend inspecciona
primero si reporte y fotografía quedaron confirmados. Si no puede demostrar un
fallo definitivo sin asociación, conserva el objeto y no reserva ni elimina.

El job `npm run reconcile:photos` reclama objetos mayores de 24 horas del
bucket `reportes` bajo `evidencias/`, excluye rutas asociadas en
`fotografias`, y los procesa con el mismo protocolo de reserva/confirmación.
Las reservas pendientes sobreviven a fallos y son reintentables. El job borra
objetos y **no tiene modo dry-run**: no debe programarse en producción hasta
probarse en un proyecto desechable y aprobarse el periodo de gracia, métricas,
alertas y operación. No se ejecutó ni programó en esta entrega.

`GET /reportes` consulta `reportes_publicos`; `GET /reportes?mine=true` requiere
JWT y usa `mis_reportes()`. Las rutas V11.1 son una propuesta local: Supabase
no se ha modificado ni se ha probado. El frontend todavía necesita emitir y
enviar tokens Supabase; las sesiones HMAC no sirven para estos endpoints.