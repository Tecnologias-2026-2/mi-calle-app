🌐 Nombre del Proyecto
Mi Calle App

Aplicación web colaborativa orientada al reporte, seguimiento y gestión de daños en la infraestructura vial (huecos, grietas, alcantarillas sin tapa, etc.), funcionando como puente de comunicación entre la ciudadanía y las entidades responsables del mantenimiento vial.

👥 Integrantes
Karen Rodríguez – Código
Katerin Suarez – Código
Julián Mendoza – Código

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

3.2 Requerimientos No Funcionales

Escriban cómo debe comportarse el sistema.

Ejemplo:
RNF01: La página debe ser responsive.

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

Agregar imagen del modelo.
Tablas principales

🧩 7. Documentación del Sistema
Estructura de Carpetas
/css
/assets


🚀 8. Instalación y Ejecución

Explicar cómo correr el proyecto.
