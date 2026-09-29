# RutaSmart

MVP para reunir solicitudes de reciclaje y planear rutas de recolección en una zona. La aplicación usa Next.js App Router, TypeScript, Tailwind CSS y Supabase.

## Requisitos

- Node.js 20.9 o posterior y npm.
- Un proyecto gratuito de Supabase para habilitar las funciones conectadas a la base de datos.

## Ejecutar en local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abre <http://localhost:3000>. Cuando conectes Supabase, completa `.env.local` con la URL del proyecto y su llave publicable, disponible en **Project Settings > API Keys**. No pongas una llave `service_role` en variables `NEXT_PUBLIC_*` ni en el navegador.

Comprobaciones disponibles:

```powershell
npm run lint
npm run build
npm run test:distances
npm run test:routing
```

Para precargar o completar la matriz de la zona en Supabase, define también `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y ejecuta `npm run distances:preload`. Esta llave es solo de servidor y no debe compartirse ni usar el prefijo `NEXT_PUBLIC_`.

Para comparar RutaSmart con las líneas base usando los datos guardados, ejecuta `npm run routing:compare`. El script imprime resultados calculados al momento; no usa cifras de ejemplo.

## Dependencias

- Producción: `next`, `react`, `react-dom`, `@supabase/supabase-js`.
- Desarrollo: TypeScript, Tailwind CSS 4, ESLint y tipos de Node/React.
- Leaflet, `leaflet.heat`, Recharts y las pruebas del algoritmo se incorporarán en los pasos que los implementan.

## Estructura

```text
app/                 Rutas y estilos de Next.js
components/          Componentes compartidos
lib/distances/       Cálculo y consulta de distancias
lib/routing/         Motor de ruteo
lib/supabase/        Clientes de Supabase
supabase/            SQL, políticas y datos de prueba
```

## Despliegue inicial en Vercel

1. Sube el repositorio a GitHub y crea un proyecto en Vercel importándolo.
2. Conserva el directorio raíz del proyecto y la configuración detectada de Next.js.
3. En **Settings > Environment Variables**, agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para Development, Preview y Production.
4. Copia los valores desde **Project Settings > API Keys** de Supabase y vuelve a desplegar.
5. Verifica la compilación y abre el dominio asignado. El esquema y los datos de demostración se configuran en el Paso 1.

El MVP usa servicios gratuitos. Para ejecutar una demo sin depender de servicios externos se prepararán datos de prueba en los pasos siguientes.
