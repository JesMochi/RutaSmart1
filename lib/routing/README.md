# Motor de ruteo

El módulo puro `cvrp.ts` reparte por barrido angular con capacidad, inicia cada ruta con vecino más cercano y aplica 2-opt solo si reduce el recorrido completo. También construye las líneas base por registro y por colonia usando las mismas asignaciones; las solicitudes que no caben se devuelven como `unassigned`.

Las métricas incluyen traslado de ida y vuelta más minutos fijos por parada, litros, costo de combustible, costo/kg, kg/km y kg/hora. Distancias y duración se reciben por una función, así que el algoritmo no depende de OSRM ni Supabase.

Pruebas: `npm run test:routing`. Comparación con datos persistidos de la zona: `npm run routing:compare`; requiere `.env.local` y acceso de servidor a Supabase.