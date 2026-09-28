import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 7 · SOLUCIÓN DE SISTEMAS DE ECUACIONES LINEALES
   Ejercicio: Método de Jacobi — Balance de carga en un clúster de 4 servidores

   Sistema A·x = b (estado estacionario del clúster):
     10x₁ − 2x₂ −  x₃        = 15
     − x₁ + 8x₂        − 2x₄ = 18
     −2x₁       + 12x₃ − 3x₄ = 25
           − x₂ − 2x₃ + 9x₄  = 20

   xᵢ = peticiones asignadas al servidor i (en miles por minuto).

   Requisitos del enunciado (PDF de la actividad):
     1) Demostrar si A es estrictamente diagonal dominante (EDD) por filas
        y explicar qué garantiza esta propiedad para Jacobi.
     2) Programar Jacobi con x⁽⁰⁾ = [0,0,0,0]ᵀ.
     3) Criterio de parada: error relativo < ε = 10⁻⁴.
     4) Mostrar en cada iteración k el vector x⁽ᵏ⁾ y el error calculado.
     5) Entregables: demostración de convergencia, código documentado,
        tabla del historial de iteraciones y solución final aproximada.
   ========================================================================= */

/* ============================ DATOS DEL PROBLEMA ========================= */

const A_MATRIX = [
  [10, -2, -1, 0],
  [-1, 8, 0, -2],
  [-2, 0, 12, -3],
  [0, -1, -2, 9],
]
const B_VECTOR = [15, 18, 25, 20]
const X0 = [0, 0, 0, 0] // vector inicial exigido por el enunciado
const TOL_POR_DEFECTO = 1e-4 // ε = 10⁻⁴ (error relativo)
const TOLERANCIAS = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6]
const MAX_ITER = 100 // protección: evita ciclos infinitos si no converge

/* ============================== UTILIDADES =============================== */

const SUBS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
const sub = (n) => String(n).split('').map((d) => SUBS[+d] ?? d).join('')

function fmt(v, d = 4) {
  if (!Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(d))
  return Object.is(r, -0) ? '0' : r.toString()
}
// Número con decimales fijos (para columnas de tabla alineadas)
const fix = (v, d = 6) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const sci = (v) => (Number.isFinite(v) ? v.toExponential(3) : '—')
const par = (v, d = 6) => (v < 0 ? `(${fmt(v, d)})` : fmt(v, d))

const normaInf = (v) => Math.max(...v.map(Math.abs))

/* ------------------------------------------------------------------------
   Eliminación de Gauss con pivoteo parcial.
   Solo se usa para (a) calcular det(A) y (b) obtener la solución "exacta"
   con la que se compara el resultado de Jacobi. NO forma parte de Jacobi.
   ------------------------------------------------------------------------ */
function gaussExacto(A, b) {
  const n = A.length
  const M = A.map((f, i) => [...f, b[i]])
  let det = 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-14) return { det: 0, x: null }
    if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; det = -det }
    det *= M[c][c]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = 0
    for (let j = i + 1; j < n; j++) s += M[i][j] * x[j]
    x[i] = (M[i][n] - s) / M[i][i]
  }
  return { det, x }
}

const matVec = (M, v) => M.map((f) => f.reduce((s, a, j) => s + a * v[j], 0))

/* ------------------------------------------------------------------------
   ANÁLISIS PRELIMINAR — Dominancia diagonal estricta por filas (EDD)
   Condición: |aᵢᵢ| > Σ_{j≠i} |aᵢⱼ|  para toda fila i.
   ------------------------------------------------------------------------ */
function analisisEDD(A) {
  return A.map((fila, i) => {
    const diag = Math.abs(fila[i])
    const suma = fila.reduce((s, a, j) => (j === i ? s : s + Math.abs(a)), 0)
    return { i, diag, suma, razon: suma / diag, cumple: diag > suma }
  })
}

/* ------------------------------------------------------------------------
   DESCOMPOSICIÓN  A = L + D + R   (Jacobi-Richardson, guía teórica)
   L: parte estrictamente inferior · D: diagonal · R: parte estrictamente superior
   Se divide cada fila entre aᵢᵢ:  A* = D⁻¹A = L* + I + R*
   Iteración:  x⁽ᵏ⁺¹⁾ = −(L* + R*)·x⁽ᵏ⁾ + b*    con  b* = D⁻¹b
   ------------------------------------------------------------------------ */
function descomposicion(A, b) {
  const n = A.length
  const zero = () => Array.from({ length: n }, () => Array(n).fill(0))
  const L = zero(), D = zero(), R = zero(), Ls = zero(), Rs = zero(), As = zero(), B = zero()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i > j) L[i][j] = A[i][j]
      else if (i === j) D[i][j] = A[i][j]
      else R[i][j] = A[i][j]
      As[i][j] = A[i][j] / A[i][i]
      if (i > j) Ls[i][j] = As[i][j]
      if (i < j) Rs[i][j] = As[i][j]
      B[i][j] = i === j ? 0 : -As[i][j] // B = −(L* + R*)
    }
  }
  const bStar = b.map((v, i) => v / A[i][i])
  const normaB = Math.max(...B.map((f) => f.reduce((s, a) => s + Math.abs(a), 0)))
  return { L, D, R, Ls, Rs, As, B, bStar, normaB }
}

/* ------------------------------------------------------------------------
   MÉTODO DE JACOBI
   Entradas : A (n×n), b, x0, tol (ε), maxIter, criterio
   Salida   : historial completo (k, x⁽ᵏ⁾, errores) y bandera de convergencia
   Fórmula  : xᵢ⁽ᵏ⁺¹⁾ = ( bᵢ − Σ_{j≠i} aᵢⱼ·xⱼ⁽ᵏ⁾ ) / aᵢᵢ
              (todas las componentes usan SOLO valores de la iteración k)
   Error relativo:
     'componente' → E = máxᵢ | (xᵢ⁽ᵏ⁺¹⁾ − xᵢ⁽ᵏ⁾) / xᵢ⁽ᵏ⁺¹⁾ |      (guía teórica)
     'norma'      → E = ‖x⁽ᵏ⁺¹⁾ − x⁽ᵏ⁾‖∞ / ‖x⁽ᵏ⁺¹⁾‖∞
   ------------------------------------------------------------------------ */
function jacobi(A, b, x0, tol, maxIter, criterio) {
  const n = A.length
  const historial = [{ k: 0, x: [...x0], error: null }]
  let x = [...x0]
  let convergio = false

  for (let k = 1; k <= maxIter; k++) {
    // 1) Nueva aproximación con valores de la iteración anterior
    const xNuevo = Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      let suma = 0
      for (let j = 0; j < n; j++) if (j !== i) suma += A[i][j] * x[j]
      xNuevo[i] = (b[i] - suma) / A[i][i]
    }

    // 2) Errores por componente y globales
    const difAbs = xNuevo.map((v, i) => Math.abs(v - x[i]))
    const relComp = xNuevo.map((v, i) => (v !== 0 ? difAbs[i] / Math.abs(v) : difAbs[i] === 0 ? 0 : Infinity))
    const errComp = Math.max(...relComp)
    const errNorma = Math.max(...difAbs) / (normaInf(xNuevo) || 1)
    const errAbs = Math.max(...difAbs)
    const error = criterio === 'norma' ? errNorma : errComp

    historial.push({ k, x: xNuevo, difAbs, relComp, errAbs, errComp, errNorma, error })
    x = xNuevo

    // 3) Criterio de parada
    if (error < tol) { convergio = true; break }
  }
  return { historial, convergio, iteraciones: historial.length - 1 }
}

/* Texto simbólico de la fórmula de Jacobi para la fila i */
function formulaSimbolica(A, b, i) {
  let t = `${b[i]}`
  A[i].forEach((a, j) => {
    if (j === i || a === 0) return
    const c = Math.abs(a) === 1 ? '' : `${Math.abs(a)}`
    t += ` ${a < 0 ? '+' : '−'} ${c}x${sub(j + 1)}⁽ᵏ⁾`
  })
  return `x${sub(i + 1)}⁽ᵏ⁺¹⁾ = (${t}) / ${A[i][i]}`
}

/* Texto numérico (con los valores de la iteración anterior sustituidos) */
function formulaNumerica(A, b, i, xPrev, xNew) {
  let t = `${fmt(b[i])}`
  A[i].forEach((a, j) => {
    if (j === i || a === 0) return
    t += ` ${a < 0 ? '+' : '−'} ${Math.abs(a)}·${par(xPrev[j])}`
  })
  return `x${sub(i + 1)} = (${t}) / ${A[i][i]} = ${fix(xNew[i])}`
}

/* Texto del código fuente mostrado en pantalla (mismo algoritmo que arriba) */
const CODIGO_FUENTE = `/**
 * Método de Jacobi para A·x = b
 * @param {number[][]} A      matriz de coeficientes (n×n, aii ≠ 0)
 * @param {number[]}   b      vector de términos independientes
 * @param {number[]}   x0     aproximación inicial (aquí [0,0,0,0])
 * @param {number}     tol    tolerancia ε (aquí 1e-4, error relativo)
 * @param {number}     maxIter máximo de iteraciones (protección)
 */
function jacobi(A, b, x0, tol, maxIter) {
  const n = A.length
  let x = [...x0]                       // x^(k)
  const historial = [{ k: 0, x: [...x0], error: null }]

  for (let k = 1; k <= maxIter; k++) {
    const xNuevo = Array(n).fill(0)     // x^(k+1)

    // Paso 4: xi^(k+1) = ( bi - suma_{j != i} aij * xj^(k) ) / aii
    for (let i = 0; i < n; i++) {
      let suma = 0
      for (let j = 0; j < n; j++) {
        if (j !== i) suma += A[i][j] * x[j]   // SOLO valores de la iteración anterior
      }
      xNuevo[i] = (b[i] - suma) / A[i][i]
    }

    // Paso 5: error relativo  E = max_i | (xi^(k+1) - xi^(k)) / xi^(k+1) |
    let error = 0
    for (let i = 0; i < n; i++) {
      const e = Math.abs((xNuevo[i] - x[i]) / xNuevo[i])
      if (e > error) error = e
    }

    historial.push({ k, x: xNuevo, error })  // se muestra x^(k) y E en cada iteración
    x = xNuevo                                // x^(k) <- x^(k+1)

    // Paso 6: criterio de parada
    if (error < tol) break
  }
  return historial
}`

/* ============================ PIEZAS DE INTERFAZ ========================= */

const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/40 p-5'

function Seccion({ num, titulo, children, nota }) {
  return (
    <div className={CARD}>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-xs font-mono text-emerald-400/80">{String(num).padStart(2, '0')}</span>
        <h2 className="font-semibold text-slate-100">{titulo}</h2>
      </div>
      {nota && <p className="text-xs text-slate-500 mb-4 ml-7">{nota}</p>}
      <div className={nota ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

function Matriz({ m, decimals = 2 }) {
  return (
    <div className="inline-flex items-stretch align-middle">
      <div className="w-1.5 border-l-2 border-y-2 border-slate-500 rounded-l-sm" />
      <table className="border-collapse">
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className="px-2.5 py-1 text-center font-mono text-sm text-slate-100 whitespace-nowrap">
                  {fmt(v, decimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="w-1.5 border-r-2 border-y-2 border-slate-500 rounded-r-sm" />
    </div>
  )
}

const Vector = ({ v, decimals = 2 }) => <Matriz m={v.map((x) => [x])} decimals={decimals} />

function Etiquetada({ titulo, children }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{titulo}</div>
      {children}
    </div>
  )
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }

/* ============================ COMPONENTE PRINCIPAL ======================= */

export default function PracticaJacobi() {
  const [tol, setTol] = useState(TOL_POR_DEFECTO)
  const [criterio, setCriterio] = useState('componente')
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [kDetalle, setKDetalle] = useState(1)

  const edd = useMemo(() => analisisEDD(A_MATRIX), [])
  const eddTotal = edd.every((f) => f.cumple)
  const { det, x: xExacta } = useMemo(() => gaussExacto(A_MATRIX, B_VECTOR), [])
  const desc = useMemo(() => descomposicion(A_MATRIX, B_VECTOR), [])

  const res = useMemo(
    () => jacobi(A_MATRIX, B_VECTOR, X0, tol, MAX_ITER, criterio),
    [tol, criterio]
  )
  const { historial, convergio, iteraciones } = res
  const final = historial[historial.length - 1]
  const residual = normaInf(matVec(A_MATRIX, final.x).map((v, i) => v - B_VECTOR[i]))
  const errorReal = xExacta ? normaInf(final.x.map((v, i) => v - xExacta[i])) : NaN
  const kDet = Math.min(Math.max(kDetalle, 1), iteraciones)
  const itDet = historial[kDet]
  const xPrevDet = historial[kDet - 1].x

  // Cota a priori: ‖x⁽ᵏ⁾ − x*‖∞ ≤ qᵏ/(1−q) · ‖x⁽¹⁾ − x⁽⁰⁾‖∞  (q = ‖B‖∞ < 1)
  const q = desc.normaB
  const dif10 = normaInf(desc.bStar.map((v, i) => v - X0[i]))
  const kCota = q < 1 ? Math.ceil(Math.log((tol * (1 - q)) / dif10) / Math.log(q)) : null

  const datosError = historial.slice(1).map((h) => ({ k: h.k, error: Math.max(h.error, 1e-16) }))
  const datosX = historial.map((h) => ({ k: h.k, x1: h.x[0], x2: h.x[1], x3: h.x[2], x4: h.x[3] }))

  const nombres = ['S₁', 'S₂', 'S₃', 'S₄']
  const colores = ['#22d3ee', '#facc15', '#a78bfa', '#fb7185']

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-emerald-400/80 mb-1">
            Métodos Numéricos · Sesión 7 · Método de Jacobi
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Balance de Carga en un Clúster de Servidores — Método de Jacobi
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Un centro de datos tiene 4 nodos interconectados. La carga xᵢ de cada servidor (en miles de
            peticiones por minuto) depende de las peticiones directas y de la redistribución interna entre
            nodos. En estado estacionario se obtiene un sistema <span className="font-mono text-slate-300">A·x = b</span>,
            que se resuelve de forma iterativa con Jacobi partiendo de x⁽⁰⁾ = [0, 0, 0, 0]ᵀ.
          </p>
        </motion.div>

        {/* ------------------------- 1. Planteamiento ------------------------- */}
        <Seccion num={1} titulo="Planteamiento del sistema A·x = b" nota="Datos tal cual el enunciado de la actividad">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="font-mono text-sm text-slate-200 bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1 overflow-x-auto">
              <div>10x₁ − 2x₂ −  x₃        = 15</div>
              <div>−x₁ + 8x₂        − 2x₄ = 18</div>
              <div>−2x₁       + 12x₃ − 3x₄ = 25</div>
              <div>      − x₂ − 2x₃ + 9x₄  = 20</div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Etiquetada titulo="A"><Matriz m={A_MATRIX} decimals={0} /></Etiquetada>
              <Etiquetada titulo="x">
                <div className="inline-flex items-stretch align-middle">
                  <div className="w-1.5 border-l-2 border-y-2 border-slate-500 rounded-l-sm" />
                  <div className="flex flex-col">
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className="px-2.5 py-1 text-center font-mono text-sm text-slate-100">x{sub(n)}</span>
                    ))}
                  </div>
                  <div className="w-1.5 border-r-2 border-y-2 border-slate-500 rounded-r-sm" />
                </div>
              </Etiquetada>
              <span className="text-slate-500">=</span>
              <Etiquetada titulo="b"><Vector v={B_VECTOR} decimals={0} /></Etiquetada>
            </div>
          </div>
        </Seccion>

        {/* --------------------- 2. Análisis preliminar EDD ------------------- */}
        <Seccion
          num={2}
          titulo="Análisis preliminar — ¿A es estrictamente diagonal dominante por filas?"
          nota="Condición: |aᵢᵢ| > Σ_{j≠i} |aᵢⱼ| para TODAS las filas"
        >
          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Fila</th>
                  <th className="text-left font-medium px-3 py-2">|aᵢᵢ|</th>
                  <th className="text-left font-medium px-3 py-2">Σ_{'{j≠i}'} |aᵢⱼ|</th>
                  <th className="text-left font-medium px-3 py-2">Comparación</th>
                  <th className="text-left font-medium px-3 py-2">Σ / |aᵢᵢ|</th>
                  <th className="text-left font-medium px-3 py-2">¿Cumple?</th>
                </tr>
              </thead>
              <tbody>
                {edd.map((f) => {
                  const otros = A_MATRIX[f.i]
                    .map((a, j) => (j === f.i || a === 0 ? null : `|${a}|`))
                    .filter(Boolean)
                    .join(' + ')
                  return (
                    <tr key={f.i} className="border-t border-slate-900">
                      <td className="px-3 py-2 font-mono text-slate-400">F{sub(f.i + 1)}</td>
                      <td className="px-3 py-2 font-mono text-slate-200">{f.diag}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{otros} = {f.suma}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{f.diag} &gt; {f.suma}</td>
                      <td className="px-3 py-2 font-mono text-cyan-300">{fmt(f.razon, 4)}</td>
                      <td className={`px-3 py-2 font-medium ${f.cumple ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {f.cumple ? '✓ Sí' : '✗ No'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${eddTotal ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
            {eddTotal
              ? 'Conclusión: las 4 filas cumplen |aᵢᵢ| > Σ|aᵢⱼ|, por lo tanto A es estrictamente diagonal dominante (EDD) por filas.'
              : 'Conclusión: alguna fila no cumple la condición; la dominancia diagonal estricta no se satisface (no permite garantizar la convergencia).'}
          </div>
        </Seccion>

        {/* ------------------- 3. Demostración de convergencia ---------------- */}
        <Seccion
          num={3}
          titulo="Demostración de convergencia y qué garantiza la propiedad EDD"
          nota="Criterio de la matriz de iteración B = −(L* + R*) con la norma infinito"
        >
          <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
            <p>
              Jacobi genera la sucesión <span className="font-mono text-slate-100">x⁽ᵏ⁺¹⁾ = B·x⁽ᵏ⁾ + b*</span>, con{' '}
              <span className="font-mono text-slate-100">B = −(L* + R*) = I − D⁻¹A</span>. El método converge para cualquier
              x⁽⁰⁾ si el radio espectral cumple ρ(B) &lt; 1, y basta con que alguna norma cumpla ‖B‖ &lt; 1 porque ρ(B) ≤ ‖B‖.
            </p>

            <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <Etiquetada titulo="B = −(L* + R*)"><Matriz m={desc.B} decimals={4} /></Etiquetada>
              <div className="font-mono text-xs space-y-1 text-slate-300">
                <div className="text-slate-500">Suma de |bᵢⱼ| por fila (= Σ|aᵢⱼ|/|aᵢᵢ|):</div>
                {desc.B.map((f, i) => (
                  <div key={i}>
                    fila {i + 1}: {fmt(f.reduce((s, a) => s + Math.abs(a), 0), 4)}
                  </div>
                ))}
                <div className="pt-1 text-emerald-300 text-sm">
                  ‖B‖∞ = máx = {fmt(desc.normaB, 4)} &lt; 1 ✓
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
              <div className="text-slate-200 font-medium">Demostración (paso a paso)</div>
              <ol className="list-decimal ml-5 space-y-1.5 text-slate-300">
                <li>Como |aᵢᵢ| &gt; Σ_{'{j≠i}'}|aᵢⱼ| en cada fila, se cumple Σ_{'{j≠i}'}|aᵢⱼ/aᵢᵢ| &lt; 1 para todo i.</li>
                <li>Esa suma es precisamente la suma de valores absolutos de la fila i de B; luego ‖B‖∞ = máxᵢ Σⱼ|bᵢⱼ| = {fmt(desc.normaB, 4)} &lt; 1.</li>
                <li>Como ρ(B) ≤ ‖B‖∞ &lt; 1, la iteración es una contracción y converge a la única solución x* para cualquier x⁽⁰⁾.</li>
                <li>
                  Además det(A) = {fmt(det, 0)} ≠ 0: una matriz EDD siempre es no singular, así que el sistema es compatible determinado.
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1.5">
              <div className="text-emerald-300 font-medium">¿Qué garantiza la propiedad EDD para Jacobi?</div>
              <ul className="list-disc ml-5 space-y-1 text-slate-300">
                <li>A es no singular (det(A) ≠ 0) → existe una única solución.</li>
                <li>Jacobi converge para <b>cualquier</b> vector inicial x⁽⁰⁾, incluido [0,0,0,0]ᵀ.</li>
                <li>
                  El error decrece al menos geométricamente:{' '}
                  <span className="font-mono">‖x⁽ᵏ⁾ − x*‖∞ ≤ qᵏ/(1−q) · ‖x⁽¹⁾ − x⁽⁰⁾‖∞</span>, con q = ‖B‖∞ = {fmt(q, 4)}.
                </li>
                <li>
                  Es una condición <b>suficiente, no necesaria</b>: si no se cumpliera no se podría afirmar que el método diverge,
                  solo que este criterio no garantiza la convergencia.
                </li>
              </ul>
              {kCota && (
                <p className="text-xs text-slate-400 pt-1">
                  Con ε = {tol.toExponential(0)} la cota a priori indica k ≥ {kCota} iteraciones para garantizar ese error
                  absoluto (estimación conservadora; el criterio práctico de parada suele requerir menos).
                </p>
              )}
            </div>
          </div>
        </Seccion>

        {/* ----------------- 4. Formulación del método (pasos) ---------------- */}
        <Seccion
          num={4}
          titulo="Método de Jacobi-Richardson — pasos y fórmulas iterativas"
          nota="Siguiendo la guía teórica: A = L + D + R  →  x⁽ᵏ⁺¹⁾ = −(L* + R*)·x⁽ᵏ⁾ + b*"
        >
          <div className="space-y-5">
            <ol className="text-sm text-slate-300 space-y-1.5 list-decimal ml-5">
              <li>Plantear el sistema A·x = b y verificar det(A) ≠ 0 (sistema compatible determinado): det(A) = {fmt(det, 0)}.</li>
              <li>Despejar la variable xᵢ de la fila i (fórmulas iterativas de Jacobi, abajo).</li>
              <li>Adoptar la solución inicial trivial x⁽⁰⁾ = [0, 0, 0, 0]ᵀ.</li>
              <li>Calcular x⁽ᵏ⁺¹⁾ usando <b>únicamente</b> los valores de la iteración anterior (desplazamientos simultáneos).</li>
              <li>Calcular el error relativo entre iteraciones consecutivas.</li>
              <li>Detenerse cuando el error sea menor que ε (o al alcanzar el máximo de iteraciones).</li>
            </ol>

            <div>
              <div className="text-xs text-slate-400 mb-2">Fórmulas iterativas (despeje de cada incógnita)</div>
              <div className="font-mono text-sm text-slate-200 bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5 overflow-x-auto">
                {A_MATRIX.map((_, i) => (
                  <div key={i}>{formulaSimbolica(A_MATRIX, B_VECTOR, i)}</div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-2">Descomposición A = L + D + R</div>
              <div className="flex flex-wrap items-center gap-4">
                <Etiquetada titulo="A"><Matriz m={A_MATRIX} decimals={0} /></Etiquetada>
                <span className="text-slate-500">=</span>
                <Etiquetada titulo="L (inferior)"><Matriz m={desc.L} decimals={0} /></Etiquetada>
                <span className="text-slate-500">+</span>
                <Etiquetada titulo="D (diagonal)"><Matriz m={desc.D} decimals={0} /></Etiquetada>
                <span className="text-slate-500">+</span>
                <Etiquetada titulo="R (superior)"><Matriz m={desc.R} decimals={0} /></Etiquetada>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-2">Al dividir cada fila entre aᵢᵢ: A* = L* + I + R*</div>
              <div className="flex flex-wrap items-center gap-4">
                <Etiquetada titulo="A*"><Matriz m={desc.As} decimals={4} /></Etiquetada>
                <span className="text-slate-500">=</span>
                <Etiquetada titulo="L*"><Matriz m={desc.Ls} decimals={4} /></Etiquetada>
                <span className="text-slate-500">+</span>
                <Etiquetada titulo="I"><Matriz m={[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]} decimals={0} /></Etiquetada>
                <span className="text-slate-500">+</span>
                <Etiquetada titulo="R*"><Matriz m={desc.Rs} decimals={4} /></Etiquetada>
                <span className="text-slate-600 px-2">|</span>
                <Etiquetada titulo="b* = D⁻¹b"><Vector v={desc.bStar} decimals={4} /></Etiquetada>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Observa que x⁽¹⁾ = b* (porque x⁽⁰⁾ = 0), lo que se verifica en la primera fila de la tabla de iteraciones.
              </p>
            </div>
          </div>
        </Seccion>

        {/* --------------------- 5. Historial de iteraciones ------------------ */}
        <Seccion
          num={5}
          titulo="Implementación — historial de iteraciones (x⁽ᵏ⁾ y error en cada k)"
          nota="El programa muestra en cada iteración el vector solución y el error relativo calculado"
        >
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              Tolerancia ε
              <select
                value={tol}
                onChange={(e) => setTol(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500/60"
              >
                {TOLERANCIAS.map((t) => (
                  <option key={t} value={t}>{t.toExponential(0)}{t === TOL_POR_DEFECTO ? ' (enunciado)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 flex items-center gap-2">
              Error relativo
              <select
                value={criterio}
                onChange={(e) => setCriterio(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 text-xs focus:outline-none focus:border-emerald-500/60"
              >
                <option value="componente">máx. por componente |Δxᵢ / xᵢ⁽ᵏ⁺¹⁾| (guía teórica)</option>
                <option value="norma">norma ‖Δx‖∞ / ‖x⁽ᵏ⁺¹⁾‖∞</option>
              </select>
            </label>
            <span className="text-xs text-slate-500">x⁽⁰⁾ = [0, 0, 0, 0]ᵀ · máx. {MAX_ITER} iteraciones</span>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">k</th>
                  <th className="text-right font-medium px-3 py-2">x₁⁽ᵏ⁾</th>
                  <th className="text-right font-medium px-3 py-2">x₂⁽ᵏ⁾</th>
                  <th className="text-right font-medium px-3 py-2">x₃⁽ᵏ⁾</th>
                  <th className="text-right font-medium px-3 py-2">x₄⁽ᵏ⁾</th>
                  <th className="text-right font-medium px-3 py-2">Error relativo E</th>
                  <th className="text-right font-medium px-3 py-2">E (%)</th>
                  <th className="text-left font-medium px-3 py-2">¿E &lt; ε?</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => {
                  const ultima = h.k === iteraciones
                  const ok = h.error !== null && h.error < tol
                  return (
                    <tr key={h.k} className={`border-t border-slate-900 ${ultima ? 'bg-emerald-500/10' : 'hover:bg-slate-900/60'}`}>
                      <td className="px-3 py-2 font-mono text-slate-400">{h.k}</td>
                      {h.x.map((v, i) => (
                        <td key={i} className="px-3 py-2 font-mono text-right text-slate-200">{fix(v)}</td>
                      ))}
                      <td className="px-3 py-2 font-mono text-right text-cyan-300">{h.error === null ? '—' : sci(h.error)}</td>
                      <td className="px-3 py-2 font-mono text-right text-slate-300">{h.error === null ? '—' : fix(h.error * 100, 4)}</td>
                      <td className={`px-3 py-2 text-xs ${h.error === null ? 'text-slate-600' : ok ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {h.error === null ? 'inicial' : ok ? '✓ sí, se detiene' : 'no, continúa'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Nota: en k = 1 el error es 100 % porque se parte de x⁽⁰⁾ = 0; es el comportamiento esperado.
          </p>
        </Seccion>

        {/* ---------------------- 6. Solución final aproximada ---------------- */}
        <Seccion num={6} titulo="Solución final aproximada" nota="Vector obtenido cuando se cumple el criterio de parada">
          <div className={`rounded-xl border px-4 py-2.5 text-sm mb-4 ${convergio ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {convergio
              ? `El método convergió en k = ${iteraciones} iteraciones (E = ${sci(final.error)} < ε = ${tol.toExponential(0)}).`
              : `Se alcanzó el máximo de ${MAX_ITER} iteraciones sin cumplir el criterio de parada.`}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {final.x.map((v, i) => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="text-xs mb-1" style={{ color: colores[i] }}>Servidor {i + 1} — x{sub(i + 1)}</div>
                <div className="text-2xl font-bold font-mono text-slate-50">{fix(v, 4)}</div>
                <div className="text-[11px] text-slate-500 mt-1">miles de peticiones / minuto</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-8">
            <Etiquetada titulo={`x⁽${iteraciones}⁾ (Jacobi)`}><Vector v={final.x} decimals={6} /></Etiquetada>
            {xExacta && (
              <Etiquetada titulo="x* (solución exacta por Gauss, comparación)"><Vector v={xExacta} decimals={6} /></Etiquetada>
            )}
            <div className="font-mono text-xs space-y-1.5 text-slate-300 pt-4">
              <div>Iteraciones: <span className="text-emerald-300">{iteraciones}</span></div>
              <div>Error relativo final E: <span className="text-cyan-300">{sci(final.error)}</span></div>
              <div>‖x⁽ᵏ⁾ − x*‖∞ (error real): <span className="text-cyan-300">{sci(errorReal)}</span></div>
              <div>Residuo ‖b − A·x‖∞: <span className="text-cyan-300">{sci(residual)}</span></div>
              <div>Carga total Σxᵢ: <span className="text-slate-100">{fix(final.x.reduce((s, v) => s + v, 0), 4)}</span> mil pet/min</div>
            </div>
          </div>
        </Seccion>

        {/* ------------------------------ 7. Gráficos ------------------------- */}
        <Seccion num={7} titulo="Gráficos de convergencia">
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-slate-300 mb-2">Evolución de xᵢ⁽ᵏ⁾ por servidor</div>
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={datosX} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="k" stroke="#64748b"
                         label={{ value: 'iteración k', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                           labelFormatter={(v) => `k = ${v}`} formatter={(v) => Number(v).toFixed(6)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="x1" name="x₁" stroke={colores[0]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="x2" name="x₂" stroke={colores[1]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="x3" name="x₃" stroke={colores[2]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="x4" name="x₄" stroke={colores[3]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-sm text-slate-300 mb-2">Error relativo E por iteración (escala logarítmica)</div>
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={datosError} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="k" stroke="#64748b"
                         label={{ value: 'iteración k', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis stroke="#64748b" scale="log" domain={[Math.min(tol / 10, 1e-6), 10]} allowDataOverflow
                         tickFormatter={(v) => Number(v).toExponential(0)} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                           labelFormatter={(v) => `k = ${v}`} formatter={(v) => Number(v).toExponential(3)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <ReferenceLine y={tol} stroke="#34d399" strokeDasharray="5 4"
                                 label={{ value: `ε = ${tol.toExponential(0)}`, fill: '#34d399', fontSize: 11, position: 'insideTopRight' }} />
                  <Line type="monotone" dataKey="error" name="Error relativo E" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Seccion>

        {/* --------------------- 8. Detalle de una iteración ------------------ */}
        <Seccion
          num={8}
          titulo="Detalle del cálculo de una iteración"
          nota="Sustitución numérica de las fórmulas de Jacobi y errores por componente (como en la pizarra)"
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs text-slate-400">Iteración k =</span>
            {historial.slice(1).map((h) => (
              <button
                key={h.k}
                onClick={() => setKDetalle(h.k)}
                className={`w-8 h-8 rounded-full text-xs font-mono border transition-colors ${
                  h.k === kDet
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                {h.k}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={kDet} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="grid lg:grid-cols-2 gap-5">
              <div>
                <div className="text-xs text-slate-400 mb-2">
                  Cálculo de x⁽{kDet}⁾ a partir de x⁽{kDet - 1}⁾ = ({xPrevDet.map((v) => fmt(v, 4)).join(', ')})
                </div>
                <ol className="space-y-1.5">
                  {A_MATRIX.map((_, i) => (
                    <li key={i} className="font-mono text-xs text-slate-300 bg-slate-950/60 rounded-lg px-3 py-1.5 border border-slate-800 overflow-x-auto whitespace-nowrap">
                      {formulaNumerica(A_MATRIX, B_VECTOR, i, xPrevDet, itDet.x)}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-2">Errores por componente entre x⁽{kDet}⁾ y x⁽{kDet - 1}⁾</div>
                <div className="rounded-xl border border-slate-800 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="text-left font-medium px-3 py-1.5">i</th>
                        <th className="text-right font-medium px-3 py-1.5">|xᵢ⁽ᵏ⁾ − xᵢ⁽ᵏ⁻¹⁾|</th>
                        <th className="text-right font-medium px-3 py-1.5">Eᵢ relativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itDet.difAbs.map((d, i) => (
                        <tr key={i} className="border-t border-slate-900">
                          <td className="px-3 py-1.5 font-mono text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(d, 6)}</td>
                          <td className="px-3 py-1.5 font-mono text-right text-cyan-300">{sci(itDet.relComp[i])}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-800 bg-slate-900/60">
                        <td className="px-3 py-1.5 font-mono text-slate-400">máx</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-100">{fix(itDet.errAbs, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-emerald-300">{sci(itDet.errComp)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Error por norma: ‖Δx‖∞ / ‖x‖∞ = {sci(itDet.errNorma)}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </Seccion>

        {/* ----------------------- 9. Código fuente documentado --------------- */}
        <Seccion num={9} titulo="Código fuente documentado (algoritmo de Jacobi)">
          <button
            onClick={() => setMostrarCodigo((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 mb-3"
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

      </div>
    </div>
  )
}
