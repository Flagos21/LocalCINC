<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import SunCalc from 'suncalc'

const props = defineProps({
  height: { type: String, default: '420px' },
  aspectRatio: { type: [String, Number], default: null },
  autoRefreshMs: { type: Number, default: 60_000 }, // 1 min
  startPaused: { type: Boolean, default: false },
  // 'satellite' | 'map'  (empezamos con el que quieras)
  mode: { type: String, default: 'satellite' },
  showAnimationControl: { type: Boolean, default: true },
  focusBounds: {
    type: Array,
    default: () => [
      [-60, -110], // sudoeste
      [18, -25], // noreste
    ],
  },
  focusMaxZoom: { type: Number, default: 5 },

  // Sombras
  nightOpacity: { type: Number, default: 0.38 },
  twilightCivilOpacity: { type: Number, default: 0.26 },
  twilightNauticalOpacity: { type: Number, default: 0.18 },
  twilightAstroOpacity: { type: Number, default: 0.12 },
  nightColor: { type: String, default: '#050a18' },
  twilightColor: { type: String, default: '#0b1736' },

  showTwilight: { type: Boolean, default: true },
  showSunMoon: { type: Boolean, default: true },
})

/* ---------- estado ---------- */
const mapEl = ref(null)
const displayTime = ref(new Date())
const isAnimating = ref(false)
let map, baseLayer, labelsLayer
let nightPoly=null, civilPoly=null, nautPoly=null, astroPoly=null
let sunMarker=null, moonMarker=null
let timer=null
const mode = ref(props.mode)
let animFrameId=null
let animButtonEl=null
let modeSwitchEl=null
let modeSwitchButtons=[]

const mapStyles = computed(() => {
  const styles = {}
  if (props.aspectRatio) {
    styles.aspectRatio = typeof props.aspectRatio === 'number'
      ? `${props.aspectRatio}`
      : props.aspectRatio
  } else if (props.height) {
    styles.height = props.height
  }
  return styles
})

/* === Bounds Sudamérica + helper para encajar una sola vez === */
let didInitialFit = false
function getFocusBounds() {
  try {
    const bounds = L.latLngBounds(props.focusBounds)
    return bounds.isValid() ? bounds : null
  } catch (err) {
    return null
  }
}
function fitLatamOnce() {
  if (didInitialFit || !map) return
  const bounds = getFocusBounds()
  if (!bounds) return
  didInitialFit = true
  map.fitBounds(bounds, { padding:[20,20], maxZoom: props.focusMaxZoom ?? 5 })
}

/* ---------- helpers astronómicos (igual que antes) ---------- */
const d2r = d => d*Math.PI/180, r2d = r => r*180/Math.PI
const wrap180 = x => ((x+180)%360+360)%360-180
const clampLat = v => Math.max(-90, Math.min(90, v))

function solarPosition(date){
  const t = date.getTime()/86400000 + 2440587.5
  const T = (t - 2451545.0)/36525.0
  const M = 357.52911 + T*(35999.05029 - 0.0001537*T)
  const L0 = 280.46646 + T*(36000.76983 + 0.0003032*T)
  const C = (1.914602 - T*(0.004817 + 0.000014*T))*Math.sin(d2r(M))
          + (0.019993 - 0.000101*T)*Math.sin(d2r(2*M))
          + 0.000289*Math.sin(d2r(3*M))
  const lambda = L0 + C
  const eps = 23.439291 - 0.0130042*T
  const delta = Math.asin(Math.sin(d2r(eps))*Math.sin(d2r(lambda)))
  const minutes = date.getUTCHours()*60 + date.getUTCMinutes() + date.getUTCSeconds()/60
  const lambda_s = wrap180(180 - (minutes/60)*15)
  return { delta, lambda_s }
}
function curveAtElevation(date, hDeg, step=1){
  const { delta, lambda_s } = solarPosition(date)
  const sinH = Math.sin(d2r(hDeg))
  const curve=[]
  for(let lon=-180; lon<=180; lon+=step){
    const dlon = d2r(wrap180(lon - lambda_s))
    let lo=-90, hi=90, mid=0
    for(let i=0;i<24;i++){
      mid=(lo+hi)/2
      const f = Math.sin(d2r(mid))*Math.sin(delta) + Math.cos(d2r(mid))*Math.cos(delta)*Math.cos(dlon) - sinH
      const flo= Math.sin(d2r(lo ))*Math.sin(delta) + Math.cos(d2r(lo ))*Math.cos(delta)*Math.cos(dlon) - sinH
      if (Math.sign(f)===Math.sign(flo)) lo=mid; else hi=mid
    }
    curve.push([clampLat(mid), lon])
  }
  return { curve, lambda_s }
}
function worldWithHoleFromCurve(curve, dayIsNorth){
  const world = [[90,-180],[90,180],[-90,180],[-90,-180]]
  const dayRing=[]
  if(dayIsNorth) dayRing.push([90,180],[90,-180],...curve,[90,180])
  else dayRing.push([-90,-180],[-90,180],...curve.slice().reverse(),[-90,-180])
  return [world, dayRing]
}
function sideIsNorth(curve, lambda_s){
  const idx = Math.max(0, Math.min(curve.length-1, Math.round((wrap180(lambda_s)+180))))
  return 0 > curve[idx][0]
}

/* ---------- capas base + labels ---------- */
function makeBaseAndLabels(currentMode){
  // limpiamos anteriores
  if (baseLayer) { map.removeLayer(baseLayer); baseLayer=null }
  if (labelsLayer){ map.removeLayer(labelsLayer); labelsLayer=null }

  // panes: tiles (200), overlays (400). Creamos un pane alto para labels.
  if (!map.getPane('labels')) {
    const p = map.createPane('labels'); p.style.zIndex = 650; p.style.pointerEvents = 'none'
  }

  if (currentMode === 'satellite'){
    // Satélite (Esri) + rótulos transparentes
    baseLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { minZoom:1, maxZoom:7, attribution:'Esri, Maxar, Earthstar Geographics', noWrap:true }
    ).addTo(map)

    labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { pane:'labels', minZoom:1, maxZoom:7, opacity:0.9, noWrap:true }
    ).addTo(map)

    // encajar cuando carguen los tiles
    if (baseLayer) {
      baseLayer.once('load', () => fitLatamOnce())
    } else {
      fitLatamOnce()
    }
  } else {
    // Mapa claro con etiquetas (Carto Positron)
    baseLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png',
      { minZoom:1, maxZoom:7, subdomains:'abcd', attribution:'© OSM, © CARTO', noWrap:true }
    ).addTo(map)
    // Extra opcional de labels (normalmente no hace falta porque Positron ya trae):
    labelsLayer = null

    // encajar cuando carguen los tiles
    if (baseLayer) {
      baseLayer.once('load', () => fitLatamOnce())
    } else {
      fitLatamOnce()
    }
  }
}

/* ---------- dibujar terminador ---------- */
function redrawAll(date = new Date()){
  const now = date instanceof Date ? date : new Date(date)
  displayTime.value = now

  const { curve: zero, lambda_s } = curveAtElevation(now, 0, 1)
  const dayNorth = sideIsNorth(zero, lambda_s)
  const nightRings = worldWithHoleFromCurve(zero, dayNorth)

  if (!nightPoly) nightPoly = L.polygon(nightRings, { stroke:false, fillColor:props.nightColor, fillOpacity:props.nightOpacity, interactive:false }).addTo(map)
  else nightPoly.setLatLngs(nightRings).setStyle({ fillColor:props.nightColor, fillOpacity:props.nightOpacity })

  if (props.showTwilight){
    const astro = curveAtElevation(now, -18, 1).curve
    const naut  = curveAtElevation(now, -12, 1).curve
    const civil = curveAtElevation(now, -6, 1).curve
    const rA = worldWithHoleFromCurve(astro, dayNorth)
    const rN = worldWithHoleFromCurve(naut,  dayNorth)
    const rC = worldWithHoleFromCurve(civil, dayNorth)

    if (!astroPoly) astroPoly = L.polygon(rA, { stroke:false }).addTo(map)
    if (!nautPoly ) nautPoly  = L.polygon(rN, { stroke:false }).addTo(map)
    if (!civilPoly) civilPoly = L.polygon(rC, { stroke:false }).addTo(map)

    astroPoly.setLatLngs(rA).setStyle({ fillColor:props.twilightColor, fillOpacity:props.twilightAstroOpacity })
    nautPoly .setLatLngs(rN).setStyle({ fillColor:props.twilightColor, fillOpacity:props.twilightNauticalOpacity })
    civilPoly.setLatLngs(rC).setStyle({ fillColor:props.twilightColor, fillOpacity:props.twilightCivilOpacity })
  }

  if (props.showSunMoon){
    const { delta } = solarPosition(now)
    const subsolar = [ r2d(delta), lambda_s ]
    if (!sunMarker) sunMarker = L.marker(subsolar, { icon: sunIcon() }).addTo(map)
    else sunMarker.setLatLng(subsolar)

    const gp = SunCalc.getMoonPosition(now, 0, 0)
    if (gp && typeof gp.decl==='number' && typeof gp.ra==='number'){
      const sublunar = [ r2d(gp.decl), wrap180(-r2d(gp.ra)*15) || 0 ]
      if (!moonMarker) moonMarker = L.marker(sublunar, { icon: moonIcon() }).addTo(map)
      else moonMarker.setLatLng(sublunar)
    }
  }
}

/* ---------- controles ---------- */
function setMode(next){
  if (!next || next === mode.value) return
  mode.value = next
  updateModeButtons()
}

function updateModeButtons(){
  if (!modeSwitchButtons.length) return
  modeSwitchButtons.forEach(btn => {
    const isActive = btn.dataset?.k === mode.value
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-pressed', String(!!isActive))
  })
}

function addModeSwitch(){
  const C = L.Control.extend({
    options: { position:'topright' },
    onAdd(){
      const el = L.DomUtil.create('div','mode-switch')
      L.DomEvent.disableClickPropagation(el)

      modeSwitchButtons = [
        { key:'map', label:'Mapa' },
        { key:'satellite', label:'Satélite' },
      ].map(({ key, label }) => {
        const btn = L.DomUtil.create('button','btn', el)
        btn.type = 'button'
        btn.dataset.k = key
        btn.textContent = label
        btn.addEventListener('click', () => setMode(key))
        btn.addEventListener('keydown', (event) => {
          if (event.key === ' ' || event.key === 'Space' || event.key === 'Enter') {
            event.preventDefault()
            setMode(key)
          }
        })
        return btn
      })

      modeSwitchEl = el
      updateModeButtons()
      return el
    }
  })
  map.addControl(new C())
}

function addExtrasControls(){
  const C = L.Control.extend({
    options:{ position:'topleft' },
    onAdd(){
      const el = L.DomUtil.create('div','map-tools')
      const buttons = [`
        <button class="btn reset" type="button" title="Restablecer vista" aria-label="Restablecer vista">
          ⟲
        </button>
      `]
      if (props.showAnimationControl) {
        buttons.push(`
          <button class="btn anim" type="button" title="Animar sombra diaria" aria-label="Animar sombra diaria">
            Animar día
          </button>
        `)
      }
      el.innerHTML = buttons.join('')

      const [resetBtn, animBtn] = el.querySelectorAll('button')
      animButtonEl = props.showAnimationControl ? animBtn : null

      L.DomEvent.disableClickPropagation(el)
      L.DomEvent.disableScrollPropagation(el)

      resetBtn.addEventListener('click', () => {
        // volver al enfoque principal (por defecto Sudamérica)
        const bounds = getFocusBounds()
        if (bounds?.isValid()) {
          map.fitBounds(bounds, { padding:[20,20], maxZoom: props.focusMaxZoom ?? 5 })
        }
      })

      if (props.showAnimationControl && animBtn) {
        animBtn.addEventListener('click', () => {
          if (isAnimating.value) stopAnimation()
          else startAnimation()
        })
      }

      updateAnimButton()

      return el
    }
  })

  map.addControl(new C())
}

function updateAnimButton(){
  if (!props.showAnimationControl || !animButtonEl) return
  animButtonEl.textContent = isAnimating.value ? 'Detener animación' : 'Animar día'
  animButtonEl.classList.toggle('active', isAnimating.value)
  animButtonEl.setAttribute('aria-pressed', String(isAnimating.value))
}

function startAnimation(){
  if (!props.showAnimationControl) return
  if (isAnimating.value) return
  stopTimer()
  isAnimating.value = true
  updateAnimButton()

  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd = now
  const durationMs = 20000
  const startTs = performance.now()

  function step(ts){
    if (!isAnimating.value) return
    const t = Math.min((ts - startTs)/durationMs, 1)
    const simDate = new Date(dayStart.getTime() + (dayEnd.getTime() - dayStart.getTime())*t)
    redrawAll(simDate)
    if (t < 1){
      animFrameId = requestAnimationFrame(step)
    } else {
      stopAnimation()
    }
  }

  redrawAll(dayStart)
  animFrameId = requestAnimationFrame(step)
}

function stopAnimation(){
  if (!props.showAnimationControl) return
  if (!isAnimating.value) return
  isAnimating.value = false
  if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId=null }
  updateAnimButton()
  redrawAll(new Date())
  startTimer()
}

const timeLabel = computed(() => isAnimating.value ? 'Simulación' : 'UTC')
const timeHint = computed(() => isAnimating.value ? '(modo animación)' : '(actualizado cada 1 min)')

/* ---------- icons ---------- */
function sunIcon(){ return L.divIcon({ className:'sun-ico', html:`<svg viewBox="0 0 64 64" width="38" height="38">
  <circle cx="32" cy="32" r="14" fill="#FDB813" stroke="#F59E0B" stroke-width="3"/>
  <g stroke="#F59E0B" stroke-width="3" stroke-linecap="round">
    <line x1="32" y1="4" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="60"/>
    <line x1="4" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="60" y2="32"/>
    <line x1="12" y1="12" x2="18" y2="18"/><line x1="46" y1="46" x2="52" y2="52"/>
    <line x1="12" y1="52" x2="18" y2="46"/><line x1="46" y1="18" x2="52" y2="12"/>
  </g></svg>`, iconSize:[38,38], iconAnchor:[19,19] }) }
function moonIcon(){ return L.divIcon({ className:'moon-ico', html:`<svg viewBox="0 0 64 64" width="34" height="34">
  <defs><radialGradient id="g" cx="30%" cy="30%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#d1d5db"/></radialGradient></defs>
  <circle cx="32" cy="32" r="16" fill="url(#g)" stroke="#cbd5e1" stroke-width="2"/></svg>`,
  iconSize:[34,34], iconAnchor:[17,17] }) }

/* ---------- ciclo de vida ---------- */
function startTimer(){
  if (isAnimating.value) return
  if (!timer) timer=setInterval(() => redrawAll(), props.autoRefreshMs)
}
function stopTimer(){ if (timer){ clearInterval(timer); timer=null } }

onMounted(() => {
  map = L.map(mapEl.value, {
    zoomControl:true,
    attributionControl:false,
    worldCopyJump:false,
    maxBounds:[[-85,-180],[85,180]],
    maxBoundsViscosity:1.0,
  })

  // ✅ vista inicial provisional enfocada en el área principal (Sudamérica por defecto)
  const focusBounds = getFocusBounds()
  if (focusBounds) {
    const center = focusBounds.getCenter()
    map.setView(center, Math.min(props.focusMaxZoom ?? 5, 4))
  } else {
    map.setView([-15, -60], 3)
  }

  makeBaseAndLabels(mode.value)
  fitLatamOnce()

  // arreglos de tamaño
  requestAnimationFrame(()=> map.invalidateSize())
  setTimeout(()=> map.invalidateSize(), 400)
  const ro = new ResizeObserver(()=> map.invalidateSize())
  ro.observe(mapEl.value); map.__ro = ro

  // Encajar a Sudamérica cuando el mapa esté listo y tras el primer render
  map.whenReady(() => {
    fitLatamOnce()
    setTimeout(fitLatamOnce, 0)
  })

  addModeSwitch()
  addExtrasControls()
  redrawAll(); startTimer()
})
onBeforeUnmount(() => {
  stopAnimation()
  stopTimer(); if (map?.__ro) map.__ro.disconnect(); map?.remove()
  modeSwitchEl=null
  modeSwitchButtons=[]
})
watch(() => props.autoRefreshMs, () => { stopTimer(); startTimer() })
watch(isAnimating, updateAnimButton)
watch(mode, (next) => {
  if (map) {
    makeBaseAndLabels(next)
    redrawAll()
  }
  updateModeButtons()
})
watch(() => props.mode, (next) => {
  if (next && next !== mode.value) {
    setMode(next)
  }
})
</script>

<template>
  <div class="tad-card">
    <div ref="mapEl" class="tad-map" :style="mapStyles"></div>
    <div class="tad-footer">
      <span class="tad-time">
        <strong>{{ timeLabel }}</strong> — {{ displayTime.toLocaleString('es-CL',{ timeZone:'UTC', hour12:false }) }}
        <em>{{ timeHint }}</em>
      </span>
    </div>
  </div>
</template>

<style scoped>
.tad-card{
  background:#0a0e14;
  border-radius:12px;
  overflow:hidden;
  box-shadow:0 12px 28px rgba(0,0,0,.35);
  border:1px solid rgba(255,255,255,.06);
  display:flex;
  flex-direction:column;
  height:100%;
  min-height:0;
  width:100%;
}
.tad-map{ width:100%; flex:1 1 auto; min-height:0; }
.tad-footer{
  background:#3b3b3b; color:#e5e7eb; padding:.55rem .8rem;
  font-size:.95rem; display:flex; justify-content:flex-start;
}
.tad-time strong{ color:#f1f5f9; margin-right:.4rem; }
.tad-time em{ opacity:.8; margin-left:.5rem; font-style:italic; }

/* switch */
:deep(.mode-switch){
  display:flex; gap:6px; background:rgba(15,23,42,.75); padding:6px; border-radius:8px; backdrop-filter: blur(4px);
  box-shadow:0 4px 16px rgba(0,0,0,.25);
}
:deep(.mode-switch .btn){
  border:none; cursor:pointer; padding:.35rem .6rem; border-radius:6px;
  color:#e5e7eb; background:#1f2937; font-weight:600;
}
:deep(.mode-switch .btn.active){ background:#2563eb; color:#fff; }

/* por si el base trae labels fuertes, mantener nuestras capas visibles */
:deep(.leaflet-control-attribution){ display:none; }
:deep(.leaflet-pane .sun-ico), :deep(.leaflet-pane .moon-ico){ filter:drop-shadow(0 1px 2px rgba(0,0,0,.5)); }

:deep(.map-tools){
  display:flex;
  gap:6px;
  background:rgba(15,23,42,.82);
  padding:6px;
  border-radius:8px;
  backdrop-filter:blur(4px);
  box-shadow:0 4px 16px rgba(0,0,0,.35);
}
:deep(.map-tools .btn){
  border:none;
  cursor:pointer;
  padding:.35rem .6rem;
  border-radius:6px;
  color:#e5e7eb;
  background:#1f2937;
  font-weight:600;
  display:flex;
  align-items:center;
  gap:.35rem;
}
:deep(.map-tools .btn.reset){ font-size:1.1rem; line-height:1; }
:deep(.map-tools .btn.active){ background:#2563eb; color:#fff; }
</style>
