🌐 Nombre del Proyecto
Mi Calle App

Aplicación web colaborativa orientada al reporte, seguimiento y gestión de daños en la infraestructura vial (huecos, grietas, alcantarillas sin tapa, etc.), funcionando como puente de comunicación entre la ciudadanía y las entidades responsables del mantenimiento vial.

👥 Integrantes
Karen Rodríguez – 1202852
Katerin Suarez – Código
Julián Mendoza – 1202868

🎯 1. Objetivo General

Desarrollar una aplicación web denominada Mi Calle, que permita a los ciudadanos reportar daños en la infraestructura vial mediante fotografías, ubicación geográfica y descripciones, facilitando la visualización, seguimiento y gestión de dichos reportes hasta su solución por parte de las entidades responsables, centralizando la información y solucionando la dispersión o desconocimiento de los canales de reporte tradicionales.

🌍 2. Contexto de Uso

¿Quién va a usar el sistema?
El sistema involucra principalmente a cuatro tipos de actores:
- Ciudadanos: Registran reportes de incidencias viales, consultan el mapa comunitario y realizan el seguimiento a sus solicitudes.
- Administradores: Revisan los reportes recibidos, validan la información enviada por la comunidad y actualizan el estado de los casos.
- Alcaldía / Entidades responsables: Reciben los reportes gestionados para ejecutar las reparaciones en la infraestructura vial.
- Comunidad: Consulta los reportes existentes y se beneficia de las mejoras viales en su sector.

¿Cómo se va a utilizar el sistema?
Mi Calle se utilizará principalmente desde dispositivos móviles y computadores con acceso a internet. Permite que un ciudadano reporte rápidamente un daño vial (tomando una foto, seleccionando la ubicación geográfica y redactando una breve descripción) o consulte el mapa para verificar incidencias previas sin duplicar reportes. Además, permite hacer seguimiento al avance del reporte en estados como *Pendiente*, *En revisión*, *En proceso* y *Reparado*.

📋 3. Requerimientos del Sistema
3.1 Requerimientos Funcionales

- RF01: El sistema deberá permitir el registro de nuevos usuarios (ciudadanos) mediante correo electrónico y contraseña.
- RF02: El sistema deberá permitir la autenticación (inicio y cierre de sesión) validando credenciales de usuarios registrados.
- RF03: El sistema deberá permitir que un ciudadano cree y registre un reporte de daño vial asociado a su usuario.
- RF04: El sistema deberá permitir adjuntar una fotografía como evidencia del daño reportado.
- RF05: El sistema deberá permitir seleccionar la ubicación del incidente utilizando GPS o un mapa interactivo.
- RF06: El sistema deberá permitir ingresar una descripción textual complementaria del reporte.
- RF07: El sistema deberá permitir la visualización de un mapa comunitario interactivo con todos los reportes registrados.
- RF08: El sistema deberá permitir a los ciudadanos consultar el historial y estado de sus propios reportes enviados.
- RF09: El sistema deberá permitir a los administradores actualizar el estado del reporte (*Pendiente*, *En revisión*, *En proceso*, *Reparado*).
- RF10: El sistema deberá permitir consultar el detalle completo de un reporte (fotografía, ubicación, descripción, fecha y estado).
- RF11: El sistema deberá permitir a los administradores descartar reportes falsos o con información insuficiente registrando una observación obligatoria, ocultándolos de inmediato del mapa público y eliminándolos automáticamente tras 24 horas.
- RF12: El sistema deberá permitir a los usuarios ciudadanos recuperar su contraseña mediante correo electrónico y actualizar su contraseña o datos de contacto desde su perfil.

3.2 Requerimientos No Funcionales

- RNF01 (Responsividad): La interfaz deberá adaptarse a dispositivos móviles y de escritorio con un enfoque mobile-first y diseño responsive.
- RNF02 (Usabilidad y accesibilidad visual): La interfaz deberá utilizar la paleta cromática de Mi Calle y tipografía legible (`Nunito` y `Nunito Sans`), con contraste accesible conforme a WCAG AA.
- RNF03 (Seguridad y control de acceso): La autenticación se realizará con Supabase Auth y tokens JWT; las contraseñas serán protegidas mediante el mecanismo de hash de Supabase Auth (bcrypt) y las políticas RLS diferenciarán los roles `ciudadano` y `administrador`.
- RNF04 (Integridad y validación de datos): Los datos deberán validarse en el cliente y el servidor. PostgreSQL aplicará constraints `CHECK`, triggers y RPCs para los tipos de problema, las coordenadas geográficas, el formato del teléfono, el tamaño y tipo de fotografía y la longitud de contraseña (de 8 a 64 caracteres).
- RNF05 (Arquitectura desacoplada y disponibilidad): La arquitectura separa el frontend estático (GitHub Pages), la API REST (Node.js/Express en Render) y los servicios de base de datos y almacenamiento (Supabase).
- RNF06 (Gestión eficiente de almacenamiento): Las fotografías de evidencia se almacenarán en Supabase Storage y se gestionarán los archivos huérfanos o asociados a reportes descartados mediante el flujo de limpieza y reconciliación.
- RNF07 (Rendimiento y retroalimentación): La interfaz mostrará estados de carga (spinners), manejará los errores de forma controlada y ofrecerá visualización de marcadores geográficos con Leaflet y mapas de OpenStreetMap.
- RNF08 (Mantenibilidad): El código estará organizado por portales y vistas, con servicios compartidos (`frontend-services.js`), backend modular y migraciones SQL versionadas.

🧠 4. Diagramas UML

Diagrama de Casos de Uso

Muestra las interacciones principales entre los actores (*Ciudadano* y *Administrador*) y las funcionalidades del sistema, abarcando desde la autenticación/registro hasta la creación, consulta, visualización en mapa y gestión del estado de reportes viales.

<img width="791" height="269" alt="image" src="https://github.com/user-attachments/assets/69530d34-c1c2-40da-ae40-60589f52fba3" />

<img width="791" height="206" alt="image" src="https://github.com/user-attachments/assets/5ac140f5-41ce-4011-8570-536f7dc6521b" />

<img width="792" height="337" alt="image" src="https://github.com/user-attachments/assets/e738d019-cae4-4e25-bda7-50472ddca806" />

<img width="792" height="228" alt="image" src="https://github.com/user-attachments/assets/038e8d15-6442-4f9e-a337-3553fb4a56df" />

<img width="795" height="295" alt="image" src="https://github.com/user-attachments/assets/676c25f4-fab2-4e47-92fd-7ef184ff1f2f" />

<img width="794" height="292" alt="image" src="https://github.com/user-attachments/assets/7be374b1-01c1-448a-aac6-5b6e071e64a6" />


Diagrama de Secuencia

Representa el flujo cronológico y el intercambio de mensajes entre la interfaz de usuario, el servidor y la base de datos para los procesos clave del sistema: inicio de sesión, registro de usuario, generación de reportes, consulta en el mapa comunitario, seguimiento de reportes y gestión de estado por parte del administrador.

<img width="864" height="262" alt="image" src="https://github.com/user-attachments/assets/54159ba0-7ce7-4d09-a111-61f2b1cfe4db" />

<img width="873" height="332" alt="image" src="https://github.com/user-attachments/assets/83890b21-6bc3-4e1b-8e77-b617f1b8ea1c" />

<img width="898" height="374" alt="image" src="https://github.com/user-attachments/assets/f8af53f2-60e7-443d-a627-8946638a1bd6" />


🎨 5. URL del Prototipo

Colocar aquí el enlace público de Figma:

https://www.figma.com/design/mL1u46HoOR1gWD4mI6yS2f/Mi-calle?node-id=0-1&t=cx6oGU4D29Q28sYZ-1


🗄️ 6. Diseño de Base de Datos

### Modelo relacional

<img width="855" height="624" alt="image" src="https://github.com/user-attachments/assets/07c1600f-a301-42cf-a838-a6a3e81a34e8" />

### Tablas principales

Las siguientes tablas corresponden al esquema de PostgreSQL/Supabase y a las restricciones verificadas por las migraciones del repositorio:

| Tabla | Propósito | Llave primaria y relaciones |
|---|---|---|
| `perfiles` | Guarda el perfil y el rol (`ciudadano` o `administrador`) asociado a la cuenta. | PK `id_usuario`; FK `id_usuario` → `auth.users(id)` con borrado en cascada. |
| `ubicaciones` | Guarda la latitud, longitud y dirección textual del incidente. | PK `id_ubicacion`. `reportes.id_ubicacion` referencia esta llave. |
| `reportes` | Guarda el problema vial, descripción, autor, ubicación, estado y fechas. | PK `id_reporte`; FK `id_usuario` → `perfiles.id_usuario`; FK `id_ubicacion` → `ubicaciones.id_ubicacion`. |
| `fotografias` | Relaciona un reporte con la evidencia almacenada en Supabase Storage. | PK `id_fotografia`; FK `id_reporte` → `reportes.id_reporte` con borrado en cascada; cada reporte tiene como máximo una fotografía. |
| `historial_estados` | Registra los cambios de estado de cada reporte y, cuando aplica, el administrador que los realizó. | PK `id_historial`; FK `id_reporte` → `reportes.id_reporte` con borrado en cascada; FK `id_administrador` → `perfiles.id_usuario` con `ON DELETE SET NULL`. |
| `mi_calle_limpieza_fotografias` | Mantiene reservas y resultados del borrado/reconciliación de objetos de Storage huérfanos o descartados. | PK `storage_path`; `id_reporte` identifica el reporte relacionado. La migración no define FK para este campo. |

El ciclo de vida de un reporte tiene cinco estados: `pendiente`, `en_revision`, `en_proceso`, `reparado` y `descartado`. Los reportes descartados se excluyen de la vista pública y la migración de limpieza contempla su purga después de 24 horas.

🧩 7. Documentación del Sistema

### Estructura de Carpetas

Árbol resumido de las carpetas y archivos principales del repositorio (se omiten dependencias instaladas y archivos generados):

```text
/
├── README.md
├── frontend-services.js
├── assets/
│   └── .gitkeep
├── css/
│   ├── design-system.css
│   └── styles.css
├── frontend-tests/
│   ├── frontend-services.test.js
│   └── password-services.test.js
├── login-registro/
│   ├── html/                 # Páginas de bienvenida, registro, login y recuperación
│   │   ├── assets/
│   │   └── css/
│   └── js/                   # Servicios y lógica de autenticación
├── portal_usuario/
│   ├── html/                 # Mapa, reportes, detalle, notificaciones y perfil
│   ├── usuario.css/          # Estilos del portal ciudadano
│   └── *.js                  # Mapa, formularios, reportes y perfil
├── Portal_admin/
│   ├── CSS/                  # Dashboard, sistema de diseño y perfil
│   └── HTML/                 # Vistas y scripts de administración
│       └── ASSETS/
├── backend/
│   ├── config/               # Clientes de Supabase
│   ├── controllers/          # Autenticación y usuario
│   ├── database/             # Conexión y script SQL
│   ├── models/               # Modelo de usuario
│   ├── routes/               # Rutas de usuario
│   ├── scripts/              # Reconciliación de limpieza fotográfica
│   ├── services/             # Correo, validación de imágenes, sesiones y limpieza
│   ├── test/
│   ├── package.json
│   └── server.js
└── supabase/
    ├── audits/               # Auditorías de políticas y esquema
    ├── migrations/           # Migraciones SQL versionadas
    └── tests/                # Compatibilidad y plan de pruebas
```

`frontend-services.js` es el cliente compartido para la API. El portal de administración está en `Portal_admin/`; el portal ciudadano, incluyendo las vistas de mapa y detalle de reporte, está en `portal_usuario/`.

### API REST

Los endpoints principales definidos en `backend/server.js` son:

| Método y ruta | Uso / acceso |
|---|---|
| `POST /api/auth/register` | Registro de ciudadano. |
| `POST /api/auth/login` | Inicio de sesión. |
| `POST /api/auth/refresh` | Renovación de sesión. |
| `POST /api/auth/password-recovery` | Solicitud de correo de recuperación. |
| `POST /api/auth/password-recovery/complete` | Completar recuperación con los tokens recibidos. |
| `POST /api/auth/password` | Cambio de contraseña; requiere JWT. |
| `GET /verify` | Verificación de correo mediante token. |
| `PUT /api/users/me` | Actualización del perfil del usuario autenticado. |
| `GET /reportes` | Reportes públicos; `?mine=true` requiere JWT y devuelve los propios. |
| `POST /reportes` | Crear reporte con JWT y fotografía multipart. |
| `GET /reportes/:id` | Consultar el detalle público o autorizado de un reporte. |
| `GET /reportes/:id/historial` | Consultar el historial público de estados. |
| `GET /api/reportes/:id/historial` | Historial privado; requiere JWT y autorización sobre el reporte. |
| `PUT /api/admin/reportes/:id/estado` | Cambiar estado; requiere rol administrador. Al descartar exige observación. |
| `GET /api/admin/reportes/:id/reportante` | Consultar identidad del reportante; requiere rol administrador. |

🚀 8. Instalación y Ejecución

## 🚀 8. Instalación y Ejecución

### Ejecución directa en línea 

La aplicación se encuentra desplegada y operativa en la nube, por lo que puede probarse directamente desde cualquier navegador móvil o de escritorio sin instalar dependencias locales:

- **Aplicación Web (Frontend - GitHub Pages):** [Enlace a Mi Calle App](https://tecnologias-2026-2.github.io/mi-calle-app/login-registro/html/landing.html#sobre-nosotros)

#### Guía rápida para probar el sistema:
1. **Modo Ciudadano:** Crea una cuenta nueva en la sección de registro (o inicia sesión) para publicar un reporte con fotografía y ubicación en el mapa, hacer seguimiento en *"Mis reportes"* o gestionar tu perfil y contraseña.
2. **Modo Administrador:** Inicia sesión con una cuenta con rol `administrador` para validar reportes, actualizar su ciclo de vida (`Pendiente`, `En revisión`, `En proceso`, `Reparado` o `Descartado`) y registrar observaciones visibles para el ciudadano.
