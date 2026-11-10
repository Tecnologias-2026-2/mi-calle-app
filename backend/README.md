# Backend de Mi Calle

## Instalación

```bash
npm install
```

## Variables de entorno

Configura estas variables en `.env` y en Render:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
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

## Flujo de registro

- `POST /api/auth/register`: recibe `nombre_completo`, `email` y `password`.
- `POST /api/auth/login`: recibe `email` y `password`, después de verificar el correo.
- `PUT /api/users/me`: requiere `Authorization: Bearer <session>` y actualiza
  `nombre_completo` del usuario autenticado. `telefono` es opcional; si la
  columna aún no existe, el nombre se guarda y el backend devuelve una advertencia.
- `GET /verify?token=...`: verifica el token y activa la cuenta.

El token se genera con `crypto.randomBytes`, expira en 24 horas y se elimina
después de una verificación exitosa. Las contraseñas se guardan usando
`crypto.scrypt`; nunca se almacenan en texto plano.