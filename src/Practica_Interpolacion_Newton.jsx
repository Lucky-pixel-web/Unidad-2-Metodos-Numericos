import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceDot, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 9 · INTERPOLACIÓN POLINÓMICA DE NEWTON (DIFERENCIAS DIVIDIDAS)
   Estimación de latencia en microservicios

   Contexto: el equipo SRE evalúa la degradación de una API REST crítica a
   medida que aumenta la carga concurrente (en cientos de req/s). Se midió
   la latencia media y (ms) en 4 puntos de carga:
        i :   0    1    2     3
       x_i:   1    2    4     7     (×100 req/s)
       y_i:  45   65  110   220     (ms)

   Requisitos del enunciado (PDF de la actividad):
     Construcción manual del polinomio de Newton:
       1) Tabla de Diferencias Divididas completa con los 4 puntos (n = 3).
       2) P3(x) y su forma estándar a3x³ + a2x² + a1x + a0.
       3) Interpolar la latencia a 500 req/s (x = 5).
     Validación teórica:
       4) Verificar que P3 pasa exactamente por los 4 puntos dados.
     Aplicativo solucionador interactivo:
       5) Explorar la curva, evaluar P3(5) y comparar el grado del polinomio
          en tiempo real.
     Objetivos del programa:
       - Entrada: vector de cargas X y vector de latencias Y (tamaño n).
       - Función diferencias_divididas(X, Y) que retorne la matriz triangular.
       - Evaluación eficiente: regla de evaluación del polinomio de Newton.
       - Validación con X=[1,2,4,7], Y=[45,65,110,220] y cálculo de P3(5).
   ========================================================================= */

/* ============================ DATOS POR DEFECTO ========================= */

const NODOS_DEFECTO = [
  { x: 1, y: 45 },
  { x: 2, y: 65 },
  { x: 4, y: 110 },
  { x: 7, y: 220 },
]
const X_EVAL_DEFECTO = 5

/* Ejemplos para validar el programa (los de la actividad y los de clase) */
const PRESETS = [
  {
    id: 'actividad', etiqueta: 'Actividad (latencia)', xEval: X_EVAL_DEFECTO, esperado: 139,
    nodos: NODOS_DEFECTO,
    nota: 'Datos de la tarea: carga (×100 req/s) vs latencia (ms); se pide P₃(5).',
  },
  {
    id: 'excel', etiqueta: 'Excel de clase', xEval: 120, esperado: 52.2256,
    nodos: [{ x: 100, y: 50.2 }, { x: 150, y: 55.6 }, { x: 200, y: 61.8 }, { x: 250, y: 68.2 }],
    nota: 'Hoja "Newton 3" mostrada en clase: TDD 0.108, 0.00016, −8E−07 y P(120) = 52.2256.',
  },
  {
    id: 'dv', etiqueta: 'Pizarra: D(v)', xEval: 90, esperado: 10.3125,
    nodos: [{ x: 60, y: 9 }, { x: 80, y: 10 }, { x: 100, y: 10.5 }],
    nota: 'Ejemplo de pizarra (velocidad vs. desempeño): TDD 0.05 y −0.000625, P₂(90) = 10.3125.',
  },
  {
    id: 'frac', etiqueta: 'Pizarra: (3+x)/(1+x)', xEval: 0.25, esperado: 2.6025,
    nodos: [{ x: 0.1, y: 2.82 }, { x: 0.2, y: 2.67 }, { x: 0.4, y: 2.43 }],
    nota: 'Ejemplo de pizarra con f(x) = (3+x)/(1+x): TDD −1.5 y 1, P₂(0.25) = 2.6025 (valor real 2.60).',
  },
  {
    id: 'tdd', etiqueta: 'Pizarra: TDD (1,3,7,10)', xEval: 5, esperado: null,
    nodos: [{ x: 1, y: 2 }, { x: 3, y: 8 }, { x: 7, y: 13 }, { x: 10, y: 21 }],
    nota: 'Tabla de la pizarra: 3, 1.25, 2.67 / −0.2916, 0.2029 / 0.05494. Allí se redondeó a 2 decimales; con valores exactos salen 8/3, 17/84 y 83/1512.',
  },
]
const N_MIN = 2
const N_MAX = 7
const COLORES_GRADO = ['#a78bfa', '#facc15', '#38bdf8', '#34d399', '#fb7185', '#f97316']

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

/* Texto del código fuente mostrado en pantalla (mismo algoritmo de arriba) */
const CODIGO_FUENTE = `/**
 * Tabla de diferencias divididas de Newton (matriz triangular)
 * @param {number[]} X  vector de cargas  x_i  (distintos entre sí)
 * @param {number[]} Y  vector de latencias y_i = f(x_i)
 * @returns {number[][]} T con T[i][0] = f[x_i] y, para j >= 1,
 *          T[i][j] = ( T[i+1][j-1] - T[i][j-1] ) / ( X[i+j] - X[i] )
 */
function diferencias_divididas(X, Y) {
  const n = X.length
  const T = Array.from({ length: n }, () => Array(n).fill(null))
  for (let i = 0; i < n; i++) T[i][0] = Y[i]          // columna 0: f[x_i]

  for (let j = 1; j < n; j++) {                        // orden de la diferencia
    for (let i = 0; i < n - j; i++) {                  // fila
      T[i][j] = (T[i + 1][j - 1] - T[i][j - 1]) / (X[i + j] - X[i])
    }
  }
  return T      // coeficientes de Newton = primera fila: c_j = T[0][j]
}

/**
 * Evaluación eficiente del polinomio de Newton (regla de Horner):
 * P(x) = c0 + (x-x0)(c1 + (x-x1)(c2 + (x-x2)(c3 + ...)))
 * @param {number[]} X     nodos
 * @param {number[]} coef  coeficientes c_j (primera fila de la tabla)
 * @param {number}   x     punto a interpolar
 */
function evaluar_newton(X, coef, x) {
  let r = coef[coef.length - 1]
  for (let i = coef.length - 2; i >= 0; i--) {
    r = coef[i] + (x - X[i]) * r
  }
  return r
}

// Uso con el caso de estudio:
//   const T = diferencias_divididas([1,2,4,7], [45,65,110,220])
//   const c = T[0]                      // [45, 20, 5/6, 1/3]
//   evaluar_newton([1,2,4,7], c, 5)     // 139`

/* ====================== TEXTO DEL DESARROLLO MANUAL ===================== */
/* Datos exactos del enunciado. Cada "hoja" está pensada para copiarse a una
   hoja bond (escrito a mano o pegado en Word). */

const HOJA_1 = `SESIÓN 9 — INTERPOLACIÓN POLINÓMICA DE NEWTON
Estimación de latencia en microservicios (diferencias divididas)

DATOS DEL PROBLEMA  (n = 3, es decir 4 puntos)
   i     x_i (×100 req/s)     y_i = f(x_i) (ms)
   0           1                    45
   1           2                    65
   2           4                   110
   3           7                   220

Se pide: P3(x) en forma estándar y la latencia esperada a 500 req/s (x = 5).

PASO 1: TABLA DE DIFERENCIAS DIVIDIDAS
Fórmula:  f[x_k, ..., x_{k+i}] = ( f[x_{k+1}, ..., x_{k+i}] − f[x_k, ..., x_{k+i−1}] ) / ( x_{k+i} − x_k )

Orden 0 (valores de la función):
   f[1] = 45      f[2] = 65      f[4] = 110      f[7] = 220

Orden 1 (primeras diferencias):
   f[1,2] = (f[2] − f[1]) / (2 − 1) = (65 − 45) / 1   = 20
   f[2,4] = (f[4] − f[2]) / (4 − 2) = (110 − 65) / 2  = 45/2 = 22.5
   f[4,7] = (f[7] − f[4]) / (7 − 4) = (220 − 110) / 3 = 110/3 ≈ 36.6667

Orden 2 (segundas diferencias):
   f[1,2,4] = (f[2,4] − f[1,2]) / (4 − 1) = (45/2 − 20) / 3  = (5/2) / 3  = 5/6 ≈ 0.8333
   f[2,4,7] = (f[4,7] − f[2,4]) / (7 − 2) = (110/3 − 45/2) / 5 = (85/6) / 5 = 17/6 ≈ 2.8333

Orden 3 (tercera diferencia):
   f[1,2,4,7] = (f[2,4,7] − f[1,2,4]) / (7 − 1) = (17/6 − 5/6) / 6 = (12/6) / 6 = 1/3 ≈ 0.3333

TABLA COMPLETA
    x_i     f[x_i]     1.ª dif     2.ª dif     3.ª dif
     1        45         20          5/6         1/3
     2        65        45/2         17/6
     4       110       110/3
     7       220

Coeficientes de Newton (primera fila de cada columna):
   c0 = f[1]       = 45
   c1 = f[1,2]     = 20
   c2 = f[1,2,4]   = 5/6
   c3 = f[1,2,4,7] = 1/3`

const HOJA_2 = `PASO 2: POLINOMIO INTERPOLADOR DE NEWTON (grado 3)
   P3(x) = f[x0] + f[x0,x1](x − x0) + f[x0,x1,x2](x − x0)(x − x1) + f[x0,x1,x2,x3](x − x0)(x − x1)(x − x2)

   P3(x) = 45 + 20(x − 1) + (5/6)(x − 1)(x − 2) + (1/3)(x − 1)(x − 2)(x − 4)

PASO 3: FORMA ESTÁNDAR  P3(x) = a3·x³ + a2·x² + a1·x + a0

Productos necesarios:
   (x − 1)(x − 2) = x² − 3x + 2
   (x − 1)(x − 2)(x − 4) = (x² − 3x + 2)(x − 4)
                         = x³ − 4x² − 3x² + 12x + 2x − 8
                         = x³ − 7x² + 14x − 8

Desarrollo término por término:
   45                                 = 45
   20(x − 1)                          = 20x − 20
   (5/6)(x² − 3x + 2)                 = (5/6)x² − (5/2)x + 5/3
   (1/3)(x³ − 7x² + 14x − 8)          = (1/3)x³ − (7/3)x² + (14/3)x − 8/3

Suma agrupando por potencias de x:
   x³ :  1/3
   x² :  5/6 − 7/3 = 5/6 − 14/6 = −9/6 = −3/2
   x¹ :  20 − 5/2 + 14/3 = 120/6 − 15/6 + 28/6 = 133/6
   x⁰ :  45 − 20 + 5/3 − 8/3 = 25 − 3/3 = 24

FORMA ESTÁNDAR (fracciones exactas):
   P3(x) = (1/3)x³ − (3/2)x² + (133/6)x + 24

FORMA ESTÁNDAR (decimales):
   P3(x) ≈ 0.333333x³ − 1.5x² + 22.166667x + 24

Coeficientes:  a3 = 1/3,   a2 = −3/2,   a1 = 133/6,   a0 = 24`

const HOJA_3 = `PASO 4: INTERPOLACIÓN A 500 req/s  (x = 5)

Con la forma de Newton:
   P3(5) = 45 + 20(5 − 1) + (5/6)(5 − 1)(5 − 2) + (1/3)(5 − 1)(5 − 2)(5 − 4)
         = 45 + 20(4) + (5/6)(4)(3) + (1/3)(4)(3)(1)
         = 45 + 80 + 10 + 4
         = 139

Comprobación con la forma estándar:
   P3(5) = (1/3)(5)³ − (3/2)(5)² + (133/6)(5) + 24
         = 125/3 − 75/2 + 665/6 + 24
         = (250 − 225 + 665)/6 + 24
         = 690/6 + 24 = 115 + 24 = 139      (coincide)

Comparación de grados (cada grado añade un término al anterior):
   P0(5) = 45
   P1(5) = 45 + 20(4)                              = 45 + 80 = 125
   P2(5) = P1(5) + (5/6)(4)(3)                     = 125 + 10 = 135
   P3(5) = P2(5) + (1/3)(4)(3)(1)                  = 135 + 4  = 139

VALIDACIÓN TEÓRICA: P3 pasa exactamente por los 4 puntos
   P3(1) = 45                                                  = 45    (= y0)  OK
   P3(2) = 45 + 20(1)                                          = 65    (= y1)  OK
           [el 3.er y 4.º términos valen 0 porque (x−1)(x−2) = 0]
   P3(4) = 45 + 20(3) + (5/6)(3)(2)                            = 45 + 60 + 5 = 110   (= y2)  OK
           [el 4.º término vale 0 porque (4−4) = 0]
   P3(7) = 45 + 20(6) + (5/6)(6)(5) + (1/3)(6)(5)(3)           = 45 + 120 + 25 + 30 = 220  (= y3)  OK

OBSERVACIÓN SOBRE EL ERROR (guía teórica)
   Los datos vienen de una tabla (no se conoce f(x)), por lo que el error no se puede calcular.
   Solo se puede escribir su forma: E3(x) = (x−x0)(x−x1)(x−x2)(x−x3) · f⁽⁴⁾(ξ) / 4!
   En x = 5:  (5−1)(5−2)(5−4)(5−7) = (4)(3)(1)(−2) = −24  →  E3(5) = −24·f⁽⁴⁾(ξ)/24 = −f⁽⁴⁾(ξ)
   Además los nodos x = 1, 2, 4, 7 NO son equiespaciados (h = 1, 2, 3), por eso no se usa Newton-Gregory.

RESULTADO FINAL
   P3(x) = (1/3)x³ − (3/2)x² + (133/6)x + 24
   P3(5) = 139 ms
   Interpretación: a una carga de 500 req/s se espera una latencia media de unos 139 ms.`

const HOJAS = [
  { id: 1, titulo: 'Hoja 1 — Datos y tabla de diferencias divididas', texto: HOJA_1 },
  { id: 2, titulo: 'Hoja 2 — Polinomio de Newton y forma estándar', texto: HOJA_2 },
  { id: 3, titulo: 'Hoja 3 — Interpolación, validación y resultado', texto: HOJA_3 },
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

export default function PracticaNewton() {
  const [nodos, setNodos] = useState(NODOS_DEFECTO)
  const [xEvalStr, setXEvalStr] = useState(String(X_EVAL_DEFECTO))
  const [ocultos, setOcultos] = useState([])
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [presetId, setPresetId] = useState('actividad')

  const n = nodos.length
  const X = nodos.map((p) => p.x)
  const Y = nodos.map((p) => p.y)
  const xEval = Number(xEvalStr)
  MODO_FR = X.every(Number.isInteger) && Y.every(Number.isInteger) && Number.isInteger(xEval)
  const numerosOk = X.every(Number.isFinite) && Y.every(Number.isFinite)
  const distintos = new Set(X).size === X.length
  const datosOk = numerosOk && distintos
  const evalOk = datosOk && xEvalStr !== '' && Number.isFinite(xEval)

  /* ------- cálculos (solo si los datos son válidos) ------- */
  const T = datosOk ? diferencias_divididas(X, Y) : null
  const coef = T ? T[0].slice(0, n) : null
  const estandar = coef ? newtonAEstandar(X, coef) : null
  const resultado = coef && evalOk ? evaluar_newton(X, coef, xEval) : NaN
  const pasosHorner = coef && evalOk ? evaluarNewtonPasos(X, coef, xEval) : []
  const resultadoLagrange = datosOk && evalOk ? lagrange_eval(X, Y, xEval) : NaN

  /* términos de Newton evaluados en xEval: c_k · Π_{j<k}(xEval − x_j) */
  const terminosEval = coef && evalOk
    ? coef.map((c, k) => {
        let prod = 1
        for (let j = 0; j < k; j++) prod *= xEval - X[j]
        return { k, c, prod, valor: c * prod }
      })
    : []
  /* P_d(xEval) por grado d (acumulando un término más cada vez) */
  const porGrado = []
  terminosEval.reduce((acc, t) => {
    const total = acc + t.valor
    porGrado.push({ d: t.k, termino: t.valor, total })
    return total
  }, 0)

  const gradoEfectivo = coef ? coef.reduce((g, c, j) => (Math.abs(c) > 1e-9 ? j : g), 0) : 0

  /* validación en los nodos */
  const validacion = coef
    ? nodos.map((p, i) => {
        const pv = evaluar_newton(X, coef, p.x)
        return { i, x: p.x, y: p.y, pv, dif: Math.abs(pv - p.y) }
      })
    : []
  const todosPasan = validacion.length > 0 && validacion.every((v) => v.dif < 1e-8)

  /* gráfica */
  const xmin = datosOk ? Math.min(...X) : 0
  const xmax = datosOk ? Math.max(...X) : 1
  const grados = Array.from({ length: n - 1 }, (_, i) => i + 1)
  const visibles = grados.filter((d) => !ocultos.includes(d))
  const curva = coef
    ? Array.from({ length: 161 }, (_, i) => {
        const x = xmin + ((xmax - xmin) * i) / 160
        const fila = { x }
        grados.forEach((d) => { fila[`p${d}`] = evaluar_newton(X, coef.slice(0, d + 1), x) })
        return fila
      })
    : []
  const puntosNodos = nodos.map((p) => ({ x: p.x, y: p.y }))
  const fueraDeRango = evalOk && (xEval < xmin || xEval > xmax)

  /* error / observaciones teóricas */
  const omega = evalOk ? X.reduce((acc, xi) => acc * (xEval - xi), 1) : NaN
  const factN = Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1)
  const pasosH = n > 1 ? X.slice(1).map((x, i) => x - X[i]) : []
  const equiespaciados = pasosH.length > 0 && pasosH.every((h) => Math.abs(h - pasosH[0]) < 1e-9)

  /* ------- acciones ------- */
  const actualizarNodo = (i, campo, valor) => {
    setPresetId(null)
    setNodos((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor === '' ? '' : Number(valor) } : p)))
  }
  const agregarPunto = () => {
    setPresetId(null)
    setNodos((prev) => {
      const ult = prev[prev.length - 1]
      const sig = Number.isFinite(ult.x) ? Math.max(...prev.map((p) => p.x).filter(Number.isFinite)) + 1 : 1
      return [...prev, { x: sig, y: Number.isFinite(ult.y) ? ult.y : 0 }]
    })
  }
  const quitarPunto = () => { setPresetId(null); setNodos((prev) => prev.slice(0, -1)) }
  const cargarPreset = (id) => {
    const pr = PRESETS.find((q) => q.id === id)
    setNodos(pr.nodos); setXEvalStr(String(pr.xEval)); setOcultos([]); setPresetId(id)
  }
  const restablecer = () => cargarPreset('actividad')
  const presetActivo = PRESETS.find((q) => q.id === presetId) ?? null
  const esAct = presetId === 'actividad' || presetId === null
  const coincideEsperado = presetActivo && presetActivo.esperado !== null && Number.isFinite(resultado)
    ? Math.abs(resultado - presetActivo.esperado) < 5e-4 : null
  const alternarGrado = (d) => setOcultos((prev) => (prev.includes(d) ? prev.filter((g) => g !== d) : [...prev, d]))

  const estadoCopiado = (clave, etiqueta) =>
    copiado === clave ? '✓ copiado' : copiado === 'error' ? 'no se pudo copiar' : etiqueta

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-sky-400/80 mb-1">
            Métodos Numéricos · Sesión 9 · Interpolación de Newton
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Estimación de Latencia en Microservicios — Polinomio de Newton
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            El equipo SRE evalúa la degradación de una API REST crítica al aumentar la carga concurrente.
            Con 4 mediciones de latencia se construye la tabla de diferencias divididas, el polinomio
            interpolador P₃(x) de Newton y se estima la latencia a 500 req/s (x = 5, con x en cientos de req/s).
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada de datos ------------------------- */}
        <Seccion num={1} titulo="Entrada de datos — vector de cargas X y vector de latencias Y"
          nota="Objetivo del programa: recibir dos arreglos de tamaño n (aquí n = 4 puntos → grado 3)">
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Cargar ejemplo (para validar el programa contra la clase):</div>
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
                      <th className="text-left font-medium px-3 py-2">Punto (i)</th>
                      <th className="text-left font-medium px-3 py-2">{esAct ? 'xᵢ — Carga (×100 req/s)' : 'xᵢ'}</th>
                      <th className="text-left font-medium px-3 py-2">{esAct ? 'yᵢ — Latencia (ms)' : 'yᵢ'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodos.map((p, i) => (
                      <tr key={i} className="border-t border-slate-900">
                        <td className="px-3 py-2 font-mono text-slate-400">{i}</td>
                        <td className="px-3 py-1.5">
                          <input type="number" value={p.x} onChange={(e) => actualizarNodo(i, 'x', e.target.value)} className={inputCls} />
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="number" value={p.y} onChange={(e) => actualizarNodo(i, 'y', e.target.value)} className={inputCls} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="font-mono text-xs text-slate-400 space-y-0.5">
                <div>X = [{X.map((v) => (Number.isFinite(v) ? v : '?')).join(', ')}]</div>
                <div>Y = [{Y.map((v) => (Number.isFinite(v) ? v : '?')).join(', ')}]</div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs text-slate-400">
                Punto a interpolar x{esAct ? ' (×100 req/s)' : ''}
                <input type="number" value={xEvalStr} onChange={(e) => { setPresetId(null); setXEvalStr(e.target.value) }}
                  className="mt-1 block w-32 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 font-mono text-slate-100 text-sm focus:outline-none focus:border-sky-500/60" />
              </label>
              {esAct && <div className="text-[11px] text-slate-500">x = {fmt(xEval)} ↔ {fmt(xEval * 100, 2)} req/s</div>}
              <div className="flex gap-2">
                <button onClick={agregarPunto} disabled={n >= N_MAX}
                  className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 disabled:opacity-30">
                  + punto
                </button>
                <button onClick={quitarPunto} disabled={n <= N_MIN}
                  className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 disabled:opacity-30">
                  − punto
                </button>
              </div>
              <button onClick={restablecer}
                className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10">
                restablecer datos de la actividad
              </button>
              {!numerosOk && <p className="text-xs text-rose-400 max-w-[14rem]">Completa todos los valores con números.</p>}
              {numerosOk && !distintos && <p className="text-xs text-rose-400 max-w-[14rem]">Los valores xᵢ deben ser distintos entre sí.</p>}
            </div>
          </div>
        </Seccion>

        {!datosOk && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Corrige los datos de la sección 1 para calcular la tabla y el polinomio.
          </div>
        )}

        {datosOk && (
          <>
            {/* ------------------- 2. Tabla de diferencias divididas ------------------- */}
            <Seccion num={2} titulo="Paso 1 — Tabla de diferencias divididas de Newton (TDD)"
              nota="Función diferencias_divididas(X, Y): matriz triangular. Los coeficientes son la primera fila de cada columna">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">xᵢ</th>
                      <th className="text-right font-medium px-3 py-2">f[xᵢ]</th>
                      {Array.from({ length: n - 1 }, (_, j) => (
                        <th key={j} className="text-right font-medium px-3 py-2">{j + 1}.ª dif.</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {T.map((fila, i) => (
                      <tr key={i} className={`border-t border-slate-900 ${i === 0 ? 'bg-sky-500/10' : ''}`}>
                        <td className="px-3 py-2 font-mono text-slate-300">{fmt(X[i])}</td>
                        {fila.slice(0, n).map((v, j) => (
                          <td key={j} className={`px-3 py-2 font-mono text-right ${i === 0 ? 'text-sky-200 font-semibold' : 'text-slate-300'}`}>
                            {v === null ? '' : (
                              <div className="leading-tight">
                                <div>{fr(v)}</div>
                                {esFraccion(v) && <div className="text-[10px] text-slate-500 font-normal">{fix(v, 4)}</div>}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">Fila resaltada = coeficientes de Newton (Paso 3 del procedimiento): {coef.map((c, j) => `c${sub(j)} = ${fr(c)}`).join(' · ')}</p>

              <div className="mt-5 space-y-4">
                <div className="text-sm text-slate-300">Cálculo de cada diferencia (fórmula f[xₖ…xₖ₊ᵢ] = (f[xₖ₊₁…xₖ₊ᵢ] − f[xₖ…xₖ₊ᵢ₋₁]) / (xₖ₊ᵢ − xₖ)):</div>
                {Array.from({ length: n - 1 }, (_, jj) => jj + 1).map((j) => (
                  <div key={j}>
                    <div className="text-xs text-slate-400 mb-1">{ORDINALES[j - 1] ?? `${j}.as`} diferencias</div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                      {Array.from({ length: n - j }, (_, i) => (
                        <div key={i} className="whitespace-nowrap">
                          f[{X.slice(i, i + j + 1).map((v) => fmt(v)).join(', ')}] = ({fr(T[i + 1][j - 1])} − {T[i][j - 1] < 0 ? `(${fr(T[i][j - 1])})` : fr(T[i][j - 1])}) / ({fmt(X[i + j])} − {X[i] < 0 ? `(${fmt(X[i])})` : fmt(X[i])}) ={' '}
                          <span className="text-sky-300">{fr(T[i][j])}</span>
                          {esFraccion(T[i][j]) && <span className="text-slate-500"> ≈ {fix(T[i][j], 4)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Seccion>

            {/* -------------------- 3. Polinomio de Newton ------------------- */}
            <Seccion num={3} titulo={`Paso 2 — Polinomio interpolador de Newton P${sub(n - 1)}(x)`}
              nota="Pₙ(x) = f[x₀] + f[x₀,x₁](x−x₀) + f[x₀,x₁,x₂](x−x₀)(x−x₁) + …  — cada grado solo añade un término">
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 overflow-x-auto">
                <div className="font-mono text-sm text-slate-100 whitespace-nowrap">
                  P{sub(n - 1)}(x) = {textoNewton(X, coef)}
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs text-slate-400 mb-2">Construcción incremental (de P₀ a P{sub(n - 1)})</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                  {coef.map((_, k) => (
                    <div key={k} className="whitespace-nowrap">
                      P{sub(k)}(x) = {k === 0 ? fr(coef[0]) : `P${sub(k - 1)}(x) ${coef[k] < 0 ? '−' : '+'} ${esFraccion(coef[k]) ? `(${fr(Math.abs(coef[k]))})` : fr(Math.abs(coef[k]))}${X.slice(0, k).map(factorX).join('')}`}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Grado nominal n − 1 = {n - 1} · grado efectivo = {gradoEfectivo}
                {gradoEfectivo < n - 1 && ' (el último coeficiente es 0: los datos pertenecen a un polinomio de menor grado)'}
              </p>
            </Seccion>

            {/* ------------------- 4. Forma estándar -------------------- */}
            <Seccion num={4} titulo={`Paso 3 — Forma estándar ${Array.from({ length: n }, (_, k) => n - 1 - k).map((i) => (i === 0 ? `a${sub(0)}` : i === 1 ? `a${sub(1)}x` : `a${sub(i)}x${sup(i)}`)).join(' + ')}`}
              nota="Se expanden los productos (x−x₀)(x−x₁)… y se agrupan los términos semejantes">
              <div className="space-y-3">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 overflow-x-auto">
                  <div className="font-mono text-base text-slate-100 whitespace-nowrap">
                    P{sub(n - 1)}(x) = {textoEstandar(estandar, 'fr')}
                  </div>
                  <div className="font-mono text-xs text-slate-400 whitespace-nowrap mt-1">
                    P{sub(n - 1)}(x) ≈ {textoEstandar(estandar, 'dec')}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[...estandar].map((a, i) => ({ a, i })).reverse().map(({ a, i }) => (
                    <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <div className="text-[11px] text-slate-500">a{sub(i)}</div>
                      <div className="font-mono text-sm text-slate-200">{fr(a)}</div>
                      {esFraccion(a) && <div className="font-mono text-[10px] text-slate-500">{fix(a, 6)}</div>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  El desarrollo algebraico completo (producto por producto) está en la sección 10, Hoja 2.
                </p>
              </div>
            </Seccion>

            {/* -------------------- 5. Interpolación -------------------- */}
            <Seccion num={5} titulo={`Paso 4 — Interpolación en x = ${fmt(xEval)}${esAct ? ` (${fmt(xEval * 100, 2)} req/s)` : ''}`}
              nota="Evaluación eficiente con la regla de Horner de Newton, y comprobación término a término">
              {evalOk ? (
                <div className="space-y-5">
                  <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
                      <div className="text-xs text-emerald-300/80 mb-1">{esAct ? `Latencia esperada a ${fmt(xEval * 100, 2)} req/s` : `Valor interpolado en x = ${fmt(xEval)}`}</div>
                      <div className="text-3xl font-bold font-mono text-emerald-200">{fix(resultado, esAct ? 2 : 4)}{esAct ? ' ms' : ''}</div>
                      <div className="text-[11px] text-slate-500 mt-1">P{sub(n - 1)}({fmt(xEval)}) = {fr(resultado)}{esFraccion(resultado) ? ` ≈ ${fix(resultado, 6)}` : ''}</div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs text-slate-400">Evaluación eficiente (regla de Horner de Newton)</div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                        {pasosHorner.map((p) => (
                          <div key={p.i} className="whitespace-nowrap">{p.texto}</div>
                        ))}
                        <div className="text-emerald-300">P{sub(n - 1)}({fmt(xEval)}) = b₀ = {fr(resultado)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-400 mb-2">Evaluación término a término de la forma de Newton</div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                      <div className="whitespace-nowrap">
                        P{sub(n - 1)}({fmt(xEval)}) = {terminosEval.map((t, k) => {
                          const fac = X.slice(0, k).map((xj) => `(${fmt(xEval)} ${xj < 0 ? '+' : '−'} ${fmt(Math.abs(xj))})`).join('')
                          const mag = esFraccion(t.c) ? `(${fr(t.c)})` : fr(t.c)
                          return `${k === 0 ? '' : ' + '}${mag}${fac}`
                        }).join('')}
                      </div>
                      <div className="whitespace-nowrap">
                        {'                '}= {terminosEval.map((t, k) => `${k === 0 ? '' : ' + '}${fr(t.valor)}`).join('')} = <span className="text-emerald-300">{fr(resultado)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Grado d</th>
                          <th className="text-left font-medium px-3 py-2">Nodos usados</th>
                          <th className="text-right font-medium px-3 py-2">Término añadido</th>
                          <th className="text-right font-medium px-3 py-2">P_d({fmt(xEval)})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porGrado.map((g) => (
                          <tr key={g.d} className={`border-t border-slate-900 ${g.d === n - 1 ? 'bg-emerald-500/10' : ''}`}>
                            <td className="px-3 py-1.5 font-mono text-slate-300">P{sub(g.d)}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-400">x{sub(0)}…x{sub(g.d)}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-slate-300">{g.d === 0 ? '—' : `+ ${fr(g.termino)}`}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fr(g.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-rose-400">Ingresa un valor numérico para el punto a interpolar.</p>
              )}
            </Seccion>

            {/* -------------------- 6. Validación teórica -------------------- */}
            <Seccion num={6} titulo="Validación teórica — el polinomio pasa por los puntos dados"
              nota="Se evalúa P(xᵢ) en cada nodo y se compara con yᵢ; además se contrasta con Lagrange (el polinomio interpolante es único)">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">i</th>
                      <th className="text-right font-medium px-3 py-2">xᵢ</th>
                      <th className="text-right font-medium px-3 py-2">yᵢ (dato)</th>
                      <th className="text-right font-medium px-3 py-2">P{sub(n - 1)}(xᵢ)</th>
                      <th className="text-right font-medium px-3 py-2">|P(xᵢ) − yᵢ|</th>
                      <th className="text-left font-medium px-3 py-2">¿Coincide?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validacion.map((v) => (
                      <tr key={v.i} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{v.i}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(v.x)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fmt(v.y)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(v.pv, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">{sci(v.dif)}</td>
                        <td className={`px-3 py-1.5 text-xs font-medium ${v.dif < 1e-8 ? 'text-emerald-400' : 'text-rose-400'}`}>{v.dif < 1e-8 ? '✓ sí' : '✗ no'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${todosPasan ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                {todosPasan
                  ? `Validado: P${sub(n - 1)}(xᵢ) = yᵢ en los ${n} puntos (diferencias del orden del error de redondeo).`
                  : 'Alguno de los puntos no coincide: revisa los datos ingresados.'}
              </div>
              {evalOk && (
                <p className="text-xs text-slate-500 mt-3">
                  Verificación cruzada con Lagrange (bucles anidados): P({fmt(xEval)}) = {fix(resultadoLagrange, 6)} · Newton: {fix(resultado, 6)} ·
                  diferencia = {sci(Math.abs(resultadoLagrange - resultado))}. Coinciden porque el polinomio interpolante de grado ≤ n−1 es único.
                </p>
              )}
            </Seccion>

            {/* -------------------- 7. Gráfica interactiva -------------------- */}
            <Seccion num={7} titulo="Aplicativo interactivo — curva de latencia y comparación de grados"
              nota="Activa o desactiva P_d para comparar el grado del polinomio en tiempo real; los puntos rojos son las mediciones">
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
                {evalOk && visibles.length > 0 && (
                  <span className="text-[11px] text-slate-500 ml-2">
                    en x = {fmt(xEval)}: {visibles.map((d) => `P${sub(d)} = ${fr(evaluar_newton(X, coef.slice(0, d + 1), xEval))}`).join(' · ')}
                  </span>
                )}
              </div>
              {fueraDeRango && (
                <p className="text-xs text-amber-400 mb-2">
                  x = {fmt(xEval)} está fuera de [{fmt(xmin)}, {fmt(xmax)}]: sería extrapolación y el resultado es poco confiable.
                </p>
              )}
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={curva} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={[xmin, xmax]} stroke="#64748b"
                    label={{ value: esAct ? 'Carga x (×100 req/s)' : 'x', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis type="number" stroke="#64748b" domain={['auto', 'auto']}
                    label={{ value: esAct ? 'Latencia y (ms)' : 'y', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                    formatter={(v) => Number(v).toFixed(3)} labelFormatter={(v) => `x = ${Number(v).toFixed(3)}`} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {grados.map((d, idx) => visibles.includes(d) && (
                    <Line key={d} type="monotone" dataKey={`p${d}`} name={`P${sub(d)}(x)`}
                      stroke={COLORES_GRADO[idx % COLORES_GRADO.length]}
                      strokeWidth={d === n - 1 ? 3 : 1.8} strokeDasharray={d === n - 1 ? undefined : '6 4'}
                      dot={false} isAnimationActive={false} />
                  ))}
                  <Scatter data={puntosNodos} dataKey="y" name="mediciones" fill="#f43f5e" shape="diamond" />
                  {evalOk && Number.isFinite(resultado) && !fueraDeRango && (
                    <ReferenceDot x={xEval} y={resultado} r={7} fill="#facc15" stroke="#0f172a" strokeWidth={2}
                      label={{ value: `(${fmt(xEval)}, ${fix(resultado, 2)})`, position: 'top', fill: '#facc15', fontSize: 11 }} />
                  )}
                  {evalOk && !fueraDeRango && <ReferenceLine x={xEval} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
                  {evalOk && Number.isFinite(resultado) && !fueraDeRango && <ReferenceLine y={resultado} stroke="#facc15" strokeDasharray="4 4" opacity={0.5} />}
                </ComposedChart>
              </ResponsiveContainer>
            </Seccion>

            {/* -------------------- 8. Error y observaciones -------------------- */}
            <Seccion num={8} titulo="Observaciones teóricas — error de interpolación y Newton-Gregory"
              nota="Según la guía teórica: Eₙ(x) = (x−x₀)…(x−xₙ)·f⁽ⁿ⁺¹⁾(ξ)/(n+1)!  — solo estimable si se conoce f(x)">
              <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                  <div className="whitespace-nowrap">
                    Polinomio nodal en x = {fmt(xEval)}: ω(x) = {X.map((xi) => `(${fmt(xEval)} ${xi < 0 ? '+' : '−'} ${fmt(Math.abs(xi))})`).join('')} = <span className="text-sky-300">{fmt(omega, 6)}</span>
                  </div>
                  <div className="whitespace-nowrap">
                    E{sub(n - 1)}({fmt(xEval)}) = ω · f{`⁽${n}⁾`}(ξ) / {n}! = ({fmt(omega, 6)} / {factN}) · f{`⁽${n}⁾`}(ξ) = <span className="text-sky-300">{fmt(omega / factN, 6)}</span> · f{`⁽${n}⁾`}(ξ)
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Los datos provienen de una tabla (no se conoce la expresión analítica de f), por lo que no se puede
                  calcular el error numérico: solo su forma. En los nodos el error es cero por construcción.
                </p>
                <p className="text-xs text-slate-400">
                  Espaciamiento entre nodos h = {pasosH.map((h) => fmt(h)).join(', ')} →{' '}
                  {equiespaciados
                    ? `nodos equiespaciados (h = ${fmt(pasosH[0])}): se podría aplicar Newton-Gregory con diferencias finitas.`
                    : 'nodos NO equiespaciados: no aplica Newton-Gregory; se usan diferencias divididas.'}
                </p>
              </div>
            </Seccion>

            {/* ----------------------- 9. Código fuente ----------------------- */}
            <Seccion num={9} titulo="Código fuente documentado"
              nota="diferencias_divididas(X, Y) y evaluar_newton(X, coef, x) — las mismas funciones que usa esta aplicación">
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
          </>
        )}

        {/* --------------- 10. Desarrollo manual (hoja bond) --------------- */}
        <Seccion num={10} titulo="Desarrollo manual completo — para copiar a hoja bond / Word"
          nota="Construcción manual teórica con los datos exactos del enunciado, dividida en 3 hojas (cada una con su botón de copiar)">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => copiarTexto(MANUAL_TODO, 'todo', setCopiado)}
              className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              {estadoCopiado('todo', 'copiar las 3 hojas')}
            </button>
            <button onClick={() => setHojaAbierta(hojaAbierta === 'todas' ? null : 'todas')}
              className="text-xs px-3 py-1.5 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10">
              {hojaAbierta === 'todas' ? 'ocultar todas' : 'ver todas'}
            </button>
          </div>
          <div className="space-y-3">
            {HOJAS.map((h) => {
              const abierta = hojaAbierta === 'todas' || hojaAbierta === h.id
              return (
                <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="text-sm text-slate-200">{h.titulo}</div>
                    <div className="flex gap-2">
                      <button onClick={() => setHojaAbierta(abierta && hojaAbierta !== 'todas' ? null : h.id)}
                        className="text-xs px-3 py-1 rounded-full border border-sky-500/30 text-sky-300 hover:bg-sky-500/10">
                        {abierta ? 'ocultar' : 'ver'}
                      </button>
                      <button onClick={() => copiarTexto(h.texto, `h${h.id}`, setCopiado)}
                        className="text-xs px-3 py-1 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                        {estadoCopiado(`h${h.id}`, `copiar hoja ${h.id}`)}
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {abierta && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }} className="overflow-hidden">
                        <pre className="text-[11px] leading-relaxed font-mono text-slate-300 border-t border-slate-800 px-4 py-3 overflow-x-auto whitespace-pre">
{h.texto}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Nota: este texto usa siempre los datos exactos del enunciado — (1,45), (2,65), (4,110), (7,220) y x = 5 —
            aunque edites los valores de la sección 1. Pégalo en Word o cópialo a mano respetando la numeración de pasos.
          </p>
        </Seccion>

      </div>
    </div>
  )
}
