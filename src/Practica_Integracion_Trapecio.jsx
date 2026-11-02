import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, Area, Scatter, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 12 · INTEGRACIÓN NUMÉRICA — REGLA DEL TRAPECIO COMPUESTO
   Estimación del tráfico de red en un servidor web

   Contexto: el ancho de banda R(t) (Mbps) de un microservicio crítico
   fluctuó durante un pico de demanda en el intervalo [0, 12] s:
        R(t) = 10 + 5·sen(πt/4) + e^(0.15t)
   Se pide la cantidad total de datos transferidos (Megabits):
        D = ∫₀¹² R(t) dt

   Teoría (guía teórica, Sesión 12):
     • Regla de los rectángulos:  S_n = Σ h·f(c_i),  h = (b − a)/n
     • Trapecio simple:   ∫ f dx ≈ (h/2)·[ f(x0) + f(x1) ]
     • Trapecio compuesto (n+1 abscisas separadas h):
         ∫ f dx ≈ (h/2)·{ f(x0) + 2[ f(x1) + … + f(x_{n−1}) ] + f(xn) }
     • Cota del error:  |E| ≤ n·h³/12 · máx|f''(x)|

   Requisitos del enunciado (PDF de la actividad):
     Parte 1 — Modelado teórico (n = 4 subintervalos):
       1) Calcular el ancho de paso h.
       2) Determinar la malla t0…t4 y los valores R(t_i).
       3) Aplicar el trapecio compuesto y obtener I_trapecio.
     Parte 2 — Implementación de software:
       4) Función trapecio_compuesto(f, a, b, n) para cualquier n.
       5) Tabla comparativa (valor calculado, error absoluto real y % de error)
          para n ∈ {4, 10, 50, 100, 1000}.
   ========================================================================= */

/* ============================== UTILIDADES =============================== */

const SUBS = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n) => String(n).split('').map((d) => SUBS[+d] ?? d).join('')

function fmt(v, d = 6) {
  if (!Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(d))
  return Object.is(r, -0) ? '0' : r.toString()
}
const sciCorto = (v) => v.toExponential(3).replace(/\.?0+e/, 'e')
/* Decimal fijo; los valores diminutos (|v| < 1e-4) pasan a notación científica */
const fix = (v, d = 6) => {
  if (!Number.isFinite(v)) return '—'
  if (v !== 0 && Math.abs(v) < 1e-4) return sciCorto(v)
  return v.toFixed(d)
}

/* ------------------------------------------------------------------------
   Función f(x) a partir de un texto (para "función propia" y para los
   ejemplos). Se permite x (o t), pi, e, ^ y funciones de Math (sin, cos, exp,
   log, sqrt, ...). Todo lo demás se rechaza.
   ------------------------------------------------------------------------ */
const PERMITIDAS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log10']

function crearFuncion(texto) {
  try {
    let e = String(texto).trim()
    if (!e) return { error: 'Escribe una función.' }
    e = e.replace(/sen\(/gi, 'sin(').replace(/\bln\(/gi, 'log(').replace(/\bpi\b/gi, 'PI').replace(/\be\b/g, 'E')
    // a^b  →  pow(a,b)   (se repite para potencias anidadas)
    for (let k = 0; k < 6; k++) {
      const nuevo = e.replace(/([A-Za-z0-9_.]+|\([^()]*\))\s*\^\s*([A-Za-z0-9_.]+|\([^()]*\))/g, 'pow($1,$2)')
      if (nuevo === e) break
      e = nuevo
    }
    if (!/^[0-9a-zA-Z_+\-*/().,\s]*$/.test(e)) return { error: 'Hay caracteres no permitidos.' }
    const ids = e.match(/[a-zA-Z_]+/g) ?? []
    if (!ids.every((id) => id === 'x' || id === 't' || id === 'PI' || id === 'E' || PERMITIDAS.includes(id))) {
      return { error: 'Usa solo x (o t), pi, e y funciones como sin, cos, exp, log, sqrt, pow.' }
    }
    const fn = new Function('x', ...PERMITIDAS, 'PI', 'E', `const t = x; return (${e});`)
    const mates = PERMITIDAS.map((nm) => Math[nm])
    return { f: (x) => fn(x, ...mates, Math.PI, Math.E) }
  } catch {
    return { error: 'Expresión no válida (usa * para multiplicar: 5*x).' }
  }
}

/* ------------------------------------------------------------------------
   MÓDULO DE CÁLCULO — Regla del trapecio compuesto
   I ≈ (h/2)·{ f(x0) + 2[f(x1)+…+f(x_{n−1})] + f(xn) },   h = (b − a)/n
   ------------------------------------------------------------------------ */
function trapecio_compuesto(f, a, b, n) {
  const h = (b - a) / n
  let suma = f(a) + f(b)                  // extremos: factor 1
  for (let i = 1; i < n; i++) suma += 2 * f(a + i * h)   // interiores: factor 2
  return (h / 2) * suma
}

/* Regla de los rectángulos:  S_n = Σ h·f(c_i)  (c_i = punto medio / izq. / der.) */
function rectangulos(f, a, b, n, modo) {
  const h = (b - a) / n
  let s = 0
  for (let i = 1; i <= n; i++) {
    const c = modo === 'izq' ? a + (i - 1) * h : modo === 'der' ? a + i * h : a + (i - 0.5) * h
    s += f(c)
  }
  return h * s
}

/* Valor de referencia numérico (Simpson con n muy grande) cuando no hay
   antiderivada conocida (solo para "función propia"). */
function simpsonReferencia(f, a, b, n = 200000) {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h)
  return (h / 3) * s
}

/* máx|f''(x)| estimado con la segunda diferencia central (para la cota del error) */
function maxSegundaDerivada(f, a, b) {
  const N = 2000
  const d = (b - a) / 1000
  let m = 0
  for (let i = 0; i <= N; i++) {
    const x = a + d + ((b - a - 2 * d) * i) / N
    const f2 = (f(x + d) - 2 * f(x) + f(x - d)) / (d * d)
    if (Number.isFinite(f2)) m = Math.max(m, Math.abs(f2))
  }
  return m
}

/* Filas que se muestran en las tablas: todas si son pocas; si no, primeras 6,
   "⋮" y últimas 3. */
function indicesVisibles(total) {
  if (total <= 14) return Array.from({ length: total }, (_, i) => i)
  return [0, 1, 2, 3, 4, 5, null, total - 3, total - 2, total - 1]
}

/* ====================== EJEMPLOS (actividad y clase) ===================== */

const PRESETS = [
  {
    id: 'trafico', etiqueta: 'Actividad: tráfico R(t)', v: 't', unidadY: 'Mbps', unidadI: 'Mb',
    expr: '10 + 5*sin(pi*t/4) + exp(0.15*t)', a: 0, b: 12, n: 4,
    F: (t) => 10 * t - (20 / Math.PI) * Math.cos((Math.PI * t) / 4) + Math.exp(0.15 * t) / 0.15,
    esperado: 160.4437,
    nota: 'Datos de la tarea: D = ∫₀¹² R(t) dt con n = 4. El Excel de clase (a = 0, b = 12, n = 4) muestra 160.444.',
    analitica: [
      '∫₀¹² R(t) dt = [ 10t − (20/π)·cos(πt/4) + e^(0.15t)/0.15 ]₀¹²',
      '= (120 + 20/π + e^1.8/0.15) − (−20/π + 1/0.15)',
      '= 120 + 40/π + (e^1.8 − 1)/0.15',
    ],
  },
  {
    id: 'exp10', etiqueta: 'Pizarra: eˣ (n = 10)', v: 'x', unidadY: '', unidadI: '',
    expr: 'exp(x)', a: 0, b: 1, n: 10, F: (x) => Math.exp(x), esperado: 1.719714,
    nota: 'Pizarra: ∫₀¹ eˣ dx = 1.718282, h = 0.1, Σ c·f = 34.394271 → 1.719714; error 0.08 %.',
    analitica: ['∫₀¹ eˣ dx = eˣ |₀¹ = e − 1 = 1.718282'],
  },
  {
    id: 'exp1', etiqueta: 'Pizarra: eˣ (n = 1)', v: 'x', unidadY: '', unidadI: '',
    expr: 'exp(x)', a: 0, b: 1, n: 1, F: (x) => Math.exp(x), esperado: 1.859141,
    nota: 'Pizarra (trapecio simple): ½[1 + 2.7183] = 1.8592 frente a 1.7183 → error 8.2 %.',
    analitica: ['∫₀¹ eˣ dx = eˣ |₀¹ = e − 1 = 1.718282'],
  },
  {
    id: 'inv', etiqueta: 'Pizarra: 1/x en [3, 3.6]', v: 'x', unidadY: '', unidadI: '',
    expr: '1/x', a: 3, b: 3.6, n: 1, F: (x) => Math.log(x), esperado: 0.183333,
    nota: 'Pizarra: h = 0.6 → 0.6/2·(0.3333 + 0.2777) = 0.1833; analítica 0.1823; error 0.54 % (con todos los decimales: 0.55 %).',
    analitica: ['∫₃³·⁶ (1/x) dx = ln(x) |₃³·⁶ = ln(3.6) − ln(3) = 0.182322'],
  },
  {
    id: 'parab', etiqueta: 'Pizarra: 1 − x² (rectángulos)', v: 'x', unidadY: '', unidadI: '',
    expr: '1 - x^2', a: -1, b: 1, n: 4, F: (x) => x - (x ** 3) / 3, esperado: 1.25, esperadoRect: 1.375,
    nota: 'Pizarra (rectángulos, puntos medios): h = 0.5 → 0.5·(0.4375 + 0.9375 + 0.9375 + 0.4375) = 1.375 frente a 4/3 → 3.12 %. Con trapecios y n = 4 da 1.25.',
    analitica: ['∫₋₁¹ (1 − x²) dx = [ x − x³/3 ]₋₁¹ = 2(1 − 1/3) = 4/3 = 1.333333'],
  },
  {
    id: 'custom', etiqueta: 'Función propia', v: 'x', unidadY: '', unidadI: '',
    expr: 'sin(x)', a: 0, b: 3.141593, n: 8, F: null, esperado: null,
    nota: 'Escribe tu propia f(x) (variable x o t). El valor de referencia se calcula numéricamente con Simpson (n = 200 000).',
    analitica: null,
  },
]

/* Texto del código fuente mostrado en pantalla (mismas funciones de arriba) */
const CODIGO_FUENTE = `/**
 * Regla del trapecio compuesto
 * @param {(x:number)=>number} f  función a integrar
 * @param {number} a  límite inferior        @param {number} b  límite superior
 * @param {number} n  número de subintervalos de igual ancho (n >= 1)
 * @returns {number} aproximación de la integral de f en [a, b]
 *
 *   I ≈ (h/2) · { f(x0) + 2[ f(x1) + ... + f(x_{n-1}) ] + f(xn) },   h = (b - a) / n
 */
function trapecio_compuesto(f, a, b, n) {
  const h = (b - a) / n                         // ancho de paso
  let suma = f(a) + f(b)                        // extremos (factor 1)
  for (let i = 1; i < n; i++) {
    suma += 2 * f(a + i * h)                    // puntos interiores (factor 2)
  }
  return (h / 2) * suma
}

/**
 * Análisis de convergencia: valor calculado, error absoluto real y % de error
 * @param {number} exacto  valor exacto de la integral (solución analítica)
 */
function tabla_convergencia(f, a, b, exacto, lista = [4, 10, 50, 100, 1000]) {
  return lista.map((n) => {
    const I = trapecio_compuesto(f, a, b, n)
    const errorAbs = Math.abs(exacto - I)                 // |I_exacto - I_trapecio|
    const errorPct = (errorAbs / Math.abs(exacto)) * 100  // error relativo porcentual
    return { n, h: (b - a) / n, I, errorAbs, errorPct }
  })
}

/** Cota teórica del error: |E| <= n·h³/12 · máx|f''(x)| */
const cotaError = (n, h, maxF2) => (n * h ** 3 / 12) * maxF2

// Actividad:  R(t) = 10 + 5·sin(π t/4) + e^(0.15 t),  [0, 12]
//   trapecio_compuesto(R, 0, 12, 4)   // 160.443697  (exacto: 166.396712)`

/* ====================== TEXTO DEL DESARROLLO MANUAL ===================== */

const HOJA_1 = `SESIÓN 12 — INTEGRACIÓN NUMÉRICA: REGLA DEL TRAPECIO COMPUESTO
Estimación del tráfico de red en un servidor web

DATOS DEL PROBLEMA
   Tasa de transferencia:  R(t) = 10 + 5·sen(πt/4) + e^(0.15t)      [Mbps]
   Intervalo:              t ∈ [0, 12] segundos
   Cantidad pedida:        D = ∫₀¹² R(t) dt                          [Megabits]
   Método:                 trapecio compuesto con n = 4 subintervalos

PASO 1: ANCHO DE PASO
   h = (b − a) / n = (12 − 0) / 4 = 3 s

PASO 2: MALLA DE PUNTOS   t_i = a + i·h
   t0 = 0 + 0(3) = 0
   t1 = 0 + 1(3) = 3
   t2 = 0 + 2(3) = 6
   t3 = 0 + 3(3) = 9
   t4 = 0 + 4(3) = 12

PASO 3: VALORES DE R(t_i)
   R(0)  = 10 + 5·sen(0)    + e^0    = 10 + 0 + 1                          = 11.000000
   R(3)  = 10 + 5·sen(3π/4) + e^0.45 = 10 + 3.535534 + 1.568312            = 15.103846
   R(6)  = 10 + 5·sen(3π/2) + e^0.90 = 10 − 5 + 2.459603                   = 7.459603
   R(9)  = 10 + 5·sen(9π/4) + e^1.35 = 10 + 3.535534 + 3.857426            = 17.392959
   R(12) = 10 + 5·sen(3π)   + e^1.80 = 10 + 0 + 6.049647                   = 16.049647
   (la última cifra puede variar por redondeo)

TABLA DE TRABAJO   (c = factor: 1 en los extremos, 2 en los puntos interiores)
    i     t_i       R(t_i)         c      c·R(t_i)
    0      0       11.000000      1      11.000000
    1      3       15.103846      2      30.207692
    2      6        7.459603      2      14.919206
    3      9       17.392959      2      34.785918
    4     12       16.049647      1      16.049647
                                         ----------
                              Σ c·R(t_i) = 106.962463`

const HOJA_2 = `PASO 4: FÓRMULA DEL TRAPECIO COMPUESTO
   ∫ f(x) dx ≈ (h/2) · { f(x0) + 2[ f(x1) + f(x2) + … + f(x_(n−1)) ] + f(xn) }

   Sustitución (n = 4, h = 3):
   I_trapecio = (3/2) · { R(0) + 2[ R(3) + R(6) + R(9) ] + R(12) }
              = 1.5 · { 11 + 2[ 15.103846 + 7.459603 + 17.392959 ] + 16.049647 }
              = 1.5 · { 11 + 2(39.956408) + 16.049647 }
              = 1.5 · { 11 + 79.912816 + 16.049647 }
              = 1.5 · 106.962463
              = 160.443694  ≈ 160.4437 Mb
   (con todos los decimales de la calculadora: 160.443697)

VERIFICACIÓN: SUMA DE LAS ÁREAS DE LOS 4 TRAPECIOS   A_i = (h/2)·[ f(t_(i−1)) + f(t_i) ]
   A1 = 1.5 · (11.000000 + 15.103846) = 39.155769
   A2 = 1.5 · (15.103846 + 7.459603)  = 33.845174
   A3 = 1.5 · (7.459603 + 17.392959)  = 37.278843
   A4 = 1.5 · (17.392959 + 16.049647) = 50.163909
   ΣA_i = 160.443695  ≈ 160.4437 Mb      (coincide con la fórmula compuesta)

VALOR EXACTO (solución analítica)
   D = ∫₀¹² [ 10 + 5·sen(πt/4) + e^(0.15t) ] dt = [ 10t − (20/π)·cos(πt/4) + e^(0.15t)/0.15 ]₀¹²
     = ( 120 + 20/π + e^1.8/0.15 ) − ( −20/π + 1/0.15 )
     = 120 + 40/π + (e^1.8 − 1)/0.15
     = 120 + 12.732395 + 33.664316 = 166.3967 Mb

ERROR DEL TRAPECIO CON n = 4
   Error absoluto   E = |166.3967 − 160.4437| = 5.9530 Mb
   Error relativo   Er = E / 166.3967 × 100 = 3.5776 %

COTA TEÓRICA DEL ERROR   |E| ≤ n·h³/12 · máx|R''(t)|
   R'(t)  = 5(π/4)·cos(πt/4) + 0.15·e^(0.15t)
   R''(t) = −5(π/4)²·sen(πt/4) + 0.0225·e^(0.15t)         (5(π/4)² = 3.084251)
   máx|R''(t)| en [0,12] ≈ 3.1396   (cerca de t = 6, donde sen = −1)
   |E| ≤ 4·(3)³/12 · 3.1396 = 9 · 3.1396 = 28.2565
   El error real (5.9530) cumple la cota; la cota es conservadora.`

const HOJA_3 = `ANÁLISIS DE CONVERGENCIA: trapecio compuesto para distintos n  (valor exacto D = 166.396712 Mb)

     n      h          I_trapecio        |Error abs.|     % de error
      4   3           160.443697     5.953015       3.577604 %
     10   1.2         165.530824     0.865888       0.520376 %
     50   0.24        166.362626     0.034086       0.020485 %
    100   0.12        166.388195     0.008517       0.005119 %
   1000   0.012       166.396627     8.52e-05       0.000051 %

OBSERVACIONES
   • A medida que n crece, I_trapecio tiende al valor exacto (166.396712 Mb) y el error disminuye.
   • El error es proporcional a h²: al multiplicar n por 10 (h se divide entre 10) el error se reduce
     unas 100 veces. Ejemplo: de n = 10 a n = 100 el error pasa de 0.865888 a 0.008517 (÷ 101.7).
   • Con n = 4 se subestima D en 3.58 %; con n = 1000 el error relativo es de apenas 0.000051 %.
   • Interpretación: durante los 12 s se transfieren aproximadamente 166.4 Megabits.`

const HOJAS = [
  { id: 1, titulo: 'Hoja 1 — Datos, ancho de paso h, malla de puntos y valores R(tᵢ)', texto: HOJA_1 },
  { id: 2, titulo: 'Hoja 2 — Trapecio compuesto, valor exacto, error y cota teórica', texto: HOJA_2 },
  { id: 3, titulo: 'Hoja 3 — Análisis de convergencia (n = 4, 10, 50, 100, 1000)', texto: HOJA_3 },
]
const MANUAL_TODO = HOJAS.map((h) => h.texto).join('\n\n──────────── (nueva hoja) ────────────\n\n')

/* ============================ PIEZAS DE INTERFAZ ========================= */

const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/40 p-5'

function Seccion({ num, titulo, children, nota }) {
  return (
    <div className={CARD}>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-xs font-mono text-rose-400/80">{String(num).padStart(2, '0')}</span>
        <h2 className="font-semibold text-slate-100">{titulo}</h2>
      </div>
      {nota && <p className="text-xs text-slate-500 mb-4 ml-7">{nota}</p>}
      <div className={nota ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }
const inputCls =
  'w-28 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-sm focus:outline-none focus:border-rose-500/60'
const btnCls = 'text-xs px-3 py-1.5 rounded-full border border-rose-500/30 text-rose-300 hover:bg-rose-500/10'

async function copiarTexto(texto, clave, setCopiado) {
  try {
    await navigator.clipboard.writeText(texto)
    setCopiado(clave)
  } catch {
    setCopiado('error')
  }
  setTimeout(() => setCopiado(null), 1800)
}

/* ============================ COMPONENTE PRINCIPAL ======================= */

export default function PracticaTrapecio() {
  const [presetId, setPresetId] = useState('trafico')
  const [expr, setExpr] = useState(PRESETS[0].expr)
  const [aStr, setAStr] = useState(String(PRESETS[0].a))
  const [bStr, setBStr] = useState(String(PRESETS[0].b))
  const [nStr, setNStr] = useState(String(PRESETS[0].n))
  const [listaN, setListaN] = useState('4, 10, 50, 100, 1000')
  const [modoRect, setModoRect] = useState('medio')
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(null)
  const [copiado, setCopiado] = useState(null)

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[PRESETS.length - 1]
  const v = preset.v
  const { f, error: errFun } = crearFuncion(expr)
  const a = Number(aStr)
  const b = Number(bStr)
  const n = Number(nStr)
  const camposOk = aStr !== '' && bStr !== '' && nStr !== '' && Number.isFinite(a) && Number.isFinite(b) && b > a && Number.isInteger(n) && n >= 1 && n <= 100000
  const funcionOk = !!f && camposOk && [a, b, (a + b) / 2].every((x) => Number.isFinite(f(x)))
  const datosOk = funcionOk

  const esDefecto = expr === preset.expr && a === preset.a && b === preset.b && n === preset.n

  /* ------- cálculos principales ------- */
  const h = datosOk ? (b - a) / n : NaN
  const nodos = datosOk ? Array.from({ length: n + 1 }, (_, i) => ({ i, t: a + i * h })) : []
  const vals = datosOk ? nodos.map((p) => f(p.t)) : []
  const factor = (i) => (i === 0 || i === n ? 1 : 2)
  const I = datosOk ? trapecio_compuesto(f, a, b, n) : NaN
  const sumaExtremos = datosOk ? vals[0] + vals[n] : NaN
  const sumaInterior = datosOk ? vals.slice(1, n).reduce((s, x) => s + x, 0) : NaN
  const sumaTotal = sumaExtremos + 2 * sumaInterior
  const areas = datosOk && n <= 20 ? Array.from({ length: n }, (_, i) => (h / 2) * (vals[i] + vals[i + 1])) : []

  const exacto = datosOk ? (preset.F ? preset.F(b) - preset.F(a) : simpsonReferencia(f, a, b)) : NaN
  const errorAbs = Math.abs(exacto - I)
  const errorPct = exacto !== 0 ? (errorAbs / Math.abs(exacto)) * 100 : NaN
  const maxF2 = datosOk ? maxSegundaDerivada(f, a, b) : NaN
  const cota = datosOk ? (n * h ** 3 / 12) * maxF2 : NaN
  const coincideEsperado = datosOk && esDefecto && preset.esperado != null ? Math.abs(I - preset.esperado) < 5e-4 : null

  /* convergencia */
  const listaNums = listaN.split(/[ ,;]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 1000000).slice(0, 10)
  const filasConv = datosOk
    ? listaNums.map((nn, k) => {
        const Inn = trapecio_compuesto(f, a, b, nn)
        const ea = Math.abs(exacto - Inn)
        return { nn, hh: (b - a) / nn, Inn, ea, ep: exacto !== 0 ? (ea / Math.abs(exacto)) * 100 : NaN, cota: (nn * ((b - a) / nn) ** 3 / 12) * maxF2, k }
      })
    : []

  /* rectángulos */
  const Sn = datosOk ? rectangulos(f, a, b, n, modoRect) : NaN
  const errRectAbs = Math.abs(exacto - Sn)
  const errRectPct = exacto !== 0 ? (errRectAbs / Math.abs(exacto)) * 100 : NaN
  const filasRect = datosOk && n <= 12
    ? Array.from({ length: n }, (_, k) => {
        const i = k + 1
        const c = modoRect === 'izq' ? a + (i - 1) * h : modoRect === 'der' ? a + i * h : a + (i - 0.5) * h
        return { i, c, fc: f(c), area: h * f(c) }
      })
    : []
  const rectEsperadoOk = datosOk && esDefecto && preset.esperadoRect != null && modoRect === 'medio'
    ? Math.abs(Sn - preset.esperadoRect) < 5e-4 : null

  /* gráfica: curva y poligonal de trapecios sobre una misma malla de x */
  const curva = datosOk
    ? Array.from({ length: 401 }, (_, k) => {
        const x = a + ((b - a) * k) / 400
        const idx = Math.min(Math.floor((x - a) / h), n - 1)
        const x0 = a + idx * h
        const y0 = f(x0)
        const y1 = f(x0 + h)
        return { x, fx: f(x), trap: y0 + ((y1 - y0) * (x - x0)) / h }
      })
    : []
  const puntosNodos = datosOk && n <= 40 ? nodos.map((p, i) => ({ x: p.t, y: vals[i] })) : []

  const vis = indicesVisibles(n + 1)
  const unidadI = preset.unidadI ? ` ${preset.unidadI}` : ''

  /* ------- acciones ------- */
  const cargarPreset = (id) => {
    const p = PRESETS.find((q) => q.id === id)
    setPresetId(id); setExpr(p.expr); setAStr(String(p.a)); setBStr(String(p.b)); setNStr(String(p.n))
    setModoRect('medio')
  }
  const editarExpr = (val) => { setExpr(val); if (presetId !== 'custom') setPresetId('custom') }
  const estadoCopiado = (clave, etiqueta) =>
    copiado === clave ? '✓ copiado' : copiado === 'error' ? 'no se pudo copiar' : etiqueta

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-rose-400/80 mb-1">
            Métodos Numéricos · Sesión 12 · Integración numérica
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Estimación del Tráfico de Red — Regla del Trapecio Compuesto
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            El ancho de banda R(t) de un microservicio crítico fluctuó durante 12 s. La cantidad total de datos
            transferidos es D = ∫₀¹² R(t) dt, con R(t) = 10 + 5·sen(πt/4) + e^(0.15t) Mbps. Se aproxima con la
            regla del trapecio compuesto y se estudia cómo converge al valor exacto al aumentar n.
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada de datos ------------------------- */}
        <Seccion num={1} titulo="Entrada de datos — función, límites y número de subintervalos"
          nota="Por defecto: los datos de la actividad (n = 4). También puedes cargar los ejemplos de clase o escribir tu propia función">
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Cargar ejemplo:</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((q) => (
                <button key={q.id} onClick={() => cargarPreset(q.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${presetId === q.id ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60'}`}>
                  {q.etiqueta}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {preset.nota}
              {coincideEsperado === true && <span className="text-emerald-400"> ✓ El programa reproduce el valor esperado ({preset.esperado}).</span>}
              {coincideEsperado === false && <span className="text-rose-400"> ✗ No coincide con el valor esperado ({preset.esperado}).</span>}
            </p>
          </div>
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="space-y-3">
              <label className="text-xs text-slate-400 block">
                f({v}) =
                <input type="text" value={expr} onChange={(e) => editarExpr(e.target.value)} spellCheck={false}
                  className="mt-1 block w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-100 text-sm focus:outline-none focus:border-rose-500/60" />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="text-xs text-slate-400">a (límite inferior)
                  <input type="number" value={aStr} onChange={(e) => setAStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
                <label className="text-xs text-slate-400">b (límite superior)
                  <input type="number" value={bStr} onChange={(e) => setBStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
                <label className="text-xs text-slate-400">n (subintervalos)
                  <input type="number" min="1" value={nStr} onChange={(e) => setNStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
              </div>
              {errFun && <p className="text-xs text-rose-400">{errFun}</p>}
              {!errFun && !camposOk && <p className="text-xs text-rose-400">Revisa los datos: a &lt; b y n entero entre 1 y 100 000.</p>}
              {!errFun && camposOk && !funcionOk && <p className="text-xs text-rose-400">La función no está definida (o no es finita) en el intervalo.</p>}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs font-mono text-slate-300 space-y-1">
              <div>a = {fmt(a)} · b = {fmt(b)} · n = {Number.isFinite(n) ? n : '—'}</div>
              <div className="text-rose-300">h = (b − a)/n = {datosOk ? `(${fmt(b)} − ${fmt(a)})/${n} = ${fmt(h)}` : '—'}</div>
            </div>
          </div>
        </Seccion>

        {!datosOk && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Corrige los datos de la sección 1 para calcular.
          </div>
        )}

        {datosOk && (
          <>
            {/* ------------------- 2. Paso 1: h y malla ------------------- */}
            <Seccion num={2} titulo="Paso 1 — Ancho de paso h y malla de puntos tᵢ"
              nota="h = (b − a)/n  ·  tᵢ = a + i·h,  i = 0, 1, …, n  (n + 1 abscisas igualmente espaciadas)">
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 font-mono text-sm text-slate-100 mb-4">
                h = ({fmt(b)} − {fmt(a)}) / {n} = <span className="text-sky-300">{fmt(h)}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                {vis.map((i, k) => i === null
                  ? <div key={`e${k}`} className="text-slate-500">⋮</div>
                  : <div key={i} className="whitespace-nowrap">{v}{sub(i)} = {fmt(a)} + {i}({fmt(h)}) = <span className="text-sky-300">{fmt(nodos[i].t)}</span></div>)}
              </div>
            </Seccion>

            {/* ------------------- 3. Paso 2: tabla y fórmula ------------------- */}
            <Seccion num={3} titulo="Paso 2 — Valores f(tᵢ), factores c y aplicación de la fórmula"
              nota="c = 1 en los extremos y 2 en los puntos interiores (tabla igual a la de la pizarra y el Excel de clase)">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">i</th>
                      <th className="text-right font-medium px-3 py-2">{v}ᵢ</th>
                      <th className="text-right font-medium px-3 py-2">f({v}ᵢ){preset.unidadY ? ` (${preset.unidadY})` : ''}</th>
                      <th className="text-right font-medium px-3 py-2">c</th>
                      <th className="text-right font-medium px-3 py-2">c·f({v}ᵢ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vis.map((i, k) => i === null ? (
                      <tr key={`e${k}`} className="border-t border-slate-900"><td colSpan={5} className="px-3 py-1.5 text-center text-slate-500">⋮</td></tr>
                    ) : (
                      <tr key={i} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{i}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(nodos[i].t)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(vals[i])}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{factor(i)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(factor(i) * vals[i])}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-800 bg-slate-900/60">
                      <td colSpan={4} className="px-3 py-2 font-mono text-right text-slate-300">Σ c·f({v}ᵢ) =</td>
                      <td className="px-3 py-2 font-mono text-right text-slate-100">{fix(sumaTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                <div className="whitespace-nowrap text-slate-500">I ≈ (h/2)·{'{'} f(x₀) + 2[f(x₁) + … + f(xₙ₋₁)] + f(xₙ) {'}'}</div>
                <div className="whitespace-nowrap">f(x₀) + f(xₙ) = {fix(vals[0])} + {fix(vals[n])} = {fix(sumaExtremos)}</div>
                <div className="whitespace-nowrap">2·[Σ interiores] = 2·({n > 1 ? fix(sumaInterior) : '0'}) = {fix(2 * sumaInterior)}</div>
                <div className="whitespace-nowrap">I_trapecio = ({fmt(h)}/2)·{fix(sumaTotal)} = <span className="text-emerald-300 text-sm">{fix(I)}{unidadI}</span></div>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 inline-block">
                <div className="text-xs text-emerald-300/80">Resultado del trapecio compuesto (n = {n})</div>
                <div className="text-2xl font-bold font-mono text-emerald-200">{fix(I)}{unidadI}</div>
              </div>
            </Seccion>

            {/* ------------------- 4. Verificación por áreas ------------------- */}
            <Seccion num={4} titulo="Verificación — suma de las áreas de los trapecios individuales"
              nota="Aᵢ = (h/2)·[f(tᵢ₋₁) + f(tᵢ)]: la integral es la suma de las integrales de cada subintervalo">
              {areas.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    {areas.map((A, k) => (
                      <div key={k} className="whitespace-nowrap">
                        A{sub(k + 1)} = ({fmt(h)}/2)·({fix(vals[k])} + {fix(vals[k + 1])}) = <span className="text-sky-300">{fix(A)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="font-mono text-sm text-slate-200">
                    ΣAᵢ = {fix(areas.reduce((s, x) => s + x, 0))} <span className="text-slate-500">(coincide con la fórmula compuesta: {fix(I)})</span>
                  </div>
                </div>
              ) : <p className="text-sm text-slate-500">Con n &gt; 20 se omite el detalle por trapecio (el resultado es el mismo).</p>}
            </Seccion>

            {/* ------------------- 5. Exacto, error y cota ------------------- */}
            <Seccion num={5} titulo="Valor exacto, error real y cota teórica del error"
              nota="Er = |I_exacto − I_trapecio| / I_exacto × 100  ·  cota: |E| ≤ n·h³/12 · máx|f''(x)|">
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div className="text-xs text-slate-400">{preset.analitica ? 'Solución analítica' : 'Valor de referencia numérico (Simpson, n = 200 000)'}</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    {preset.analitica && preset.analitica.map((l, k) => <div key={k} className="whitespace-nowrap">{l}</div>)}
                    <div className="text-sky-300 whitespace-nowrap">I_exacto = {fix(exacto)}{unidadI}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">Error absoluto real</div>
                    <div className="font-mono text-sm text-slate-100">{fix(errorAbs)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">Error relativo (%)</div>
                    <div className="font-mono text-sm text-slate-100">{fix(errorPct)} %</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">máx|f''| (estimado)</div>
                    <div className="font-mono text-sm text-slate-100">{fix(maxF2, 4)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">Cota n·h³/12·máx|f''|</div>
                    <div className="font-mono text-sm text-slate-100">{fix(cota, 4)}</div>
                  </div>
                </div>
              </div>
              <div className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${errorAbs <= cota * (1 + 1e-6) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                {errorAbs <= cota * (1 + 1e-6)
                  ? `El error real (${fix(errorAbs, 6)}) cumple la cota teórica (${fix(cota, 4)}); la cota es conservadora.`
                  : 'El error real supera la cota estimada (puede deberse a la estimación numérica de f\'\').'}
              </div>
            </Seccion>

            {/* ------------------- 6. Gráfica ------------------- */}
            <Seccion num={6} titulo="Gráfica — función y poligonal de trapecios"
              nota="La zona sombreada es la suma de las áreas trapezoidales (interpolación lineal entre los puntos de la malla)">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={curva} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={[a, b]} stroke="#64748b"
                    label={{ value: v, position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis type="number" stroke="#64748b" domain={[(dataMin) => Math.min(0, Math.floor(dataMin)), 'auto']}
                    label={{ value: `f(${v})`, angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                    formatter={(val) => Number(val).toFixed(4)} labelFormatter={(val) => `${v} = ${Number(val).toFixed(4)}`} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Area type="linear" dataKey="trap" name={`trapecios (n = ${n})`} stroke="#fb7185" strokeWidth={1.5} fill="#fb7185" fillOpacity={0.18} isAnimationActive={false} dot={false} />
                  <Line type="monotone" dataKey="fx" name={`f(${v})`} stroke="#38bdf8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  {puntosNodos.length > 0 && <Scatter data={puntosNodos} dataKey="y" name={`nodos ${v}ᵢ`} fill="#facc15" shape="circle" />}
                  {n <= 40 && nodos.map((p) => <ReferenceLine key={p.i} x={p.t} stroke="#64748b" strokeDasharray="3 3" opacity={0.5} />)}
                </ComposedChart>
              </ResponsiveContainer>
            </Seccion>

            {/* ------------------- 7. Convergencia ------------------- */}
            <Seccion num={7} titulo="Análisis de convergencia — valor calculado, error absoluto real y % de error"
              nota="Requisito de la actividad: n ∈ {4, 10, 50, 100, 1000} (puedes editar la lista)">
              <label className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-3">
                Valores de n:
                <input type="text" value={listaN} onChange={(e) => setListaN(e.target.value)} spellCheck={false}
                  className="w-64 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-xs focus:outline-none focus:border-rose-500/60" />
                <button onClick={() => setListaN('4, 10, 50, 100, 1000')} className={btnCls}>restablecer</button>
              </label>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-right font-medium px-3 py-2">n</th>
                      <th className="text-right font-medium px-3 py-2">h</th>
                      <th className="text-right font-medium px-3 py-2">I_trapecio</th>
                      <th className="text-right font-medium px-3 py-2">Error absoluto real</th>
                      <th className="text-right font-medium px-3 py-2">% de error</th>
                      <th className="text-right font-medium px-3 py-2">E(prev)/E</th>
                      <th className="text-right font-medium px-3 py-2">Cota teórica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConv.map((r, k) => (
                      <tr key={k} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{r.nn}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">{fmt(r.hh, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(r.Inn)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(r.ea)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(r.ep)} %</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">{k > 0 && r.ea > 0 ? fmt(filasConv[k - 1].ea / r.ea, 2) : '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-500">{fix(r.cota, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                El error del trapecio compuesto es proporcional a h²: al multiplicar n por 10 el error baja unas 100 veces
                (pendiente −2 en la gráfica logarítmica). Valor exacto de referencia: {fix(exacto)}.
              </p>
              {filasConv.length > 1 && (
                <div className="mt-4">
                  <div className="text-sm text-slate-300 mb-2">Error absoluto vs. n (escala logarítmica)</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={filasConv.map((r) => ({ n: r.nn, error: Math.max(r.ea, 1e-16) })).sort((p, q) => p.n - q.n)} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="n" scale="log" domain={['auto', 'auto']} stroke="#64748b"
                        label={{ value: 'n (subintervalos)', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                      <YAxis scale="log" domain={['auto', 'auto']} stroke="#64748b" tickFormatter={(val) => Number(val).toExponential(0)} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }} formatter={(val) => Number(val).toExponential(3)} labelFormatter={(val) => `n = ${val}`} />
                      <Line type="monotone" dataKey="error" name="error absoluto" stroke="#fb7185" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Seccion>

            {/* ------------------- 8. Rectángulos ------------------- */}
            <Seccion num={8} titulo="Comparación con la regla de los rectángulos"
              nota="Sₙ = Σ h·f(cᵢ), h = (b − a)/n  — se compara con el trapecio usando el mismo n">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-slate-400">Punto cᵢ de cada rectángulo:</span>
                {[['medio', 'punto medio'], ['izq', 'extremo izquierdo'], ['der', 'extremo derecho']].map(([id, et]) => (
                  <button key={id} onClick={() => setModoRect(id)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${modoRect === id ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60'}`}>
                    {et}
                  </button>
                ))}
              </div>
              {filasRect.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto mb-3">
                  {filasRect.map((r) => (
                    <div key={r.i} className="whitespace-nowrap">
                      A{sub(r.i)} = f({fmt(r.c)})·h = {fix(r.fc)} · {fmt(h)} = <span className="text-sky-300">{fix(r.area)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs text-slate-500">Rectángulos Sₙ (n = {n})</div>
                  <div className="font-mono text-lg text-slate-100">{fix(Sn)}</div>
                  <div className="font-mono text-xs text-slate-400">error absoluto {fix(errRectAbs)} · {fix(errRectPct)} %</div>
                  {rectEsperadoOk === true && <div className="text-xs text-emerald-400 mt-1">✓ coincide con la pizarra ({preset.esperadoRect})</div>}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs text-slate-500">Trapecio compuesto (n = {n})</div>
                  <div className="font-mono text-lg text-slate-100">{fix(I)}</div>
                  <div className="font-mono text-xs text-slate-400">error absoluto {fix(errorAbs)} · {fix(errorPct)} %</div>
                </div>
              </div>
            </Seccion>

            {/* ------------------- 9. Código ------------------- */}
            <Seccion num={9} titulo="Código fuente documentado"
              nota="trapecio_compuesto(f, a, b, n) y tabla_convergencia(...) — las mismas funciones que usa esta aplicación">
              <button onClick={() => setMostrarCodigo((x) => !x)} className={`${btnCls} mb-3`}>
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
          </>
        )}

        {/* --------------- 10. Desarrollo manual (hoja bond) --------------- */}
        <Seccion num={datosOk ? 10 : 2} titulo="Desarrollo manual completo — para copiar a hoja bond / Word"
          nota="Construcción manual teórica con los datos exactos de la actividad (n = 4), dividida en 3 hojas (cada una con su botón de copiar)">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => copiarTexto(MANUAL_TODO, 'todo', setCopiado)}
              className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              {estadoCopiado('todo', 'copiar las 3 hojas')}
            </button>
            <button onClick={() => setHojaAbierta(hojaAbierta === 'todas' ? null : 'todas')} className={btnCls}>
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
                        className="text-xs px-3 py-1 rounded-full border border-rose-500/30 text-rose-300 hover:bg-rose-500/10">{abierta ? 'ocultar' : 'ver'}</button>
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
          <p className="text-xs text-slate-500 mt-3">
            Nota: este texto usa siempre los datos exactos de la actividad (R(t), [0, 12], n = 4 y la lista de n pedida),
            aunque edites los valores de la sección 1.
          </p>
        </Seccion>

      </div>
    </div>
  )
}
