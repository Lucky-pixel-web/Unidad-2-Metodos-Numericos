import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceDot, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 9 · INTERPOLACIÓN DE NEWTON–GREGORY (DIFERENCIAS FINITAS PROGRESIVAS)
   Caso de nodos EQUIESPACIADOS

   Teoría (guía teórica, págs. 20–27 y pizarra de clase):
     • Nodos igualmente espaciados y ascendentes:  x_i = x_0 + i·h
     • Diferencia finita progresiva:  Δf_i = f_{i+1} − f_i
                                      Δ^{k+1} f_i = Δ^k f_{i+1} − Δ^k f_i
     • Polinomio de Newton:
         P_n(x) = a_0 + a_1(x−x_0) + a_2(x−x_0)(x−x_1) + … + a_n(x−x_0)…(x−x_{n−1})
     • Coeficientes (se deducen imponiendo P(x_i) = f_i):
         a_i = Δ^i f_0 / ( i! · h^i )        (a_0 = f_0, a_1 = (f_1−f_0)/h,
                                              a_2 = (f_2−2f_1+f_0)/(2h²), …)
     • Relación con las diferencias divididas: a_i = f[x_0,…,x_i]  (mismo polinomio).
   Importante: solo aplica si h es constante. Los datos de la actividad
   (x = 1, 2, 4, 7 → h = 1, 2, 3) NO son equiespaciados: allí se usa Newton con
   diferencias divididas. Esta práctica se prueba con los ejemplos de clase.
   ========================================================================= */

/* ============================== UTILIDADES =============================== */

const SUBS = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n) => String(n).split('').map((d) => SUBS[+d] ?? d).join('')
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n) => String(n).split('').map((d) => SUPS[+d] ?? d).join('')

function fmt(v, d = 4) {
  if (!Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(d))
  return Object.is(r, -0) ? '0' : r.toString()
}
const sciCorto = (v) => v.toExponential(3).replace(/\.?0+e/, 'e')
/* Decimal fijo, pero los valores diminutos (|v| < 1e-4) se muestran en
   notación científica (p. ej. -8e-7) para no redondearlos a 0. */
const fix = (v, d = 6) => {
  if (!Number.isFinite(v)) return '—'
  if (v !== 0 && Math.abs(v) < 1e-4) return sciCorto(v)
  return v.toFixed(d)
}
const sci = (v) => (Number.isFinite(v) ? v.toExponential(2) : '—')

/* MODO_FR: se activa solo cuando TODOS los datos (X, Y y x) son enteros; así
   los resultados se muestran como fracciones exactas ("5/6") igual que a mano.
   Con datos decimales se muestran decimales. */
let MODO_FR = true
function fr(v, d = 6) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)).replace('-0', '0')
  if (MODO_FR) {
    for (let den = 2; den <= 720; den++) {
      const num = Math.round(v * den)
      if (Math.abs(v - num / den) < 1e-9) return `${num}/${den}`
    }
  }
  if (Math.abs(v) < 1e-4) return sciCorto(v)
  return fmt(v, d)
}
const esFraccion = (v) => fr(v).includes('/')

/* ------------------------------------------------------------------------
   Álgebra polinómica mínima (coeficientes en orden ASCENDENTE [a0,a1,...])
   ------------------------------------------------------------------------ */
function polyMul(a, b) {
  const res = Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) res[i + j] += a[i] * b[j]
  }
  return res
}

/* ------------------------------------------------------------------------
   TABLA DE DIFERENCIAS DIVIDIDAS (matriz triangular)
   T[i][0] = f[xi]
   T[i][j] = ( T[i+1][j-1] − T[i][j-1] ) / ( X[i+j] − X[i] )
   Los coeficientes de Newton son la PRIMERA FILA: c_j = T[0][j].
   ------------------------------------------------------------------------ */
function diferencias_divididas(X, Y) {
  const n = X.length
  const T = Array.from({ length: n }, () => Array(n).fill(null))
  for (let i = 0; i < n; i++) T[i][0] = Y[i]
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n - j; i++) {
      T[i][j] = (T[i + 1][j - 1] - T[i][j - 1]) / (X[i + j] - X[i])
    }
  }
  return T
}

/* ------------------------------------------------------------------------
   EVALUACIÓN EFICIENTE (regla de Horner para la forma de Newton):
   P(x) = c0 + (x−x0)(c1 + (x−x1)(c2 + (x−x2)(c3 + ...)))
   Solo n multiplicaciones y n sumas, sin calcular potencias.
   ------------------------------------------------------------------------ */
function evaluar_newton(X, coef, x) {
  let r = coef[coef.length - 1]
  for (let i = coef.length - 2; i >= 0; i--) r = coef[i] + (x - X[i]) * r
  return r
}

/* Misma evaluación pero devolviendo cada paso (para mostrarlo en pantalla) */
function evaluarNewtonPasos(X, coef, x) {
  const pasos = []
  let r = coef[coef.length - 1]
  pasos.push({ i: coef.length - 1, b: r, texto: `b${sub(coef.length - 1)} = c${sub(coef.length - 1)} = ${fr(r)}` })
  for (let i = coef.length - 2; i >= 0; i--) {
    const previo = r
    r = coef[i] + (x - X[i]) * previo
    pasos.push({
      i, b: r,
      texto: `b${sub(i)} = c${sub(i)} + (x − x${sub(i)})·b${sub(i + 1)} = ${fr(coef[i])} + (${fmt(x)} − ${fmt(X[i])})·${fr(previo)} = ${fr(r)}`,
    })
  }
  return pasos
}

/* Forma estándar: expande c0 + c1(x−x0) + c2(x−x0)(x−x1) + ... */
function newtonAEstandar(X, coef) {
  const n = coef.length
  const res = Array(n).fill(0)
  let base = [1]
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < base.length; i++) res[i] += coef[k] * base[i]
    base = polyMul(base, [-X[k], 1])
  }
  return res
}

/* Verificación cruzada: el polinomio interpolante es ÚNICO, así que
   Lagrange (bucles anidados) debe dar el mismo valor que Newton. */
function lagrange_eval(X, Y, x) {
  const n = X.length
  let total = 0
  for (let k = 0; k < n; k++) {
    let num = 1
    let den = 1
    for (let i = 0; i < n; i++) {
      if (i === k) continue
      num *= x - X[i]
      den *= X[k] - X[i]
    }
    total += Y[k] * (num / den)
  }
  return total
}

/* ----------------------- Textos (notación en pantalla) ------------------- */
const factorX = (xj) => `(x ${xj < 0 ? '+' : '−'} ${fmt(Math.abs(xj))})`

function textoNewton(X, c) {
  let s = ''
  for (let k = 0; k < c.length; k++) {
    const factores = X.slice(0, k).map(factorX).join('')
    const mag = fr(Math.abs(c[k]))
    const magTxt = mag.includes('/') && k > 0 ? `(${mag})` : mag
    if (k === 0) s += `${c[k] < 0 ? '−' : ''}${magTxt}`
    else s += ` ${c[k] < 0 ? '−' : '+'} ${magTxt}${factores}`
  }
  return s
}

function textoEstandar(coefAsc, modo = 'fr') {
  const n = coefAsc.length
  let out = ''
  for (let i = n - 1; i >= 0; i--) {
    const c = coefAsc[i]
    if (Math.abs(c) < 1e-12 && n > 1) continue
    const mag = modo === 'fr' ? fr(Math.abs(c)) : fix(Math.abs(c), 6)
    const magTxt = modo === 'fr' && mag.includes('/') && i > 0 ? `(${mag})` : mag
    const v = i === 0 ? '' : i === 1 ? 'x' : `x${sup(i)}`
    if (out === '') out += `${c < 0 ? '−' : ''}${magTxt}${v}`
    else out += ` ${c < 0 ? '−' : '+'} ${magTxt}${v}`
  }
  return out || '0'
}

const ORDINALES = ['Primeras', 'Segundas', 'Terceras', 'Cuartas', 'Quintas', 'Sextas']


/* ------------------------------------------------------------------------
   TABLA DE DIFERENCIAS FINITAS PROGRESIVAS (matriz triangular)
   D[i][0] = f_i ;  D[i][j] = D[i+1][j-1] − D[i][j-1]
   Los Δ^j f_0 son la PRIMERA FILA.
   ------------------------------------------------------------------------ */
function diferencias_finitas(Y) {
  const n = Y.length
  const D = Array.from({ length: n }, () => Array(n).fill(null))
  for (let i = 0; i < n; i++) D[i][0] = Y[i]
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n - j; i++) D[i][j] = D[i + 1][j - 1] - D[i][j - 1]
  }
  return D
}
const factorial = (k) => (k <= 1 ? 1 : k * factorial(k - 1))

/* a_i = Δ^i f_0 / (i!·h^i) */
function coeficientes_gregory(D, h) {
  return D[0].map((d, j) => d / (factorial(j) * h ** j))
}

/* Evaluación de Horner con la notación a_i de Newton–Gregory (con pasos) */
function horner_pasos(X, a, x) {
  const pasos = []
  let r = a[a.length - 1]
  pasos.push({ i: a.length - 1, texto: `b${sub(a.length - 1)} = a${sub(a.length - 1)} = ${fr(r)}` })
  for (let i = a.length - 2; i >= 0; i--) {
    const previo = r
    r = a[i] + (x - X[i]) * previo
    pasos.push({ i, texto: `b${sub(i)} = a${sub(i)} + (x − x${sub(i)})·b${sub(i + 1)} = ${fr(a[i])} + (${fmt(x)} − ${fmt(X[i])})·${fr(previo)} = ${fr(r)}` })
  }
  return pasos
}

const N_MIN = 2
const N_MAX = 8
const COLORES_GRADO = ['#a78bfa', '#facc15', '#38bdf8', '#34d399', '#fb7185', '#f97316']

/* Ejemplos de clase (todos equiespaciados) y los datos de la actividad (no lo son) */
const PRESETS = [
  {
    id: 'clase', etiqueta: 'Ejercicio de clase (h = 2)', xEval: 1, esperado: -21,
    nodos: [-3, -1, 1, 3, 5, 7, 9].map((x, i) => ({ x, y: [39, 19, -21, -57, -65, -21, 99][i] })),
    nota: 'Ejercicio de la guía y de la pizarra: Δ³f₀ = 24 y Δ⁴ = Δ⁵ = Δ⁶ = 0 → P(x) = ½x³ − x² − (41/2)x; P(1) = −21.',
  },
  {
    id: 'dv', etiqueta: 'Pizarra: D(v) (h = 20)', xEval: 90, esperado: 10.3125,
    nodos: [{ x: 60, y: 9 }, { x: 80, y: 10 }, { x: 100, y: 10.5 }],
    nota: 'Tabla de diferencias finitas de la pizarra: Δ⁰f₀ = 9, Δ¹f₀ = 1, Δ²f₀ = −0.5 → a₁ = 0.05, a₂ = −0.000625; P₂(90) = 10.3125.',
  },
  {
    id: 'excel', etiqueta: 'Excel de clase (h = 50)', xEval: 120, esperado: 52.2256,
    nodos: [{ x: 100, y: 50.2 }, { x: 150, y: 55.6 }, { x: 200, y: 61.8 }, { x: 250, y: 68.2 }],
    nota: 'Mismos datos del Excel de Newton: como h = 50 es constante, Gregory da el mismo P(120) = 52.2256.',
  },
  {
    id: 'actividad', etiqueta: 'Datos de la actividad (no equiesp.)', xEval: 5, esperado: null,
    nodos: [{ x: 1, y: 45 }, { x: 2, y: 65 }, { x: 4, y: 110 }, { x: 7, y: 220 }],
    nota: 'Aquí h = 1, 2, 3 (no es constante): Newton–Gregory NO aplica; para estos datos se usa Newton con diferencias divididas.',
  },
]

/* Texto del código fuente mostrado en pantalla (mismas funciones de arriba) */
const CODIGO_FUENTE = `/**
 * Tabla de diferencias finitas progresivas (matriz triangular)
 * @param {number[]} Y  valores f_i en nodos EQUIESPACIADOS x_i = x_0 + i*h
 * @returns {number[][]} D con D[i][0] = f_i y D[i][j] = D[i+1][j-1] - D[i][j-1]
 */
function diferencias_finitas(Y) {
  const n = Y.length
  const D = Array.from({ length: n }, () => Array(n).fill(null))
  for (let i = 0; i < n; i++) D[i][0] = Y[i]          // columna 0: f_i
  for (let j = 1; j < n; j++) {                        // orden de la diferencia
    for (let i = 0; i < n - j; i++) {                  // fila
      D[i][j] = D[i + 1][j - 1] - D[i][j - 1]          // Δ^j f_i
    }
  }
  return D        // los Δ^j f_0 son la primera fila: D[0][j]
}

/**
 * Coeficientes de Newton–Gregory:  a_i = Δ^i f_0 / (i! · h^i)
 * @param {number[][]} D  tabla de diferencias finitas
 * @param {number}     h  paso (distancia constante entre nodos)
 */
function coeficientes_gregory(D, h) {
  return D[0].map((delta, i) => delta / (factorial(i) * Math.pow(h, i)))
}

/**
 * P(x) = a0 + a1(x-x0) + a2(x-x0)(x-x1) + ...   (evaluación de Horner)
 */
function evaluar_newton(X, a, x) {
  let r = a[a.length - 1]
  for (let i = a.length - 2; i >= 0; i--) r = a[i] + (x - X[i]) * r
  return r
}

// Ejemplo de clase: X = [-3,-1,1,3,5,7,9], Y = [39,19,-21,-57,-65,-21,99], h = 2
//   a = [39, -10, -5/2, 1/2, 0, 0, 0]  →  P(1) = -21`

/* ====================== TEXTO DEL DESARROLLO MANUAL ===================== */

const HOJA_1 = `NEWTON–GREGORY (DIFERENCIAS FINITAS PROGRESIVAS) — EJERCICIO DE CLASE

DATOS (nodos equiespaciados, h = 2)
   x_i :  −3    −1     1     3     5     7     9
   f_i :  39    19   −21   −57   −65   −21    99

PASO 1: TABLA DE DIFERENCIAS FINITAS PROGRESIVAS
   Δf_i = f_{i+1} − f_i          Δ^{k+1} f_i = Δ^k f_{i+1} − Δ^k f_i

     x     f(x)    Δ¹     Δ²    Δ³    Δ⁴    Δ⁵    Δ⁶
    −3      39    −20    −20    24     0     0     0
    −1      19    −40      4    24     0     0
     1     −21    −36     28    24     0
     3     −57     −8     52    24
     5     −65     44     76
     7     −21    120
     9      99

   Ejemplos de cálculo:  Δf_0 = 19 − 39 = −20 ;  Δ²f_0 = −40 − (−20) = −20 ;  Δ³f_0 = 4 − (−20) = 24

PASO 2: COEFICIENTES   a_i = Δ^i f_0 / ( i! · h^i )      (h = 2)
   a_0 = 39 / (0! · 2⁰)  = 39
   a_1 = −20 / (1! · 2¹) = −10
   a_2 = −20 / (2! · 2²) = −20 / 8  = −5/2 = −2.5
   a_3 = 24 / (3! · 2³)  = 24 / 48  = 1/2 = 0.5
   a_4 = a_5 = a_6 = 0       (las diferencias Δ⁴, Δ⁵, Δ⁶ son 0)

PASO 3: POLINOMIO DE NEWTON–GREGORY
   P(x) = a_0 + a_1(x − x_0) + a_2(x − x_0)(x − x_1) + a_3(x − x_0)(x − x_1)(x − x_2)
   P(x) = 39 − 10(x + 3) − (5/2)(x + 3)(x + 1) + (1/2)(x + 3)(x + 1)(x − 1)

PASO 4: FORMA NORMALIZADA
   (x + 3)(x + 1)         = x² + 4x + 3
   (x + 3)(x + 1)(x − 1)  = x³ + 3x² − x − 3
   39                       = 39
   −10(x + 3)               = −10x − 30
   −(5/2)(x² + 4x + 3)      = −(5/2)x² − 10x − 15/2
   (1/2)(x³ + 3x² − x − 3)  = (1/2)x³ + (3/2)x² − (1/2)x − 3/2
   x³ : 1/2
   x² : −5/2 + 3/2 = −1
   x  : −10 − 10 − 1/2 = −41/2
   x⁰ : 39 − 30 − 15/2 − 3/2 = 0
   P(x) = (1/2)x³ − x² − (41/2)x

COMPROBACIÓN en x = 1
   P(1) = 39 − 10(4) − (5/2)(4)(2) = 39 − 40 − 20 = −21   (= f(1))   OK`

const HOJA_2 = `NEWTON–GREGORY — EJEMPLO DE PIZARRA: VELOCIDAD vs. DESEMPEÑO

DATOS (h = 20)
   v :  60    80    100
   D :   9    10    10.5

PASO 1: TABLA DE DIFERENCIAS FINITAS PROGRESIVAS
     v     D(v)    Δ⁰      Δ¹              Δ²
    60       9      9    10 − 9   = 1     0.5 − 1 = −0.5
    80      10     10    10.5 − 10 = 0.5
   100    10.5   10.5

PASO 2: COEFICIENTES   a_i = Δ^i f_0 / ( i! · h^i )
   a_0 = 9 / (0! · 20⁰)        = 9
   a_1 = 1 / (1! · 20¹)        = 1/20 = 0.05
   a_2 = −0.5 / (2! · 20²)     = −0.5 / 800 = −0.000625

PASO 3: POLINOMIO
   P2(x) = 9 + 0.05(x − 60) − 0.000625(x − 60)(x − 80)

PASO 4: INTERPOLACIÓN EN v = 90 km/h
   P2(90) = 9 + 0.05(90 − 60) − 0.000625(90 − 60)(90 − 80)
          = 9 + 1.5 − 0.1875 = 10.3125 km/l

FORMA NORMALIZADA
   (x − 60)(x − 80) = x² − 140x + 4800
   P2(x) = 9 + 0.05x − 3 − 0.000625x² + 0.0875x − 3
   P2(x) = 3 + 0.1375x − 0.000625x²`

const HOJAS = [
  { id: 1, titulo: 'Hoja 1 — Ejercicio de clase (h = 2): TDFP, coeficientes y polinomio', texto: HOJA_1 },
  { id: 2, titulo: 'Hoja 2 — Ejemplo de pizarra: velocidad–desempeño (h = 20)', texto: HOJA_2 },
]
const MANUAL_TODO = HOJAS.map((h) => h.texto).join('\n\n──────────── (nueva hoja) ────────────\n\n')

/* ============================ PIEZAS DE INTERFAZ ========================= */

const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/40 p-5'

function Seccion({ num, titulo, children, nota }) {
  return (
    <div className={CARD}>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-xs font-mono text-sky-400/80">{String(num).padStart(2, '0')}</span>
        <h2 className="font-semibold text-slate-100">{titulo}</h2>
      </div>
      {nota && <p className="text-xs text-slate-500 mb-4 ml-7">{nota}</p>}
      <div className={nota ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }

async function copiarTexto(texto, clave, setCopiado) {
  try {
    await navigator.clipboard.writeText(texto)
    setCopiado(clave)
  } catch {
    setCopiado('error')
  }
  setTimeout(() => setCopiado(null), 1800)
}

const inputCls =
  'w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60'

/* ============================ COMPONENTE PRINCIPAL ======================= */

export default function PracticaGregory() {
  const [nodos, setNodos] = useState(PRESETS[0].nodos)
  const [xEvalStr, setXEvalStr] = useState(String(PRESETS[0].xEval))
  const [presetId, setPresetId] = useState('clase')
  const [ocultos, setOcultos] = useState([])
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(null)
  const [copiado, setCopiado] = useState(null)

  const n = nodos.length
  const X = nodos.map((p) => p.x)
  const Y = nodos.map((p) => p.y)
  const xEval = Number(xEvalStr)
  MODO_FR = X.every(Number.isInteger) && Y.every(Number.isInteger) && Number.isInteger(xEval)
  const numerosOk = X.every(Number.isFinite) && Y.every(Number.isFinite)
  const distintos = new Set(X).size === X.length
  const evalOk = xEvalStr !== '' && Number.isFinite(xEval)

  /* ¿equiespaciados y ascendentes? */
  const pasosH = numerosOk ? X.slice(1).map((x, i) => x - X[i]) : []
  const h = pasosH[0]
  const equi = numerosOk && distintos && pasosH.length > 0 && h > 0 &&
    pasosH.every((d) => Math.abs(d - h) < 1e-9 * Math.max(1, Math.abs(h)))
  const datosOk = equi

  /* ------- cálculos ------- */
  const D = datosOk ? diferencias_finitas(Y) : null
  const a = D ? coeficientes_gregory(D, h) : null
  const estandar = a ? newtonAEstandar(X, a) : null
  const resultado = a && evalOk ? evaluar_newton(X, a, xEval) : NaN
  const pasosHorner = a && evalOk ? horner_pasos(X, a, xEval) : []
  const gradoEfectivo = a ? a.reduce((g, c, j) => (Math.abs(c) > 1e-9 ? j : g), 0) : 0
  const dd = datosOk ? diferencias_divididas(X, Y)[0] : null          // verificación cruzada

  const terminosEval = a && evalOk
    ? a.map((c, k) => {
        let prod = 1
        for (let j = 0; j < k; j++) prod *= xEval - X[j]
        return { k, c, prod, valor: c * prod }
      })
    : []
  const porGrado = []
  terminosEval.reduce((acc, t) => {
    const total = acc + t.valor
    porGrado.push({ d: t.k, termino: t.valor, total })
    return total
  }, 0)

  const validacion = a
    ? nodos.map((p, i) => {
        const pv = evaluar_newton(X, a, p.x)
        return { i, x: p.x, y: p.y, pv, dif: Math.abs(pv - p.y) }
      })
    : []
  const tol = 1e-8 * Math.max(1, ...Y.filter(Number.isFinite).map(Math.abs))
  const todosPasan = validacion.length > 0 && validacion.every((v) => v.dif < tol)

  /* gráfica */
  const xmin = datosOk ? Math.min(...X) : 0
  const xmax = datosOk ? Math.max(...X) : 1
  const grados = Array.from({ length: n - 1 }, (_, i) => i + 1)
  const visibles = grados.filter((d) => !ocultos.includes(d))
  const curva = a
    ? Array.from({ length: 161 }, (_, i) => {
        const x = xmin + ((xmax - xmin) * i) / 160
        const fila = { x }
        grados.forEach((d) => { fila[`p${d}`] = evaluar_newton(X, a.slice(0, d + 1), x) })
        return fila
      })
    : []
  const puntosNodos = nodos.map((p) => ({ x: p.x, y: p.y }))
  const fueraDeRango = evalOk && (xEval < xmin || xEval > xmax)

  /* ------- acciones ------- */
  const presetActivo = PRESETS.find((q) => q.id === presetId) ?? null
  const coincideEsperado = presetActivo && presetActivo.esperado !== null && Number.isFinite(resultado)
    ? Math.abs(resultado - presetActivo.esperado) < 5e-4 : null
  const cargarPreset = (id) => {
    const pr = PRESETS.find((q) => q.id === id)
    setNodos(pr.nodos); setXEvalStr(String(pr.xEval)); setOcultos([]); setPresetId(id)
  }
  const actualizarNodo = (i, campo, valor) => {
    setPresetId(null)
    setNodos((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor === '' ? '' : Number(valor) } : p)))
  }
  const agregarPunto = () => {
    setPresetId(null)
    setNodos((prev) => {
      const ult = prev[prev.length - 1]
      const pen = prev[prev.length - 2]
      const paso = pen && Number.isFinite(ult.x) && Number.isFinite(pen.x) ? ult.x - pen.x : 1
      return [...prev, { x: Number.isFinite(ult.x) ? ult.x + paso : 0, y: Number.isFinite(ult.y) ? ult.y : 0 }]
    })
  }
  const quitarPunto = () => { setPresetId(null); setNodos((prev) => prev.slice(0, -1)) }
  const reespaciar = () => {
    setPresetId(null)
    setNodos((prev) => {
      const x0 = prev[0].x
      const paso = Number.isFinite(prev[1]?.x - x0) && prev[1].x - x0 > 0 ? prev[1].x - x0 : 1
      return prev.map((p, i) => ({ ...p, x: Number((x0 + i * paso).toFixed(10)) }))
    })
  }
  const alternarGrado = (d) => setOcultos((prev) => (prev.includes(d) ? prev.filter((g) => g !== d) : [...prev, d]))
  const estadoCopiado = (clave, etiqueta) =>
    copiado === clave ? '✓ copiado' : copiado === 'error' ? 'no se pudo copiar' : etiqueta

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-sky-400/80 mb-1">
            Métodos Numéricos · Sesión 9 · Newton–Gregory
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Interpolación de Newton–Gregory (puntos equiespaciados)
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Cuando los nodos están igualmente espaciados (xᵢ = x₀ + i·h) las diferencias divididas se simplifican
            a diferencias finitas progresivas: aᵢ = Δⁱf₀ / (i!·hⁱ). El polinomio es el mismo de Newton:
            P(x) = a₀ + a₁(x−x₀) + a₂(x−x₀)(x−x₁) + …
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada de datos ------------------------- */}
        <Seccion num={1} titulo="Entrada de datos y verificación de nodos equiespaciados"
          nota="Condición del método: x ascendentes con distancia constante h entre nodos consecutivos">
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Cargar ejemplo:</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((q) => (
                <button key={q.id} onClick={() => cargarPreset(q.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${presetId === q.id ? 'bg-sky-500/20 border-sky-400/50 text-sky-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60'}`}>
                  {q.etiqueta}
                </button>
              ))}
            </div>
            {presetActivo && (
              <p className="text-xs text-slate-500 mt-2">
                {presetActivo.nota}
                {coincideEsperado === true && <span className="text-emerald-400"> ✓ El programa reproduce el valor esperado ({presetActivo.esperado}).</span>}
                {coincideEsperado === false && <span className="text-rose-400"> ✗ No coincide con el valor esperado ({presetActivo.esperado}).</span>}
              </p>
            )}
          </div>
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">i</th>
                      <th className="text-left font-medium px-3 py-2">xᵢ</th>
                      <th className="text-left font-medium px-3 py-2">f(xᵢ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodos.map((p, i) => (
                      <tr key={i} className="border-t border-slate-900">
                        <td className="px-3 py-2 font-mono text-slate-400">{i}</td>
                        <td className="px-3 py-1.5"><input type="number" value={p.x} onChange={(e) => actualizarNodo(i, 'x', e.target.value)} className={inputCls} /></td>
                        <td className="px-3 py-1.5"><input type="number" value={p.y} onChange={(e) => actualizarNodo(i, 'y', e.target.value)} className={inputCls} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {numerosOk && (
                <div className={`rounded-xl border px-4 py-2.5 text-sm ${equi ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                  {equi
                    ? `Nodos equiespaciados: h = ${fmt(h, 6)} (distancias: ${pasosH.map((d) => fmt(d, 6)).join(', ')}). Se puede aplicar Newton–Gregory.`
                    : `Distancias entre nodos: ${pasosH.map((d) => fmt(d, 6)).join(', ')} → NO son constantes (o no están en orden ascendente). Newton–Gregory no aplica: usa Newton con diferencias divididas.`}
                </div>
              )}
              {!numerosOk && <p className="text-xs text-rose-400">Completa todos los valores con números.</p>}
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs text-slate-400">
                Punto a interpolar x
                <input type="number" value={xEvalStr} onChange={(e) => { setPresetId(null); setXEvalStr(e.target.value) }}
                  className="mt-1 block w-32 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60" />
              </label>
              <div className="flex gap-2">
                <button onClick={agregarPunto} disabled={n >= N_MAX}
                  className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 disabled:opacity-30">+ punto</button>
                <button onClick={quitarPunto} disabled={n <= N_MIN}
                  className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 disabled:opacity-30">− punto</button>
              </div>
              <button onClick={reespaciar}
                className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 max-w-[14rem]">
                reespaciar x con h = x₁ − x₀
              </button>
            </div>
          </div>
        </Seccion>

        {datosOk && (
          <>
            {/* ------------------- 2. Tabla de diferencias finitas ------------------- */}
            <Seccion num={2} titulo="Paso 1 — Tabla de diferencias finitas progresivas (TDFP)"
              nota="Δfᵢ = fᵢ₊₁ − fᵢ  ·  Δᵏ⁺¹fᵢ = Δᵏfᵢ₊₁ − Δᵏfᵢ  — la primera fila contiene los Δⁱf₀">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">xᵢ</th>
                      <th className="text-right font-medium px-3 py-2">f(xᵢ)</th>
                      {Array.from({ length: n - 1 }, (_, j) => (
                        <th key={j} className="text-right font-medium px-3 py-2">Δ{sup(j + 1)}f</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {D.map((fila, i) => (
                      <tr key={i} className={`border-t border-slate-900 ${i === 0 ? 'bg-sky-500/10' : ''}`}>
                        <td className="px-3 py-2 font-mono text-slate-300">{fmt(X[i])}</td>
                        {fila.map((v, j) => (
                          <td key={j} className={`px-3 py-2 font-mono text-right ${i === 0 ? 'text-sky-200 font-semibold' : 'text-slate-300'}`}>
                            {v === null || j === 0 && false ? '' : fr(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Fila resaltada: {D[0].map((d, j) => `Δ${sup(j)}f${sub(0)} = ${fr(d)}`).join(' · ')}. (La columna f(xᵢ) es Δ⁰f.)
              </p>
              <div className="mt-4 space-y-3">
                {Array.from({ length: n - 1 }, (_, jj) => jj + 1).map((j) => (
                  <div key={j}>
                    <div className="text-xs text-slate-400 mb-1">{ORDINALES[j - 1] ?? `${j}.as`} diferencias</div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                      {Array.from({ length: n - j }, (_, i) => (
                        <div key={i} className="whitespace-nowrap">
                          Δ{sup(j)}f{sub(i)} = {j === 1 ? `f${sub(i + 1)} − f${sub(i)}` : `Δ${sup(j - 1)}f${sub(i + 1)} − Δ${sup(j - 1)}f${sub(i)}`} = {fr(D[i + 1][j - 1])} − {D[i][j - 1] < 0 ? `(${fr(D[i][j - 1])})` : fr(D[i][j - 1])} = <span className="text-sky-300">{fr(D[i][j])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Seccion>

            {/* ------------------- 3. Coeficientes ------------------- */}
            <Seccion num={3} titulo="Paso 2 — Coeficientes aᵢ = Δⁱf₀ / (i!·hⁱ)"
              nota={`Paso constante h = ${fmt(h, 6)}`}>
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto">
                {a.map((c, i) => (
                  <div key={i} className="whitespace-nowrap">
                    a{sub(i)} = Δ{sup(i)}f{sub(0)} / ({i}!·h{sup(i)}) = {fr(D[0][i])} / ({factorial(i)}·{fmt(h, 6)}{i > 1 ? sup(i) : ''}
                    {i > 1 ? ` = ${factorial(i)}·${fmt(h ** i, 6)}` : ''}) = <span className="text-sky-300">{fr(c)}</span>
                    {Math.abs(c - Math.round(c)) > 1e-9 && <span className="text-slate-500"> ≈ {fix(c, 6)}</span>}
                  </div>
                ))}
              </div>
            </Seccion>

            {/* ------------------- 4. Polinomio ------------------- */}
            <Seccion num={4} titulo="Paso 3 — Polinomio de Newton–Gregory y forma estándar"
              nota="Pₙ(x) = a₀ + a₁(x−x₀) + a₂(x−x₀)(x−x₁) + …  — luego se expande y se agrupa">
              <div className="space-y-3">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 overflow-x-auto">
                  <div className="font-mono text-sm text-slate-100 whitespace-nowrap">
                    P(x) = {textoNewton(X, a.slice(0, gradoEfectivo + 1))}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 overflow-x-auto">
                  <div className="font-mono text-base text-slate-100 whitespace-nowrap">
                    P(x) = {textoEstandar(estandar, 'fr')}
                  </div>
                  <div className="font-mono text-xs text-slate-400 whitespace-nowrap mt-1">
                    P(x) ≈ {textoEstandar(estandar, 'dec')}
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Grado nominal n − 1 = {n - 1} · grado efectivo = {gradoEfectivo}
                  {gradoEfectivo < n - 1 && ' (los coeficientes siguientes son 0: los datos pertenecen a un polinomio de menor grado)'}
                </p>
              </div>
            </Seccion>

            {/* ------------------- 5. Interpolación ------------------- */}
            <Seccion num={5} titulo={`Paso 4 — Interpolación en x = ${fmt(xEval)}`}
              nota="Evaluación término a término y con la regla de Horner">
              {evalOk ? (
                <div className="space-y-5">
                  <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
                      <div className="text-xs text-emerald-300/80 mb-1">Valor interpolado en x = {fmt(xEval)}</div>
                      <div className="text-3xl font-bold font-mono text-emerald-200">{fix(resultado, 4)}</div>
                      <div className="text-[11px] text-slate-500 mt-1">P({fmt(xEval)}) = {fr(resultado)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                      {pasosHorner.map((p) => <div key={p.i} className="whitespace-nowrap">{p.texto}</div>)}
                      <div className="text-emerald-300">P({fmt(xEval)}) = b₀ = {fr(resultado)}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    <div className="whitespace-nowrap">
                      P({fmt(xEval)}) = {terminosEval.map((t, k) => {
                        const fac = X.slice(0, k).map((xj) => `(${fmt(xEval)} ${xj < 0 ? '+' : '−'} ${fmt(Math.abs(xj))})`).join('')
                        const mag = esFraccion(t.c) ? `(${fr(t.c)})` : fr(t.c)
                        return `${k === 0 ? '' : ' + '}${mag}${fac}`
                      }).join('')}
                    </div>
                    <div className="whitespace-nowrap">
                      {'      '}= {terminosEval.map((t, k) => `${k === 0 ? '' : ' + '}${fr(t.valor)}`).join('')} = <span className="text-emerald-300">{fr(resultado)}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Grado d</th>
                          <th className="text-right font-medium px-3 py-2">Término añadido</th>
                          <th className="text-right font-medium px-3 py-2">P_d({fmt(xEval)})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porGrado.map((g) => (
                          <tr key={g.d} className="border-t border-slate-900">
                            <td className="px-3 py-1.5 font-mono text-slate-300">P{sub(g.d)}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-slate-300">{g.d === 0 ? '—' : `+ ${fr(g.termino)}`}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fr(g.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : <p className="text-sm text-rose-400">Ingresa un valor numérico para x.</p>}
            </Seccion>

            {/* ------------------- 6. Validación ------------------- */}
            <Seccion num={6} titulo="Validación — pasa por los nodos y coincide con las diferencias divididas"
              nota="Con nodos equiespaciados aᵢ = f[x₀,…,xᵢ]: Gregory y Newton generan exactamente el mismo polinomio">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">i</th>
                      <th className="text-right font-medium px-3 py-2">xᵢ</th>
                      <th className="text-right font-medium px-3 py-2">f(xᵢ)</th>
                      <th className="text-right font-medium px-3 py-2">P(xᵢ)</th>
                      <th className="text-right font-medium px-3 py-2">aᵢ (Gregory)</th>
                      <th className="text-right font-medium px-3 py-2">f[x₀…xᵢ] (Newton)</th>
                      <th className="text-right font-medium px-3 py-2">|diferencia|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validacion.map((v) => (
                      <tr key={v.i} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{v.i}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(v.x)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(v.y)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(v.pv, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fr(a[v.i])}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fr(dd[v.i])}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">{Math.abs(a[v.i] - dd[v.i]).toExponential(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${todosPasan ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                {todosPasan ? `Validado: P(xᵢ) = f(xᵢ) en los ${n} nodos y los coeficientes coinciden con los de Newton.` : 'Algún nodo no coincide: revisa los datos.'}
              </div>
            </Seccion>

            {/* ------------------- 7. Gráfica ------------------- */}
            <Seccion num={7} titulo="Gráfica interactiva — curva y comparación de grados"
              nota="Activa o desactiva P_d para ver cómo cada término mejora el ajuste; los rombos son los datos">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-slate-400">Grados visibles:</span>
                {grados.map((d, idx) => {
                  const activo = !ocultos.includes(d)
                  const color = COLORES_GRADO[idx % COLORES_GRADO.length]
                  return (
                    <button key={d} onClick={() => alternarGrado(d)}
                      className={`text-xs px-3 py-1 rounded-full border font-mono transition-colors ${activo ? 'bg-slate-800/70' : 'opacity-40'}`}
                      style={{ borderColor: color, color }}>
                      P{sub(d)}
                    </button>
                  )
                })}
              </div>
              {fueraDeRango && <p className="text-xs text-amber-400 mb-2">x = {fmt(xEval)} está fuera de [{fmt(xmin)}, {fmt(xmax)}]: sería extrapolación.</p>}
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={curva} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={[xmin, xmax]} stroke="#64748b"
                    label={{ value: 'x', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis type="number" stroke="#64748b" domain={['auto', 'auto']}
                    label={{ value: 'f(x)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                    formatter={(v) => Number(v).toFixed(3)} labelFormatter={(v) => `x = ${Number(v).toFixed(3)}`} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {grados.map((d, idx) => visibles.includes(d) && (
                    <Line key={d} type="monotone" dataKey={`p${d}`} name={`P${sub(d)}(x)`}
                      stroke={COLORES_GRADO[idx % COLORES_GRADO.length]}
                      strokeWidth={d === n - 1 ? 3 : 1.8} strokeDasharray={d === n - 1 ? undefined : '6 4'}
                      dot={false} isAnimationActive={false} />
                  ))}
                  <Scatter data={puntosNodos} dataKey="y" name="datos" fill="#f43f5e" shape="diamond" />
                  {evalOk && Number.isFinite(resultado) && !fueraDeRango && (
                    <ReferenceDot x={xEval} y={resultado} r={7} fill="#facc15" stroke="#0f172a" strokeWidth={2}
                      label={{ value: `(${fmt(xEval)}, ${fix(resultado, 2)})`, position: 'top', fill: '#facc15', fontSize: 11 }} />
                  )}
                  {evalOk && !fueraDeRango && <ReferenceLine x={xEval} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
                  {evalOk && Number.isFinite(resultado) && !fueraDeRango && <ReferenceLine y={resultado} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
                </ComposedChart>
              </ResponsiveContainer>
            </Seccion>
          </>
        )}

        {/* ------------------- 8. Código ------------------- */}
        <Seccion num={datosOk ? 8 : 2} titulo="Código fuente documentado"
          nota="diferencias_finitas(Y), coeficientes_gregory(D, h) y evaluar_newton(X, a, x)">
          <button onClick={() => setMostrarCodigo((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 mb-3">
            {mostrarCodigo ? 'ocultar código' : 'ver código'}
          </button>
          <AnimatePresence>
            {mostrarCodigo && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }} className="overflow-hidden">
                <pre className="text-xs font-mono text-slate-300 bg-slate-950/70 border border-slate-800 rounded-xl p-4 overflow-x-auto leading-relaxed">
{CODIGO_FUENTE}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </Seccion>

        {/* ------------------- 9. Desarrollo manual ------------------- */}
        <Seccion num={datosOk ? 9 : 3} titulo="Desarrollo manual de los ejemplos de clase — para copiar a hoja bond"
          nota="Dos hojas con los ejemplos de la pizarra (cada una con su botón de copiar)">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => copiarTexto(MANUAL_TODO, 'todo', setCopiado)}
              className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              {estadoCopiado('todo', 'copiar las 2 hojas')}
            </button>
            <button onClick={() => setHojaAbierta(hojaAbierta === 'todas' ? null : 'todas')}
              className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10">
              {hojaAbierta === 'todas' ? 'ocultar todas' : 'ver todas'}
            </button>
          </div>
          <div className="space-y-3">
            {HOJAS.map((hj) => {
              const abierta = hojaAbierta === 'todas' || hojaAbierta === hj.id
              return (
                <div key={hj.id} className="rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="text-sm text-slate-200">{hj.titulo}</div>
                    <div className="flex gap-2">
                      <button onClick={() => setHojaAbierta(abierta && hojaAbierta !== 'todas' ? null : hj.id)}
                        className="text-xs px-3 py-1 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10">{abierta ? 'ocultar' : 'ver'}</button>
                      <button onClick={() => copiarTexto(hj.texto, `h${hj.id}`, setCopiado)}
                        className="text-xs px-3 py-1 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">{estadoCopiado(`h${hj.id}`, `copiar hoja ${hj.id}`)}</button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {abierta && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }} className="overflow-hidden">
                        <pre className="text-[11px] leading-relaxed font-mono text-slate-300 border-t border-slate-800 px-4 py-3 overflow-x-auto whitespace-pre">
{hj.texto}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </Seccion>

      </div>
    </div>
  )
}
