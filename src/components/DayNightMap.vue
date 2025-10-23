<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  height: { type: String, default: '420px' },
  autoRefreshMs: { type: Number, default: 60000 },
  startPaused: { type: Boolean, default: false },
  // 'osm' | 'carto-dark' | 'carto-light'
  basemap: { type: String, default: 'osm' },
  // Personaliza la sombra
  nightOpacity: { type: Number, default: 0.45 },
  nightColor: { type: String, default: '#000' },
  // si vieras invertido (raro), pon true
  invert: { type: Boolean, default: false },
})

const mapEl = ref(null)
let map, baseLayer
let nightPoly = null
let timer = null
const paused = ref(props.startPaused)

/* ---------- utilidades solares (aprox) ---------- */
const d2r = d => d * Math.PI / 180
const r2d = r => r * 180 / Math.PI
const wrap180 = x => ((x + 180) % 360 + 360) % 360 - 180
const clampLat = lat => Math.max(-90, Math.min(90, lat))

function solarPosition(date){
  const t = date.getTime() / 86400000 + 2440587.5
  const T = (t - 2451545.0) / 36525.0
  const M = 357.52911 + T*(35999.05029 - 0.0001537*T)
  const L0 = 280.46646 + T*(36000.76983 + 0.0003032*T)
  const C = (1.914602 - T*(0.004817 + 0.000014*T)) * Math.sin(d2r(M))
          + (0.019993 - 0.000101*T) * Math.sin(d2r(2*M))
          + 0.000289 * Math.sin(d2r(3*M))
  const lambda = L0 + C
  const eps = 23.439291 - 0.0130042*T
  const delta = Math.asin(Math.sin(d2r(eps)) * Math.sin(d2r(lambda)))

  const minutes = date.getUTCHours()*60 + date.getUTCMinutes() + date.getUTCSeconds()/60
  const trueSolarMin = minutes // EOT ignorada aquí; basta para el terminador
  let lambda_s = wrap180(180 - (trueSolarMin/60)*15)
  return { delta, lambda_s }
}

function terminatorLatAtLon(date, lonDeg){
  const { delta, lambda_s } = solarPosition(date)
  const dl = d2r(wrap180(lonDeg - lambda_s))
  const sdelta = Math.sin(delta), cdelta = Math.cos(delta)
  if (Math.abs(sdelta) < 1e-6) return 0
  const tanphi = - (cdelta * Math.cos(dl)) / sdelta
  return clampLat(r2d(Math.atan(tanphi)))
}

function buildNightPolygon(date, stepDeg=1){
  const curve = []
  for (let lon=-180; lon<=180; lon+=stepDeg){
    curve.push([ terminatorLatAtLon(date, lon), lon ])
  }
  const { lambda_s } = solarPosition(date)
  const testLon = wrap180(lambda_s)
  const idx = Math.round((testLon + 180)/stepDeg)
  const curveLatAtTest = curve[Math.max(0, Math.min(curve.length-1, idx))][0]
  const dayIsNorthSide = 0 > curveLatAtTest

  const dayRing = []
  if (dayIsNorthSide){
    dayRing.push([90, 180], [90, -180])
    for (let i=0; i<curve.length; i++) dayRing.push([curve[i][0], curve[i][1]])
    dayRing.push([90, 180])
  } else {
    dayRing.push([-90, -180], [-90, 180])
    for (let i=curve.length-1; i>=0; i--) dayRing.push([curve[i][0], curve[i][1]])
    dayRing.push([-90, -180])
  }
  const world = [[90,-180],[90,180],[-90,180],[-90,-180]]
  return [world, dayRing]
}
/* ------------------------------------------------ */

function buildBasemap() {
  if (props.basemap === 'carto-dark') {
    return L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
      { minZoom: 1, maxZoom: 6, subdomains: 'abcd', attribution: '&copy; OSM, © CARTO' }
    )
  }
  if (props.basemap === 'carto-light') {
    return L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png',
      { minZoom: 1, maxZoom: 6, subdomains: 'abcd', attribution: '&copy; OSM, © CARTO' }
    )
  }
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 1, maxZoom: 6, subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors'
  })
}

function drawOrUpdateNight() {
  const rings = buildNightPolygon(new Date(), 1)
  const geom = props.invert ? [rings[0]] : rings
  if (!nightPoly) {
    nightPoly = L.polygon(geom, {
      stroke: false,
      fillColor: props.nightColor,
      fillOpacity: props.nightOpacity,
      interactive: false,
      pane: 'overlayPane'
    }).addTo(map)
  } else {
    nightPoly.setLatLngs(geom)
    nightPoly.setStyle({ fillColor: props.nightColor, fillOpacity: props.nightOpacity })
  }
}

function startTimer(){ if (!timer && !paused.value) timer = setInterval(drawOrUpdateNight, props.autoRefreshMs) }
function stopTimer(){ if (timer){ clearInterval(timer); timer=null } }
function togglePause(){ paused.value = !paused.value; paused.value ? stopTimer() : startTimer() }

onMounted(() => {
  map = L.map(mapEl.value, { worldCopyJump: true, zoomControl: true, attributionControl: true })
        .setView([0,0], 2)
  baseLayer = buildBasemap().addTo(map)
  drawOrUpdateNight()
  startTimer()
})
onBeforeUnmount(() => { stopTimer(); if (map) map.remove() })
watch(() => props.autoRefreshMs, () => { stopTimer(); startTimer() })
</script>

<template>
  <div class="dn-wrap">
    <div class="dn-header">
      <strong>Mapa Día/Noche</strong>
      <button class="btn" type="button" @click="togglePause">
        {{ paused ? 'Auto-refresh: OFF' : 'Auto-refresh: ON' }}
      </button>
    </div>
    <div ref="mapEl" class="dn-map" :style="{ height }"></div>
  </div>
</template>

<style scoped>
.dn-wrap { border: 1px solid #2a2a2a33; border-radius: 8px; background:#0f0f10; padding:8px; color:#e5e7eb; }
.dn-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:14px; }
.btn { font-size:12px; padding:4px 8px; border-radius:6px; border:1px solid #444; background:transparent; cursor:pointer; color:#e5e7eb; }
.dn-map { width:100%; background:#0b1220; }
</style>
