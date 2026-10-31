# Flambergers Hotel PMS

Aplicación de gestión hotelera con React, Vite, Express y SQLite (Node.js 22.13+).

## Inicio local

1. `npm install`
2. Terminal 1: `npm start` (API Express, puerto 3001).
3. Terminal 2: `npm run dev` (interfaz React, puerto 5173).
4. Abre `http://localhost:5173`.

En la primera ejecución se importa `data/seed.json` si la base está vacía y se crea `data/hotel.sqlite`. El importador no reemplaza una base SQLite existente. La contraseña inicial aleatoria para `admin` se imprime una sola vez en la consola del servidor. Para definirla de antemano, establece `INITIAL_ADMIN_PASSWORD` al arrancar. Cambia esa contraseña desde la administración antes de usar el sistema con datos reales.

La aplicación toma `DB_PATH`, `PORT`, `SESSION_SECRET` y `INITIAL_ADMIN_PASSWORD` del entorno. En producción, define un `SESSION_SECRET` fuerte, construye con `npm run build` y arranca con `NODE_ENV=production npm start`. El servidor Express sirve también `dist/` en producción. Guarda copias protegidas del archivo SQLite y evita exponerlo en el servidor web.

## API

- `POST /api/auth/login` — recibe `{ "usuario": "...", "password": "..." }` y devuelve un token firmado.
- `GET /api/bootstrap` — datos necesarios para iniciar las vistas, filtrados por rol.
- `GET /api/:coleccion`, `POST /api/:coleccion`, `PATCH /api/:coleccion/:id`, `DELETE /api/:coleccion/:id` — operaciones de recursos autenticadas.
- `POST /api/reservaciones/:id/checkin` y `POST /api/estancias/:id/checkout` — transiciones de recepción.
- `GET /api/health` — estado del servidor.

Los errores de API usan `{ "error": "..." }`; validaciones de negocio responden 4xx. Las reservas comprueban fechas, capacidad, estado y traslape en el servidor. Los pagos vinculados actualizan el saldo pendiente. Las habitaciones y reservas quedan registradas en SQLite junto con un historial de acciones.

## Situación funcional

La versión React ofrece dashboard, administración de habitaciones, huéspedes, reservas, recepción, pagos, inventario, limpieza, mantenimiento, personal y configuración. Los módulos reutilizan formularios y tablas accesibles con búsqueda. La capa de API cubre autenticación, permisos básicos por rol, persistencia, controles de disponibilidad, check-in/check-out y auditoría. Para operación financiera o multiusuario de producción, hay que ampliar la autorización a permisos por acción y validar los flujos de negocio específicos del hotel, impuestos, facturación fiscal y cierres de caja.
