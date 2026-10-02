import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceDot, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 8 · INTERPOLACIÓN
   Optimización de Latencia en un Clúster de Microservicios — Polinomio de
   Lagrange de grado 3 (4 nodos)

   Contexto: el consumo de memoria RAM x (GB) de un microservicio impacta
   la latencia media y (ms) de las peticiones HTTP. Se midieron 4 puntos
   durante pruebas de carga (stress testing):
     x0=2, y0=150   x1=4, y1=85   x2=8, y2=50   x3=12, y3=70
   Se pide estimar la latencia para x = 6 GB mediante el polinomio
   interpolador P3(x) construido con la fórmula de Lagrange.

   Requisitos del enunciado (PDF de la actividad, 2 partes):
     Parte A — Desarrollo teórico y manual (50%):
       1) Obtener analíticamente L0(x), L1(x), L2(x), L3(x) simplificados.
       2) Formular P3(x) = Σ yk·Lk(x) y simplificar a la forma estándar
          P3(x) = a3x³ + a2x² + a1x + a0.
       3) Evaluar P3(6) mostrando ordenadamente los pasos de reemplazo.
     Parte B — Aplicativo de software (50%):
       1) Entrada dinámica de los 4 nodos (xi, yi) y del punto xeval.
       2) Motor de cálculo: algoritmo de Lagrange con bucles anidados O(n²).
       3) Salida: valor interpolado P3(xeval), gráfico de los 4 puntos +
          curva continua en [2,12], y resaltar el punto interpolado.
   ========================================================================= */

/* ============================ DATOS POR DEFECTO ========================= */

const NODOS_DEFECTO = [
  { x: 2, y: 150 },
  { x: 4, y: 85 },
  { x: 8, y: 50 },
  { x: 12, y: 70 },
]
const X_EVAL_DEFECTO = 6

/* ============================== UTILIDADES =============================== */

const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
const sub = (n) => String(n).split('').map((d) => SUBS[+d] ?? d).join('')
const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵' }
const sup = (n) => String(n).split('').map((d) => SUPS[+d] ?? d).join('')

function fmt(v, d = 4) {
  if (!Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(d))
  return Object.is(r, -0) ? '0' : r.toString()
}
const fix = (v, d = 6) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const signStr = (v) => (v < 0 ? '−' : '+')

/* ------------------------------------------------------------------------
   Álgebra polinómica mínima: los polinomios se representan como arreglos
   de coeficientes en orden ASCENDENTE: [a0, a1, a2, ...] → a0 + a1 x + ...
   ------------------------------------------------------------------------ */
function polyMul(a, b) {
  const res = Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) res[i + j] += a[i] * b[j]
  }
  return res
}

/* Construye, para el nodo k, el numerador (producto de (x - xi), i≠k) y el
   denominador escalar (producto de (xk - xi), i≠k). */
function basisNumDen(xs, k) {
  let num = [1]
  let den = 1
  xs.forEach((xi, i) => {
    if (i === k) return
    num = polyMul(num, [-xi, 1]) // factor (x - xi)
    den *= xs[k] - xi
  })
  return { num, den }
}

/* Construye P(x) = Σ yk·Lk(x) como coeficientes ascendentes, y de paso cada
   Lk(x) (coeficientes ascendentes) junto con su numerador/denominador. */
function construirInterpolante(nodos) {
  const xs = nodos.map((n) => n.x)
  const n = nodos.length
  const P = Array(n).fill(0)
  const basis = []
  for (let k = 0; k < n; k++) {
    const { num, den } = basisNumDen(xs, k)
    const Lk = num.map((c) => c / den)
    basis.push({ k, num, den, Lk })
    for (let i = 0; i < n; i++) P[i] += nodos[k].y * Lk[i]
  }
  return { P, basis }
}

const evalPoly = (coefAsc, x) => coefAsc.reduce((acc, c, i) => acc + c * x ** i, 0)

/* ------------------------------------------------------------------------
   MOTOR DE CÁLCULO — Algoritmo de Lagrange con bucles anidados O(n²)
   (idéntico al pseudocódigo de la guía teórica: para cada k, se recorre i,
   acumulando los productos del numerador y del denominador).
   Devuelve, además del resultado, el detalle de cada término para mostrar
   "de manera ordenada todos los pasos de reemplazo numérico".
   ------------------------------------------------------------------------ */
function lagrangeDetallado(nodos, xEval) {
  const n = nodos.length
  const terminos = []
  let total = 0
  for (let k = 0; k < n; k++) {           // bucle externo: k = 0..n-1
    let numProd = 1
    let denProd = 1
    const factores = []
    for (let i = 0; i < n; i++) {         // bucle interno: i = 0..n-1
      if (i === k) continue
      const numF = xEval - nodos[i].x
      const denF = nodos[k].x - nodos[i].x
      factores.push({ i, numF, denF })
      numProd *= numF
      denProd *= denF
    }
    const Lk = denProd !== 0 ? numProd / denProd : NaN
    const contrib = nodos[k].y * Lk
    total += contrib
    terminos.push({ k, factores, numProd, denProd, Lk, contrib })
  }
  return { terminos, total }
}

/* Texto de un polinomio ascendente → notación descendente a3x³+a2x²+a1x+a0 */
function formatoPoly(coefAsc, d = 6) {
  const n = coefAsc.length
  let out = ''
  for (let i = n - 1; i >= 0; i--) {
    const c = coefAsc[i]
    if (Math.abs(c) < 1e-12 && n > 1) continue
    const mag = fix(Math.abs(c), d)
    const varPart = i === 0 ? '' : i === 1 ? 'x' : `x${sup(i)}`
    if (out === '') out += `${c < 0 ? '−' : ''}${mag}${varPart}`
    else out += ` ${signStr(c)} ${mag}${varPart}`
  }
  return out || '0'
}

const CODIGO_FUENTE = `/**
 * Interpolación de Lagrange — motor de cálculo O(n²)
 * @param {{x:number,y:number}[]} nodos   los n nodos (xi, yi)
 * @param {number} xEval                  punto donde se evalúa P(x)
 * @returns {{ terminos, total }}         detalle por término y P(xEval)
 */
function lagrange(nodos, xEval) {
  const n = nodos.length
  const terminos = []
  let total = 0

  for (let k = 0; k < n; k++) {            // bucle externo: nodo k
    let numProd = 1
    let denProd = 1

    for (let i = 0; i < n; i++) {          // bucle interno: i != k
      if (i === k) continue
      numProd *= (xEval - nodos[i].x)      // (x - xi)
      denProd *= (nodos[k].x - nodos[i].x) // (xk - xi)
    }

    const Lk = numProd / denProd           // L_k(xEval)
    const contrib = nodos[k].y * Lk        // y_k * L_k(xEval)
    total += contrib
    terminos.push({ k, Lk, contrib })
  }
  return { terminos, total }               // total = P(xEval)
}`


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

async function copiarTexto(texto, setCopiado) {
  try {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  } catch {
    setCopiado('error')
    setTimeout(() => setCopiado(false), 1800)
  }
}

/* ============================ COMPONENTE PRINCIPAL ======================= */

export default function PracticaLagrange() {
  const [nodos, setNodos] = useState(NODOS_DEFECTO)
  const [xEvalStr, setXEvalStr] = useState(String(X_EVAL_DEFECTO))
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [mostrarManual, setMostrarManual] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [kDetalle, setKDetalle] = useState(0)

  const xEval = Number(xEvalStr)
  const xs = nodos.map((n) => n.x)
  const xsValidos = new Set(xs).size === xs.length && xs.every(Number.isFinite)
  const ysValidos = nodos.every((n) => Number.isFinite(n.y))

  const { P, basis } = useMemo(
    () => (xsValidos && ysValidos ? construirInterpolante(nodos) : { P: null, basis: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(nodos)]
  )

  const detalle = useMemo(
    () => (xsValidos && ysValidos && Number.isFinite(xEval) ? lagrangeDetallado(nodos, xEval) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(nodos), xEvalStr]
  )

  const xmin = Math.min(...xs)
  const xmax = Math.max(...xs)
  const curva = useMemo(() => {
    if (!P) return []
    const N = 160
    return Array.from({ length: N + 1 }, (_, i) => {
      const x = xmin + ((xmax - xmin) * i) / N
      return { x, y: evalPoly(P, x) }
    })
  }, [P, xmin, xmax])

  const puntosNodos = nodos.map((n) => ({ x: n.x, y: n.y }))
  const resultado = detalle?.total
  const kDet = Math.min(Math.max(kDetalle, 0), nodos.length - 1)

  const actualizarNodo = (i, campo, valor) => {
    setNodos((prev) => prev.map((n, idx) => (idx === i ? { ...n, [campo]: valor === '' ? '' : Number(valor) } : n)))
  }
  const restablecer = () => { setNodos(NODOS_DEFECTO); setXEvalStr(String(X_EVAL_DEFECTO)) }

  const MANUAL_TEXTO = `SESIÓN 8 — INTERPOLACIÓN
Método de Lagrange · Polinomio de grado 3 (4 nodos)

CONTEXTO
Optimización de latencia en un clúster de microservicios. El consumo de
memoria RAM x (GB) de un microservicio impacta la latencia media y (ms)
de las peticiones HTTP. Durante las pruebas de carga se registraron los
siguientes 4 puntos:

   k    x_k (GB)    y_k = f(x_k) (ms)
   0       2              150
   1       4               85
   2       8               50
   3      12               70

Se pide estimar la latencia predicha cuando el contenedor se escala a
x = 6 GB de RAM.

PARTE A — DESARROLLO TEÓRICO Y MANUAL

1) CONSTRUCCIÓN DE LOS POLINOMIOS BASE DE LAGRANGE
Fórmula general:            3
                    L_k(x) = ∏  (x − x_i) / (x_k − x_i),   k ∈ {0,1,2,3}
                            i=0
                            i≠k

1.1) L0(x)  (k = 0, se excluye i = 0)
  Denominador: (x0−x1)(x0−x2)(x0−x3) = (2−4)(2−8)(2−12) = (−2)(−6)(−10) = −120
  Numerador:   (x−4)(x−8)(x−12)
     (x−4)(x−8)       = x² − 12x + 32
     (x²−12x+32)(x−12) = x³ − 24x² + 176x − 384
  L0(x) = (x³ − 24x² + 176x − 384) / (−120)
  L0(x) = −(1/120)x³ + (1/5)x² − (22/15)x + (16/5)
  L0(x) ≈ −0.008333 x³ + 0.2 x² − 1.466667 x + 3.2

1.2) L1(x)  (k = 1, se excluye i = 1)
  Denominador: (x1−x0)(x1−x2)(x1−x3) = (4−2)(4−8)(4−12) = (2)(−4)(−8) = 64
  Numerador:   (x−2)(x−8)(x−12)
     (x−2)(x−8)        = x² − 10x + 16
     (x²−10x+16)(x−12) = x³ − 22x² + 136x − 192
  L1(x) = (x³ − 22x² + 136x − 192) / 64
  L1(x) = (1/64)x³ − (11/32)x² + (17/8)x − 3
  L1(x) ≈ 0.015625 x³ − 0.34375 x² + 2.125 x − 3

1.3) L2(x)  (k = 2, se excluye i = 2)
  Denominador: (x2−x0)(x2−x1)(x2−x3) = (8−2)(8−4)(8−12) = (6)(4)(−4) = −96
  Numerador:   (x−2)(x−4)(x−12)
     (x−2)(x−4)        = x² − 6x + 8
     (x²−6x+8)(x−12)   = x³ − 18x² + 80x − 96
  L2(x) = (x³ − 18x² + 80x − 96) / (−96)
  L2(x) = −(1/96)x³ + (3/16)x² − (5/6)x + 1
  L2(x) ≈ −0.010417 x³ + 0.1875 x² − 0.833333 x + 1

1.4) L3(x)  (k = 3, se excluye i = 3)
  Denominador: (x3−x0)(x3−x1)(x3−x2) = (12−2)(12−4)(12−8) = (10)(8)(4) = 320
  Numerador:   (x−2)(x−4)(x−8)
     (x−2)(x−4)        = x² − 6x + 8
     (x²−6x+8)(x−8)    = x³ − 14x² + 56x − 64
  L3(x) = (x³ − 14x² + 56x − 64) / 320
  L3(x) = (1/320)x³ − (7/160)x² + (7/40)x − (1/5)
  L3(x) ≈ 0.003125 x³ − 0.04375 x² + 0.175 x − 0.2

2) FORMULACIÓN DEL POLINOMIO INTERPOLADOR P3(x)
                   3
         P3(x) = Σ  y_k · L_k(x) = y0 L0(x) + y1 L1(x) + y2 L2(x) + y3 L3(x)
                  k=0

  P3(x) = 150·L0(x) + 85·L1(x) + 50·L2(x) + 70·L3(x)

  Suma de coeficientes (por potencia de x), con factor yk aplicado a cada Lk:

   x³:  150(−1/120) + 85(1/64) + 50(−1/96) + 70(1/320) = −215/960 = −43/192
   x²:  150(1/5)     + 85(−11/32) + 50(3/16) + 70(−7/160)  =  6810/960 = 227/32
   x¹:  150(−22/15)  + 85(17/8)   + 50(−5/6) + 70(7/40)    = −66040/960 = −1651/24
   x⁰:  150(16/5)    + 85(−3)     + 50(1)    + 70(−1/5)    = 250560/960 = 261

  FORMA ESTÁNDAR (forma exacta en fracciones):
    P3(x) = −(43/192) x³ + (227/32) x² − (1651/24) x + 261

  FORMA ESTÁNDAR (decimal, 6 cifras):
    P3(x) = −0.223958 x³ + 7.093750 x² − 68.791667 x + 261.000000

3) ESTIMACIÓN Y EVALUACIÓN: P3(6)
Sustitución numérica ordenada, término por término (x = 6):

  Término k=0 (y0 = 150):
    numerador:   (6−4)(6−8)(6−12)   = (2)(−2)(−6)   = 24
    denominador: (2−4)(2−8)(2−12)   = (−2)(−6)(−10) = −120
    L0(6) = 24 / (−120) = −0.2
    contribución: 150 × (−0.2) = −30

  Término k=1 (y1 = 85):
    numerador:   (6−2)(6−8)(6−12)   = (4)(−2)(−6) = 48
    denominador: (4−2)(4−8)(4−12)   = (2)(−4)(−8) = 64
    L1(6) = 48 / 64 = 0.75
    contribución: 85 × 0.75 = 63.75

  Término k=2 (y2 = 50):
    numerador:   (6−2)(6−4)(6−12)   = (4)(2)(−6) = −48
    denominador: (8−2)(8−4)(8−12)   = (6)(4)(−4) = −96
    L2(6) = −48 / (−96) = 0.5
    contribución: 50 × 0.5 = 25

  Término k=3 (y3 = 70):
    numerador:   (6−2)(6−4)(6−8)    = (4)(2)(−2) = −16
    denominador: (12−2)(12−4)(12−8) = (10)(8)(4) = 320
    L3(6) = −16 / 320 = −0.05
    contribución: 70 × (−0.05) = −3.5

  SUMA:  P3(6) = −30 + 63.75 + 25 − 3.5 = 55.25

  También por sustitución directa en la forma estándar:
    P3(6) = −0.223958(216) + 7.09375(36) − 68.791667(6) + 261
          = −48.375 + 255.375 − 412.75 + 261 = 55.25   (coincide ✓)

RESULTADO FINAL
  P3(6) = 55.25 ms
  Interpretación: si el microservicio se escala a 6 GB de RAM, el modelo
  de interpolación de Lagrange predice una latencia media de 55.25 ms
  para las peticiones HTTP, antes de desplegar la configuración en
  producción.`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-sky-400/80 mb-1">
            Métodos Numéricos · Sesión 8 · Interpolación de Lagrange
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Optimización de Latencia en un Clúster de Microservicios
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            El consumo de memoria RAM x (GB) de un microservicio impacta la latencia media y (ms) de las
            peticiones HTTP. Con 4 puntos medidos en pruebas de carga se construye el polinomio interpolador
            P₃(x) de grado 3 mediante la fórmula de Lagrange, y se estima la latencia al escalar el contenedor
            a x = 6 GB.
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada de datos ------------------------- */}
        <Seccion num={1} titulo="Entrada de datos — nodos (xᵢ, yᵢ) y punto a evaluar" nota="Parte B · Requerimiento: lectura/ingreso dinámico de los 4 nodos y de xeval">
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Nodo</th>
                    <th className="text-left font-medium px-3 py-2">xᵢ — Memoria (GB)</th>
                    <th className="text-left font-medium px-3 py-2">yᵢ — Latencia (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {nodos.map((n, i) => (
                    <tr key={i} className="border-t border-slate-900">
                      <td className="px-3 py-2 font-mono text-slate-400">x{sub(i)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" value={n.x}
                          onChange={(e) => actualizarNodo(i, 'x', e.target.value)}
                          className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" value={n.y}
                          onChange={(e) => actualizarNodo(i, 'y', e.target.value)}
                          className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs text-slate-400">
                Punto a evaluar x<span className="text-[10px] align-sub">eval</span>
                <input
                  type="number" value={xEvalStr}
                  onChange={(e) => setXEvalStr(e.target.value)}
                  className="mt-1 block w-32 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60"
                />
              </label>
              <button
                onClick={restablecer}
                className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
              >
                restablecer valores del enunciado
              </button>
              {!xsValidos && (
                <p className="text-xs text-rose-400 max-w-[14rem]">Los valores xᵢ deben ser distintos entre sí.</p>
              )}
            </div>
          </div>
        </Seccion>

        {/* --------------------- 2. Polinomios base de Lagrange ------------------- */}
        <Seccion
          num={2}
          titulo="Construcción de los polinomios base de Lagrange Lₖ(x)"
          nota="Parte A.1 · Lₖ(x) = ∏ (x − xᵢ)/(xₖ − xᵢ), i ≠ k — forma factorizada y expresión simplificada"
        >
          {basis ? (
            <div className="space-y-4">
              {basis.map(({ k, den, Lk }) => {
                const xs_ = nodos.map((n) => n.x)
                const factoresNum = xs_.map((xi, i) => (i === k ? null : `(x ${xi < 0 ? '+' : '−'} ${Math.abs(xi)})`)).filter(Boolean).join('·')
                const factoresDen = xs_.map((xi, i) => (i === k ? null : `(${fmt(xs_[k])} ${xi < 0 ? '+' : '−'} ${Math.abs(xi)})`)).filter(Boolean).join('·')
                return (
                  <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 overflow-x-auto">
                    <div className="font-mono text-xs text-slate-400 mb-1">
                      L{sub(k)}(x) = {factoresNum} / {factoresDen} = {factoresNum} / {fmt(den, 4)}
                    </div>
                    <div className="font-mono text-sm text-sky-300 whitespace-nowrap">
                      L{sub(k)}(x) = {formatoPoly(Lk, 6)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-rose-400">Corrige los nodos para calcular los polinomios base.</p>
          )}
        </Seccion>

        {/* ----------------- 3. Polinomio interpolador P3(x) ---------------- */}
        <Seccion
          num={3}
          titulo="Formulación del polinomio interpolador P₃(x)"
          nota="Parte A.2 · P₃(x) = Σ yₖ·Lₖ(x), simplificado a la forma estándar a₃x³ + a₂x² + a₁x + a₀"
        >
          {P ? (
            <div className="space-y-3">
              <div className="font-mono text-xs text-slate-400">
                P₃(x) = {nodos.map((n, i) => `${n.y}·L${sub(i)}(x)`).join(' + ')}
              </div>
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                <div className="font-mono text-base text-slate-100 whitespace-nowrap overflow-x-auto">
                  P₃(x) = {formatoPoly(P, 6)}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {['a₃', 'a₂', 'a₁', 'a₀'].map((lbl, idx) => (
                  <div key={lbl} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[11px] text-slate-500">{lbl}</div>
                    <div className="font-mono text-sm text-slate-200">{fmt(P[P.length - 1 - idx], 6)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-rose-400">Corrige los nodos para formular P₃(x).</p>
          )}
        </Seccion>

        {/* --------------------- 4. Evaluación paso a paso ------------------- */}
        <Seccion
          num={4}
          titulo={`Estimación y evaluación — P₃(${fmt(xEval)})`}
          nota="Parte A.3 · Pasos de reemplazo numérico ordenados, término por término"
        >
          {detalle ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-400">Ver detalle del término k =</span>
                {detalle.terminos.map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setKDetalle(t.k)}
                    className={`w-8 h-8 rounded-full text-xs font-mono border transition-colors ${
                      t.k === kDet ? 'bg-sky-500/20 border-sky-400/50 text-sky-300' : 'border-slate-800 text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    {t.k}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={kDet} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto">
                  <div className="text-slate-500">
                    Término k = {kDet}  (y{sub(kDet)} = {fmt(nodos[kDet].y)})
                  </div>
                  <div>
                    numerador:&nbsp;&nbsp;
                    {detalle.terminos[kDet].factores.map((f, idx) => (
                      <span key={idx}>({fmt(xEval)} {nodos[f.i].x < 0 ? '+' : '−'} {fmt(Math.abs(nodos[f.i].x))}) </span>
                    ))}
                    = {fmt(detalle.terminos[kDet].numProd, 4)}
                  </div>
                  <div>
                    denominador: {detalle.terminos[kDet].factores.map((f, idx) => (
                      <span key={idx}>({fmt(nodos[kDet].x)} {nodos[f.i].x < 0 ? '+' : '−'} {fmt(Math.abs(nodos[f.i].x))}) </span>
                    ))}
                    = {fmt(detalle.terminos[kDet].denProd, 4)}
                  </div>
                  <div className="text-sky-300">
                    L{sub(kDet)}({fmt(xEval)}) = {fmt(detalle.terminos[kDet].numProd, 4)} / {fmt(detalle.terminos[kDet].denProd, 4)} = {fmt(detalle.terminos[kDet].Lk, 6)}
                  </div>
                  <div className="text-emerald-300">
                    contribución: {fmt(nodos[kDet].y)} × {fmt(detalle.terminos[kDet].Lk, 6)} = {fmt(detalle.terminos[kDet].contrib, 6)}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">k</th>
                      <th className="text-right font-medium px-3 py-2">yₖ</th>
                      <th className="text-right font-medium px-3 py-2">Lₖ({fmt(xEval)})</th>
                      <th className="text-right font-medium px-3 py-2">yₖ · Lₖ({fmt(xEval)})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.terminos.map((t) => (
                      <tr key={t.k} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{t.k}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(nodos[t.k].y)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(t.Lk, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(t.contrib, 6)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-800 bg-emerald-500/10">
                      <td colSpan={3} className="px-3 py-2 font-mono text-right text-slate-300">P₃({fmt(xEval)}) =</td>
                      <td className="px-3 py-2 font-mono text-right text-emerald-300 text-base">{fix(resultado, 4)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-rose-400">Corrige los nodos o el punto a evaluar.</p>
          )}
        </Seccion>

        {/* ---------------------- 5. Resultado y gráfica ---------------------- */}
        <Seccion num={5} titulo="Salida: valor interpolado y gráfica" nota="Parte B · Gráfico de los 4 puntos + curva continua de P₃(x), con el punto interpolado resaltado">
          <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start mb-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
              <div className="text-xs text-emerald-300/80 mb-1">Latencia estimada en x = {fmt(xEval)} GB</div>
              <div className="text-3xl font-bold font-mono text-emerald-200">{fix(resultado, 2)} ms</div>
              <div className="text-[11px] text-slate-500 mt-1">P₃({fmt(xEval)}) = {fix(resultado, 6)}</div>
            </div>
            <p className="text-xs text-slate-500 self-center">
              Punto resaltado: ({fmt(xEval)}, {fix(resultado, 4)}) — marcador rojo en la gráfica, con líneas guía
              punteadas hasta los ejes, igual que en el ejemplo de la guía teórica.
            </p>
          </div>

          {curva.length > 0 && (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" domain={[xmin, xmax]} stroke="#64748b"
                       label={{ value: 'Memoria RAM x (GB)', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                <YAxis type="number" dataKey="y" stroke="#64748b"
                       label={{ value: 'Latencia y (ms)', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                         formatter={(v) => Number(v).toFixed(3)} labelFormatter={(v) => `x = ${Number(v).toFixed(3)}`} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Line data={curva} dataKey="y" name="P₃(x) — curva interpolada" stroke="#38bdf8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Scatter data={puntosNodos} dataKey="y" name="puntos experimentales" fill="#f43f5e" shape="diamond" />
                {Number.isFinite(resultado) && Number.isFinite(xEval) && (
                  <ReferenceDot x={xEval} y={resultado} r={7} fill="#facc15" stroke="#0f172a" strokeWidth={2}
                                label={{ value: `(${fmt(xEval)}, ${fix(resultado, 2)})`, position: 'top', fill: '#facc15', fontSize: 11 }} />
                )}
                {Number.isFinite(xEval) && <ReferenceLine x={xEval} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
                {Number.isFinite(resultado) && <ReferenceLine y={resultado} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Seccion>

        {/* ----------------------- 6. Código fuente documentado --------------- */}
        <Seccion num={6} titulo="Código fuente documentado (motor de cálculo O(n²))" nota="Parte B · Algoritmo de Lagrange con bucles anidados, idéntico al usado por esta aplicación">
          <button
            onClick={() => setMostrarCodigo((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 mb-3"
          >
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

        {/* --------------- 7. Desarrollo manual (copiar a hoja bond) --------- */}
        <Seccion
          num={7}
          titulo="Desarrollo manual completo — para copiar a Word / hoja bond"
          nota="Parte A · Texto ya redactado con todos los pasos (enunciado, Lₖ(x), P₃(x) y evaluación en x = 6) usando los datos del enunciado"
        >
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              onClick={() => setMostrarManual((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
            >
              {mostrarManual ? 'ocultar desarrollo' : 'ver desarrollo completo'}
            </button>
            <button
              onClick={() => copiarTexto(MANUAL_TEXTO, setCopiado)}
              className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
            >
              {copiado === true ? '✓ copiado' : copiado === 'error' ? 'no se pudo copiar — selecciona y copia manualmente' : 'copiar texto completo'}
            </button>
          </div>
          <AnimatePresence>
            {mostrarManual && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }} className="overflow-hidden">
                <pre className="text-[11px] leading-relaxed font-mono text-slate-300 bg-slate-950/70 border border-slate-800 rounded-xl p-4 overflow-x-auto whitespace-pre">
{MANUAL_TEXTO}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-xs text-slate-500 mt-3">
            Nota: este texto corresponde a los datos exactos del enunciado (2,150), (4,85), (8,50), (12,70) y
            x = 6, no a los valores que edites arriba. Pégalo en Word y dale formato (títulos, ecuaciones) según
            lo que pida tu docente.
          </p>
        </Seccion>

      </div>
    </div>
  )
}
