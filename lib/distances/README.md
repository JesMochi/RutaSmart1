# Distancias

La matriz es dirigida: guarda distancia en metros, duración en segundos y fuente (`osrm` o `haversine`) para cada par distinto de origen/destino. Los pares guardados se reutilizan; solo se consultan los faltantes del depósito y las solicitudes activas de la zona.

OSRM Table se consulta en bloques de hasta 25 orígenes y 25 destinos, con timeout de 7 segundos y hasta dos reintentos. Cuando falla el servicio, una celda no tiene ruta o se agota el límite, el par se calcula con Haversine × factor de ajuste y velocidad de respaldo configurados en `parametros`.

Pruebas: `npm run test:distances`. Precarga completa en local: configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_RUTA_ZONA_ID` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, luego ejecuta `npm run distances:preload`. La llave de servicio solo se usa en el servidor.

El endpoint `GET /api/distances/matrix` expone conteos y porcentajes de cobertura; `POST /api/distances/matrix` completa pares faltantes. Ambos verifican el access token de Supabase y el rol administrador.