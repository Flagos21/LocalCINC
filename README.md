# LocalCINC

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

La API Express vive en `api/` y requiere su propia instalación:

```sh
cd api
npm install
```

### Variables de entorno

Se incluye `api/.env.example` con la configuración necesaria para InfluxDB y el servicio del índice Kp.

| Variable | Descripción |
| --- | --- |
| `KP_ENABLED` | Activa/desactiva la ingesta del índice Kp. |
| `KP_LOOKBACK_DAYS` | Días de historia solicitados al servicio de GFZ. |
| `KP_CRON` | Expresión cron usada para refrescar la caché (por defecto cada 15 minutos). |
| `KP_STATUS` | Valores `now` (nowcast) o `def` (definitivos). |

### Backend API – Índice Kp (GFZ)

El backend expone `GET /api/kp`, que retorna la última serie almacenada en caché:

```json
{
  "updatedAt": "2025-11-06T12:00:00Z",
  "series": [
    { "time": "2025-11-06T00:00:00Z", "value": 3.3, "status": "now" }
  ]
}
```

La caché se refresca automáticamente según `KP_CRON`. Si el servicio se encuentra deshabilitado (`KP_ENABLED=false`) el endpoint responde `503`.

### Frontend

- `npm run dev`: arranca Vite con proxy hacia `http://localhost:3001`.
- `npm run build`: genera la aplicación estática lista para producción.
- `npm run preview`: sirve la build generada.
- El componente `<KpChart />` muestra el gráfico de barras del índice Kp con auto-refresh (10 minutos) y aparece en la vista principal (`HomeView`).

### Tests y utilidades

```sh
# Pruebas y utilidades de frontend
npm run test

# API Express
cd api
npm test

# Linter
npm run lint
```
