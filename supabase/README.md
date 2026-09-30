# Supabase

## Preparación del proyecto

1. Crea un proyecto Supabase gratuito.
2. En **SQL Editor**, ejecuta `migrations/202609290001_initial_schema.sql` una sola vez.
3. Ejecuta `migrations/202609290002_constraints.sql` para aplicar los límites del MVP.
4. Ejecuta `seed.sql` para cargar Jardines de Morelos, Ecatepec de Morelos, un depósito ficticio, dos vehículos, parámetros y 25 solicitudes simuladas.
5. Copia el ID de zona de `.env.example` a `.env.local` como `NEXT_PUBLIC_RUTA_ZONA_ID`.
6. Configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores del proyecto.

El seed puede ejecutarse otra vez: reemplaza únicamente los registros marcados `es_demo`. El depósito y las direcciones de prueba son ficticios; no representan ubicaciones reales de recolección.

Si ya ejecutaste la migración 001, no la repitas. Ejecuta únicamente `migrations/202609290002_constraints.sql` y luego `seed.sql`.

## Crear cuentas internas

Con `SUPABASE_SERVICE_ROLE_KEY` configurada en el servidor (Vercel), un administrador crea y elimina cuentas desde `/panel` → **Usuarios**; el endpoint `/api/usuarios` verifica su rol antes de usar la llave de servicio.

El primer administrador se crea manualmente: crea la cuenta desde **Authentication > Users** y copia su UUID. En SQL Editor, registra el rol correspondiente:

```sql
INSERT INTO public.perfiles (user_id, nombre, rol)
VALUES ('UUID_DEL_USUARIO', 'Administración RutaSmart', 'administrador');
```

Usa `'recolector'` en la columna `rol` para una cuenta de recolector. Con la cuenta y su perfil creados, el usuario entra en `/login`:

- **Administrador** (`/panel`): ve todas las solicitudes de la zona, selecciona pendientes y crea una ruta para un recolector, vehículo y fecha. El orden de paradas se calcula con el motor CVRP usando la matriz guardada o, si falta un par, Haversine × factor. Cancelar una ruta devuelve sus solicitudes a pendientes.
- **Recolector** (`/panel`): ve solo sus rutas planeadas o en curso, con las paradas en orden, teléfono y enlace al mapa. Marca cada parada como recolectada (con kilos reales) o no recolectada; la ruta pasa a `en_curso` y, al cerrar la última parada, a `completada`. Las no recolectadas vuelven a la bandeja del administrador como `sin_asignar`.

- **Vecino** (`/panel`): ve sus propias solicitudes y su estado. Las solicitudes enviadas con sesión iniciada quedan ligadas a su cuenta (`solicitudes.usuario_id`).

Registro público en `/registro`: cualquiera crea una cuenta de **vecino** (activa de inmediato) o **recolector** (queda pendiente hasta que un administrador la aprueba en **Usuarios**). El rol administrador no se puede elegir al registrarse. Usa `supabase.auth.signUp`; el trigger de `migrations/202609290005_perfil_automatico.sql` crea el perfil y solo acepta vecino o recolector. Requiere las migraciones 004 y 005, y que **Authentication → Sign In / Providers → Allow new users to sign up** esté activado. Si **Confirm email** está activado, la cuenta debe confirmarse por correo antes de entrar.

El registro de paradas requiere ejecutar `migrations/202609290003_registro_recoleccion.sql` en el SQL Editor. La función `registrar_recoleccion` valida que quien llama sea el recolector de la ruta (o un administrador); el recolector sigue sin permisos de escritura directa sobre las tablas. El alta de estos perfiles debe hacerla un administrador del proyecto Supabase; la tabla no permite autoasignarse roles.

## Acceso por rol

| Rol | Puede hacer | No puede hacer |
| --- | --- | --- |
| Público (`anon`) | Insertar solicitudes pendientes con honeypot vacío; consultar la vista de impacto agregado | Leer solicitudes, teléfonos u otras tablas; modificar o eliminar solicitudes |
| Administrador (`authenticated`) | Leer, crear, actualizar y eliminar datos de la zona; administrar perfiles; ejecutar `restablecer_demostracion()` | Acceder a llaves secretas desde el navegador |
| Recolector (`authenticated`) | Consultar su perfil, sus rutas y paradas asignadas y los datos asociados a esas paradas | Consultar otras rutas o cambiar datos desde la API en este paso |

El teléfono está en `solicitudes`, cuya lectura no se concede a `anon`; la vista pública solo expone kilos recolectados y combustible ahorrado estimado. RLS está habilitado en todas las tablas. El endpoint de solicitud, sus validaciones completas y el límite de envíos se implementan en los pasos de aplicación posteriores.

## Tablas

- `zonas`, `depositos`, `parametros`: zona activa, punto de salida y configuración editable.
- `solicitudes`: ubicación, material, peso estimado, teléfono privado, estado y kilos reales por material.
- `vehiculos`, `rutas`, `paradas`: flota, resultados de ruteo y orden de visita.
- `matriz_distancias`: distancia, duración y fuente OSRM/Haversine.
- `perfiles`: relación de cada usuario de Auth con el rol `administrador` o `recolector`.
- `impacto_publico`: vista agregada sin información personal.

## Matriz de distancias (Paso 2)

Con `SUPABASE_SERVICE_ROLE_KEY` configurada solo en el servidor, ejecuta `npm run distances:preload` para precargar todos los pares dirigidos de la demo. El script conserva los pares ya guardados y calcula solo los faltantes. El endpoint `POST /api/distances/matrix` completa la matriz después de una nueva solicitud; `GET /api/distances/matrix` consulta la cobertura. Ambos requieren `Authorization: Bearer <access_token>` de un usuario con rol administrador.

El servicio intenta OSRM Table con timeout y reintentos; si OSRM falla, limita el bloque o no encuentra una ruta para una celda, usa Haversine por el factor y la velocidad configurados. La cobertura devuelve conteos y porcentajes por fuente. Se cuentan pares dirigidos distintos del nodo consigo mismo; la diagonal es cero y no se persiste.

## Motor CVRP (Paso 3)

El cálculo vive en `lib/routing/cvrp.ts` y no depende de la base. Para comparar con los datos persistidos, completa primero la matriz y ejecuta `npm run routing:compare`; el script imprime kilómetros, minutos, litros, combustible, costo/kg, kg/km, kg/hora y solicitudes sin asignar para RutaSmart y ambas líneas base.

Un administrador autenticado puede restablecer solo los datos de demo con:

```sql
SELECT public.restablecer_demostracion();
```

En la aplicación se invocará con `supabase.rpc('restablecer_demostracion')`; la función verifica el rol antes de modificar datos. El rol `anon` no puede ejecutar el restablecimiento ni la función interna de carga.
## Seguimiento en vivo (migración 006)

Ejecuta `migrations/202609300006_seguimiento_rutas.sql` (idempotente). Agrega:

- **Ubicación del recolector:** al pulsar "Iniciar ruta y compartir ubicación", el celular envía su posición cada 20 segundos mientras la página esté abierta (`registrar_ubicacion_recolector`); la ruta pasa a `en_curso`.
- **Tiempo estimado de llegada:** `tiempos_ruta` (recolector o administrador) y `seguimiento_mis_solicitudes` (vecino) calculan los minutos hasta cada parada pendiente desde la ubicación reciente del recolector (o la última parada cerrada / el depósito), con la matriz guardada o Haversine × factor, más los minutos fijos por parada.
- **Alerta de recolector cerca:** el vecino ve un aviso y, si activó las alertas, recibe una notificación del navegador cuando el recolector está a 1 km o menos o su parada es la siguiente. El vecino nunca recibe la ubicación exacta del recolector, solo la distancia.
- **Carga del vehículo:** el recolector indica qué tan lleno va (`registrar_carga_vehiculo`); el administrador lo ve en Rutas activas.
- **Kilos reales por material:** `registrar_recoleccion_materiales` guarda PET, cartón, aluminio y vidrio por separado en la misma parada.
