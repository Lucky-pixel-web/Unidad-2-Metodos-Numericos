import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, Area, Scatter, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

/* =========================================================================
   SESIÓN 13 · INTEGRACIÓN NUMÉRICA — REGLA DE SIMPSON 1/3 COMPUESTA
   Consumo de energía de un centro de datos

   Contexto: la potencia P(t) (kW) consumida por un conjunto de servidores
   durante 6 horas críticas es
        P(t) = 10 + 5t·sen(πt/6) + e^(0.2t),     t ∈ [0, 6]
   y el consumo total de energía (kWh) es  E = ∫₀⁶ P(t) dt.

   Teoría (guía teórica, Sesión 13):
     • Simpson 1/3 simple (n = 2, 3 puntos): ∫ f dx ≈ (h/3)[ f0 + 4 f1 + f2 ]
         (parábola que interpola 3 puntos; |E| ≤ h⁵/90 · máx|f⁗|)
     • Simpson 1/3 compuesta (n PAR, n+1 abscisas):
         ∫ f dx ≈ (h/3)[ f0 + 4f1 + 2f2 + 4f3 + … + 2f_{n−2} + 4f_{n−1} + fn ]
         |E| ≤ n·h⁵/180 · máx|f⁗| = (b − a)·h⁴/180 · M
     • Simpson 3/8 (n múltiplo de 3, 4 puntos):
         ∫ f dx ≈ (3h/8)[ f0 + 3f1 + 3f2 + 2f3 + 3f4 + 3f5 + … + fn ]
         E = −(b − a)⁵/6480 · f⁽⁴⁾(ξ)

   Requisitos del enunciado (PDF de la actividad):
     Parte 1 — Desarrollo manual (n = 6):
       1) h, tabla de evaluación t0…t6 y fórmula de Simpson 1/3 compuesta.
       2) Cota del error |E_t| ≤ (b − a)·h⁴/180 · M, con M ≈ 0.45 kW/h⁴.
     Parte 2 — Código:
       3) Entrada a, b, n y validación por excepción: n debe ser entero PAR.
       4) Cálculo optimizado con el vector de coeficientes [1,4,2,4,…,2,4,1].
       5) Bucle de convergencia para n ∈ {2, 4, 6, 12, 24}: tabla con n, h,
          valor de la integral y cota del error |E_t|.
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
   Función f(x) a partir de un texto (para "función propia" y los ejemplos).
   Se permite x (o t), pi, e, ^ y funciones de Math (sin, cos, exp, log, ...).
   ------------------------------------------------------------------------ */
const PERMITIDAS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log10']

function crearFuncion(texto) {
  try {
    let e = String(texto).trim()
    if (!e) return { error: 'Escribe una función.' }
    e = e.replace(/sen\(/gi, 'sin(').replace(/\bln\(/gi, 'log(').replace(/\bpi\b/gi, 'PI').replace(/\be\b/g, 'E')
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
   ENTRADA Y VALIDACIÓN — excepción si n no es un entero PAR
   ------------------------------------------------------------------------ */
function validar_n(n) {
  if (!Number.isInteger(n)) throw new Error('n debe ser un número entero.')
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`n = ${n} no es par: Simpson 1/3 requiere n par. Ejecución detenida.`)
  }
}

/* Vector de coeficientes de Simpson 1/3:  [1, 4, 2, 4, ..., 2, 4, 1] */
function coeficientes_simpson(n) {
  return Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2))
}

/* ------------------------------------------------------------------------
   CÁLCULO OPTIMIZADO — Simpson 1/3 compuesto con el vector de coeficientes:
   I ≈ (h/3) · (c · f(x))      (producto punto de coeficientes y valores)
   ------------------------------------------------------------------------ */
function simpson13_compuesto(f, a, b, n) {
  validar_n(n)
  const h = (b - a) / n
  const x = Array.from({ length: n + 1 }, (_, i) => a + i * h)
  const c = coeficientes_simpson(n)
  return (h / 3) * x.reduce((s, xi, i) => s + c[i] * f(xi), 0)
}

/* Simpson 3/8 compuesto (n múltiplo de 3):  (3h/8)·[1,3,3,2,3,3,2,…,3,3,1]·f */
function simpson38_compuesto(f, a, b, n) {
  const h = (b - a) / n
  let s = 0
  for (let i = 0; i <= n; i++) {
    const c = i === 0 || i === n ? 1 : i % 3 === 0 ? 2 : 3
    s += c * f(a + i * h)
  }
  return ((3 * h) / 8) * s
}

/* Trapecio compuesto (para comparar) */
function trapecio_compuesto(f, a, b, n) {
  const h = (b - a) / n
  let suma = f(a) + f(b)
  for (let i = 1; i < n; i++) suma += 2 * f(a + i * h)
  return (h / 2) * suma
}

/* Cota teórica:  |E_t| ≤ (b − a)·h⁴/180 · M   (= n·h⁵/180·M) */
const cotaSimpson = (a, b, n, M) => ((b - a) * ((b - a) / n) ** 4 / 180) * M

/* Valor de referencia numérico (Simpson, n muy grande) para "función propia" */
function simpsonReferencia(f, a, b, n = 200000) {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h)
  return (h / 3) * s
}

/* máx|f⁽⁴⁾(x)| estimado con la 4.ª diferencia central */
function maxCuartaDerivada(f, a, b) {
  const d = (b - a) / 200
  const N = 4000
  let m = 0
  for (let i = 0; i <= N; i++) {
    const x = a + 2 * d + ((b - a - 4 * d) * i) / N
    const f4 = (f(x + 2 * d) - 4 * f(x + d) + 6 * f(x) - 4 * f(x - d) + f(x - 2 * d)) / d ** 4
    if (Number.isFinite(f4)) m = Math.max(m, Math.abs(f4))
  }
  return m
}

/* n par mínimo tal que (b − a)·h⁴/180·M ≤ tol */
function nMinimo(a, b, M, tol) {
  if (!(M > 0) || !(tol > 0)) return null
  const h = (180 * tol / ((b - a) * M)) ** 0.25
  let n = Math.ceil((b - a) / h)
  if (n < 2) n = 2
  if (n % 2) n += 1
  return n
}

function indicesVisibles(total) {
  if (total <= 14) return Array.from({ length: total }, (_, i) => i)
  return [0, 1, 2, 3, 4, 5, null, total - 3, total - 2, total - 1]
}

/* ====================== EJEMPLOS (actividad y guía teórica) ===================== */

const W = Math.PI / 6
const PRESETS = [
  {
    id: 'actividad', etiqueta: 'Actividad: consumo P(t)', v: 't', unidadI: 'kWh', unidadY: 'kW',
    expr: '10 + 5*t*sin(pi*t/6) + exp(0.2*t)', a: 0, b: 6, n: 6, tol: 0.001, M: 0.45,
    F: (t) => 10 * t + 5 * (-t * Math.cos(W * t) / W + Math.sin(W * t) / (W * W)) + Math.exp(0.2 * t) / 0.2,
    esperado: 128.921195,
    nota: 'Datos de la tarea: E = ∫₀⁶ P(t) dt con Simpson 1/3 compuesto, n = 6. El enunciado da M ≈ 0.45 kW/h⁴ para la cota.',
    analitica: [
      'E = ∫₀⁶ P(t) dt = 60 + 5·∫₀⁶ t·sen(πt/6) dt + (e^1.2 − 1)/0.2',
      '∫ t·sen(ωt) dt = −t·cos(ωt)/ω + sen(ωt)/ω²,  ω = π/6  →  de 0 a 6: 6/ω = 36/π',
      'E = 60 + 180/π + (e^1.2 − 1)/0.2',
    ],
  },
  {
    id: 'gt1', etiqueta: 'Guía: 1/x en [3, 3.6] (n = 2)', v: 'x', unidadI: '', unidadY: '',
    expr: '1/x', a: 3, b: 3.6, n: 2, tol: 0.001, M: null, F: (x) => Math.log(x), esperado: 0.182323,
    nota: 'Ejemplo 1 de la guía: h = 0.3 → (0.3/3)·[1/3 + 4/3.3 + 1/3.6] = 361/1980 ≈ 0.1823.',
    analitica: ['∫₃³·⁶ (1/x) dx = ln(3.6) − ln(3) = 0.182322'],
  },
  {
    id: 'gt2', etiqueta: 'Guía: eˣ en [0, 1] (n = 2)', v: 'x', unidadI: '', unidadY: '',
    expr: 'exp(x)', a: 0, b: 1, n: 2, tol: 0.001, M: null, F: (x) => Math.exp(x), esperado: 1.718861,
    nota: 'Ejemplo 2 de la guía: h = 1/2 → (1/6)·[1 + 4(1.6487) + 2.7183] = 1.7189.',
    analitica: ['∫₀¹ eˣ dx = e − 1 = 1.718282'],
  },
  {
    id: 'gt3', etiqueta: 'Guía: eˣ·cos x en [0, 1.2] (n = 6)', v: 'x', unidadI: '', unidadY: '',
    expr: 'exp(x)*cos(x)', a: 0, b: 1.2, n: 6, tol: 0.001, M: null, F: (x) => (Math.exp(x) * (Math.sin(x) + Math.cos(x))) / 2,
    esperado: 1.648715, esperado38: 1.649,
    nota: 'Ejemplo de la guía: Simpson 1/3 con n = 6 da 1.648; Simpson 3/8 con n = 6 da 1.649.',
    analitica: ['∫ eˣ·cos x dx = eˣ·(sen x + cos x)/2  →  evaluado de 0 a 1.2'],
  },
  {
    id: 'gt4', etiqueta: 'Guía: ln x en [1, 5] (n = 10)', v: 'x', unidadI: '', unidadY: '',
    expr: 'log(x)', a: 1, b: 5, n: 10, tol: 0.001, M: null, F: (x) => x * Math.log(x) - x, esperado: 4.046953,
    nota: 'Ejemplo de la guía: h = 0.4 → A ≈ 4.047.',
    analitica: ['∫ ln x dx = x·ln x − x  →  [x ln x − x]₁⁵ = 5 ln 5 − 4 = 4.047190'],
  },
  {
    id: 'gt5', etiqueta: 'Guía: ln(x+1) en [1, 3], error < 10⁻³', v: 'x', unidadI: '', unidadY: '',
    expr: 'log(x+1)', a: 1, b: 3, n: 4, tol: 0.001, M: null, F: (x) => (x + 1) * Math.log(x + 1) - (x + 1), esperado: 2.158813,
    nota: 'Ejercicio de la guía: elegir n para que el error sea menor que 10⁻³. Con M = máx|f⁗| = 6/16 = 0.375 sale n = 4 (ver sección 8).',
    analitica: ['∫ ln(x+1) dx = (x+1)·ln(x+1) − (x+1)  →  de 1 a 3 = 2.158883'],
  },
  {
    id: 'custom', etiqueta: 'Función propia', v: 'x', unidadI: '', unidadY: '',
    expr: 'sin(x)', a: 0, b: 3.141593, n: 8, tol: 0.001, M: null, F: null, esperado: null,
    nota: 'Escribe tu propia f(x) (variable x o t). El valor de referencia se calcula numéricamente (Simpson, n = 200 000).',
    analitica: null,
  },
]

/* Texto del código fuente mostrado en pantalla (mismas funciones de arriba) */
const CODIGO_JS = `/** Entrada y validación: lanza una excepción si n no es un entero PAR */
function validar_n(n) {
  if (!Number.isInteger(n)) throw new Error('n debe ser un número entero.')
  if (n < 2 || n % 2 !== 0) {
    throw new Error('n = ' + n + ' no es par: Simpson 1/3 requiere n par. Ejecución detenida.')
  }
}

/** Vector de coeficientes de Simpson 1/3:  [1, 4, 2, 4, ..., 2, 4, 1] */
function coeficientes_simpson(n) {
  return Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2))
}

/**
 * Simpson 1/3 compuesto (cálculo optimizado con el vector de coeficientes)
 *   I ≈ (h/3) · [ f(x0) + 4f(x1) + 2f(x2) + ... + 4f(x_{n-1}) + f(xn) ],   h = (b - a)/n
 */
function simpson13_compuesto(f, a, b, n) {
  validar_n(n)                                          // excepción si n es impar
  const h = (b - a) / n
  const x = Array.from({ length: n + 1 }, (_, i) => a + i * h)
  const c = coeficientes_simpson(n)
  return (h / 3) * x.reduce((s, xi, i) => s + c[i] * f(xi), 0)   // producto punto c · f(x)
}

/** Cota teórica del error:  |E_t| <= (b - a)·h^4/180 · M,   M = máx|f''''(x)| en [a, b] */
const cotaSimpson = (a, b, n, M) => ((b - a) * ((b - a) / n) ** 4 / 180) * M

/** Análisis de convergencia para n = 2, 4, 6, 12, 24 */
function tabla_convergencia(f, a, b, M, lista = [2, 4, 6, 12, 24]) {
  return lista.map((n) => ({
    n, h: (b - a) / n, I: simpson13_compuesto(f, a, b, n), cota: cotaSimpson(a, b, n, M),
  }))
}`

const CODIGO_PY = `import numpy as np

def validar_n(n):
    """Excepción si n no es entero par (Simpson 1/3 necesita n par)."""
    if not isinstance(n, int):
        raise TypeError("n debe ser un número entero")
    if n < 2 or n % 2 != 0:
        raise ValueError(f"n = {n} no es par: Simpson 1/3 requiere n par. Ejecución detenida.")

def coeficientes_simpson(n):
    """Vector de coeficientes [1, 4, 2, 4, ..., 2, 4, 1]."""
    c = np.ones(n + 1)
    c[1:-1:2] = 4          # posiciones impares
    c[2:-1:2] = 2          # posiciones pares interiores
    return c

def simpson_13(f, a, b, n):
    validar_n(n)
    h = (b - a) / n
    x = a + h * np.arange(n + 1)
    return (h / 3) * np.dot(coeficientes_simpson(n), f(x))   # producto punto

P = lambda t: 10 + 5 * t * np.sin(np.pi * t / 6) + np.exp(0.2 * t)
M = 0.45                                                      # dato del enunciado
print("n      h        I            cota |E_t|")
for n in (2, 4, 6, 12, 24):
    h = 6 / n
    print(n, h, round(simpson_13(P, 0, 6, n), 6), (6 - 0) * h**4 / 180 * M)`

/* ====================== TEXTO DEL DESARROLLO MANUAL ===================== */

const HOJA_1 = `SESIÓN 13 — INTEGRACIÓN NUMÉRICA: REGLA DE SIMPSON 1/3 COMPUESTA
Consumo de energía de un centro de datos

DATOS DEL PROBLEMA
   Potencia consumida:  P(t) = 10 + 5t·sen(πt/6) + e^(0.2t)        [kW]
   Intervalo:           t ∈ [0, 6] horas
   Cantidad pedida:     E = ∫₀⁶ P(t) dt                             [kWh]
   Método:              Simpson 1/3 compuesto con n = 6 subintervalos  (n es par: OK)

PASO 1: ANCHO DE PASO
   h = (b − a) / n = (6 − 0) / 6 = 1 hora

PASO 2: MALLA DE PUNTOS   t_i = a + i·h
   t0 = 0,  t1 = 1,  t2 = 2,  t3 = 3,  t4 = 4,  t5 = 5,  t6 = 6

PASO 3: TABLA DE EVALUACIÓN   P(t_i)
   P(0) = 10 + 5(0)·sen(0)      + e^0   = 10 + 0 + 1                    = 11.000000
   P(1) = 10 + 5(1)·sen(π/6)    + e^0.2 = 10 + 2.500000 + 1.221403      = 13.721403
   P(2) = 10 + 5(2)·sen(π/3)    + e^0.4 = 10 + 8.660254 + 1.491825      = 20.152079
   P(3) = 10 + 5(3)·sen(π/2)    + e^0.6 = 10 + 15 + 1.822119            = 26.822119
   P(4) = 10 + 5(4)·sen(2π/3)   + e^0.8 = 10 + 17.320508 + 2.225541     = 29.546049
   P(5) = 10 + 5(5)·sen(5π/6)   + e^1.0 = 10 + 12.500000 + 2.718282     = 25.218282
   P(6) = 10 + 5(6)·sen(π)      + e^1.2 = 10 + 0 + 3.320117             = 13.320117
   (la última cifra puede variar por redondeo)

TABLA DE TRABAJO   (coeficientes de Simpson 1/3:  1, 4, 2, 4, 2, 4, 1)
    i    t_i      P(t_i)       coef      coef·P(t_i)
    0     0      11.000000     1        11.000000
    1     1      13.721403     4        54.885612
    2     2      20.152079     2        40.304158
    3     3      26.822119     4       107.288476
    4     4      29.546049     2        59.092098
    5     5      25.218282     4       100.873128
    6     6      13.320117     1        13.320117
                                         -----------
                           Σ coef·P(t_i) = 386.763589`

const HOJA_2 = `PASO 4: FÓRMULA DE SIMPSON 1/3 COMPUESTA
   I ≈ (h/3)·[ P(t0) + 4·Σ_(i=1,3,5) P(t_i) + 2·Σ_(i=2,4) P(t_i) + P(t6) ]

   Σ impares = P(1) + P(3) + P(5) = 13.721403 + 26.822119 + 25.218282 = 65.761804
   Σ pares   = P(2) + P(4)        = 20.152079 + 29.546049 = 49.698128

   I = (1/3)·[ 11.000000 + 4(65.761804) + 2(49.698128) + 13.320117 ]
     = (1/3)·[ 11.000000 + 263.047216 + 99.396256 + 13.320117 ]
     = (1/3)·( 386.763589 )
     = 128.921196  ≈ 128.9212 kWh
   (con todos los decimales de la calculadora: 128.921195)

VALOR EXACTO (solución analítica)
   E = ∫₀⁶ [ 10 + 5t·sen(πt/6) + e^(0.2t) ] dt = 60 + 5·∫₀⁶ t·sen(ωt) dt + (e^1.2 − 1)/0.2,   ω = π/6
   Por partes:  ∫ t·sen(ωt) dt = −t·cos(ωt)/ω + sen(ωt)/ω²
   Evaluado de 0 a 6:  −6·cos(π)/ω + sen(π)/ω² − 0 = 6/ω = 36/π
   E = 60 + 180/π + (e^1.2 − 1)/0.2 = 60 + 57.295780 + 11.600585 = 128.8964 kWh

ERROR REAL DE SIMPSON CON n = 6
   |E_exacto − I| = |128.896364 − 128.921195| = 0.024831 kWh   (0.0193 %)

CÁLCULO DE LA COTA SUPERIOR DEL ERROR TEÓRICO   (dato del enunciado: M ≈ 0.45 kW/h⁴)
   |E_t| ≤ (b − a)·h⁴/180 · M
         = (6 − 0)·(1)⁴/180 · 0.45
         = (6/180)·0.45 = 0.033333 · 0.45 = 0.015 kWh

   NOTA (opcional, para revisar con el docente):
   El error real (0.0248) es mayor que 0.015, así que M = 0.45 no es el máximo real de |P⁽⁴⁾(t)|.
   P⁽⁴⁾(t) = 5·[ ω⁴·t·sen(ωt) − 4ω³·cos(ωt) ] + 0.0016·e^(0.2t) tiene máx|P⁽⁴⁾| ≈ 3.4332 (en t ≈ 5.07 h),
   lo que da la cota (6/180)·3.4332 = 0.1144 kWh, que sí cubre el error real 0.0248.`

const HOJA_3 = `ANÁLISIS DE CONVERGENCIA: Simpson 1/3 compuesto   (n debe ser PAR; valor exacto E = 128.896364 kWh)

     n      h         I (kWh)        Cota |E_t| (M=0.45)    Error real
     2   3          131.608592     1.215           2.712228
     4   1.5        129.027508     0.0759375       0.131144
     6   1          128.921195     0.015           0.024831
    12   0.5        128.897878     0.0009375       0.001514
    24   0.25       128.896458     5.85937e-05     0.000094

OBSERVACIONES
   • Al aumentar n, el valor de la integral tiende al valor exacto (128.896364 kWh).
   • El error de Simpson es proporcional a h⁴: al duplicar n (h se reduce a la mitad) el error baja unas 16 veces.
     Ejemplo: de n = 12 a n = 24 el error pasa de 0.001514 a 0.000094 (÷ 16.1).
   • La cota con M = 0.45 vale 0.015·h⁴; con M = 3.4332 (máximo real) valdría 0.1144·h⁴ y sí cubre el error real en todos los casos.
   • Si n es impar (por ejemplo n = 5) el programa se detiene con un mensaje de error, porque Simpson 1/3 necesita n par.
   • Interpretación: en 6 horas el centro de datos consume aproximadamente 128.9 kWh.`

const HOJAS = [
  { id: 1, titulo: 'Hoja 1 — Datos, ancho de paso h, malla y tabla de evaluación P(tᵢ)', texto: HOJA_1 },
  { id: 2, titulo: 'Hoja 2 — Simpson 1/3 compuesto, valor exacto, error y cota teórica', texto: HOJA_2 },
  { id: 3, titulo: 'Hoja 3 — Análisis de convergencia (n = 2, 4, 6, 12, 24)', texto: HOJA_3 },
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

export default function PracticaSimpson() {
  const [presetId, setPresetId] = useState('actividad')
  const [expr, setExpr] = useState(PRESETS[0].expr)
  const [aStr, setAStr] = useState(String(PRESETS[0].a))
  const [bStr, setBStr] = useState(String(PRESETS[0].b))
  const [nStr, setNStr] = useState(String(PRESETS[0].n))
  const [listaN, setListaN] = useState('2, 4, 6, 12, 24')
  const [tolStr, setTolStr] = useState('0.001')
  const [lang, setLang] = useState('js')
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(null)
  const [copiado, setCopiado] = useState(null)

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[PRESETS.length - 1]
  const v = preset.v
  const { f, error: errFun } = crearFuncion(expr)
  const a = Number(aStr)
  const b = Number(bStr)
  const n = Number(nStr)

  /* Entrada y validación (la "excepción" del enunciado) */
  let errN = null
  try { validar_n(n) } catch (e) { errN = e.message }
  const baseOk = aStr !== '' && bStr !== '' && nStr !== '' && Number.isFinite(a) && Number.isFinite(b) && b > a
  const camposOk = baseOk && !errN && n <= 100000
  const datosOk = !!f && camposOk && [a, b, (a + b) / 2].every((x) => Number.isFinite(f(x)))
  const esDefecto = expr === preset.expr && a === preset.a && b === preset.b && n === preset.n

  /* ------- cálculos principales ------- */
  const h = datosOk ? (b - a) / n : NaN
  const nodos = datosOk ? Array.from({ length: n + 1 }, (_, i) => ({ i, t: a + i * h })) : []
  const vals = datosOk ? nodos.map((p) => f(p.t)) : []
  const coefs = datosOk ? coeficientes_simpson(n) : []
  const I = datosOk ? simpson13_compuesto(f, a, b, n) : NaN
  const sumaExtremos = datosOk ? vals[0] + vals[n] : NaN
  const sumaImpares = datosOk ? vals.reduce((s, x, i) => (i % 2 === 1 ? s + x : s), 0) : NaN
  const sumaPares = datosOk ? vals.reduce((s, x, i) => (i > 0 && i < n && i % 2 === 0 ? s + x : s), 0) : NaN
  const sumaTotal = sumaExtremos + 4 * sumaImpares + 2 * sumaPares

  const exacto = datosOk ? (preset.F ? preset.F(b) - preset.F(a) : simpsonReferencia(f, a, b)) : NaN
  const errorAbs = Math.abs(exacto - I)
  const errorPct = exacto !== 0 ? (errorAbs / Math.abs(exacto)) * 100 : NaN
  const Mest = datosOk ? maxCuartaDerivada(f, a, b) : NaN
  const Mdato = esDefecto && preset.M != null ? preset.M : null
  const cotaDato = Mdato != null ? cotaSimpson(a, b, n, Mdato) : null
  const cotaEst = datosOk ? cotaSimpson(a, b, n, Mest) : NaN
  const coincideEsperado = datosOk && esDefecto && preset.esperado != null ? Math.abs(I - preset.esperado) < 5e-4 : null

  /* convergencia */
  const listaNums = listaN.split(/[ ,;]+/).filter(Boolean).map(Number).slice(0, 10)
  const filasConv = datosOk
    ? listaNums.map((nn) => {
        let err = null
        try { validar_n(nn) } catch (e) { err = e.message }
        if (err || nn > 1000000) return { nn, err: err ?? 'n demasiado grande' }
        const Inn = simpson13_compuesto(f, a, b, nn)
        const ea = Math.abs(exacto - Inn)
        return { nn, hh: (b - a) / nn, Inn, ea, cotaD: Mdato != null ? cotaSimpson(a, b, nn, Mdato) : null, cotaE: cotaSimpson(a, b, nn, Mest) }
      })
    : []

  /* comparación de métodos */
  const It = datosOk ? trapecio_compuesto(f, a, b, n) : NaN
  const I38 = datosOk && n % 3 === 0 ? simpson38_compuesto(f, a, b, n) : null
  const pctDe = (x) => (exacto !== 0 ? (Math.abs(exacto - x) / Math.abs(exacto)) * 100 : NaN)
  const esp38Ok = datosOk && esDefecto && preset.esperado38 != null && I38 != null ? Math.abs(I38 - preset.esperado38) < 5e-4 : null

  /* n mínimo para una tolerancia */
  const tol = Number(tolStr)
  const nMinEst = datosOk ? nMinimo(a, b, Mest, tol) : null
  const nMinDato = datosOk && Mdato != null ? nMinimo(a, b, Mdato, tol) : null
  const errNMinEst = nMinEst ? Math.abs(exacto - simpson13_compuesto(f, a, b, nMinEst)) : NaN
  const errNMinDato = nMinDato ? Math.abs(exacto - simpson13_compuesto(f, a, b, nMinDato)) : NaN

  /* gráfica: curva y parábolas de Simpson por tramos de 2 subintervalos */
  const curva = datosOk
    ? Array.from({ length: 401 }, (_, k) => {
        const x = a + ((b - a) * k) / 400
        const j = Math.min(Math.floor((x - a) / (2 * h)), n / 2 - 1)
        const x0 = a + 2 * j * h
        const x1 = x0 + h
        const x2 = x0 + 2 * h
        const f0 = f(x0), f1 = f(x1), f2 = f(x2)
        const par = f0 * ((x - x1) * (x - x2)) / (2 * h * h) - f1 * ((x - x0) * (x - x2)) / (h * h) + f2 * ((x - x0) * (x - x1)) / (2 * h * h)
        return { x, fx: f(x), simp: par }
      })
    : []
  const puntosNodos = datosOk && n <= 40 ? nodos.map((p, i) => ({ x: p.t, y: vals[i] })) : []

  const vis = indicesVisibles(n + 1)
  const unidadI = preset.unidadI ? ` ${preset.unidadI}` : ''

  /* ------- acciones ------- */
  const cargarPreset = (id) => {
    const p = PRESETS.find((q) => q.id === id)
    setPresetId(id); setExpr(p.expr); setAStr(String(p.a)); setBStr(String(p.b)); setNStr(String(p.n)); setTolStr(String(p.tol))
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
            Métodos Numéricos · Sesión 13 · Integración numérica
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Consumo de Energía de un Centro de Datos — Regla de Simpson 1/3 Compuesta
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            La potencia P(t) = 10 + 5t·sen(πt/6) + e^(0.2t) kW consumida durante 6 horas se integra para obtener la
            energía total E = ∫₀⁶ P(t) dt (kWh). Simpson 1/3 aproxima la curva con parábolas (n par), por lo que es más
            exacto que el trapecio; se calcula la cota del error y se estudia la convergencia.
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada y validación ------------------------- */}
        <Seccion num={1} titulo="Entrada y validación — función, límites a, b y número de subintervalos n"
          nota="Por defecto: los datos de la actividad (n = 6). Si n es impar o no entero, la ejecución se detiene con un mensaje de error">
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
                <label className="text-xs text-slate-400">n (subintervalos, PAR)
                  <input type="number" min="2" value={nStr} onChange={(e) => setNStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
              </div>
              {errFun && <p className="text-xs text-rose-400">{errFun}</p>}
              {!errFun && baseOk && errN && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
                  <b>Error:</b> {errN}
                </div>
              )}
              {!errFun && !baseOk && <p className="text-xs text-rose-400">Revisa los datos: a &lt; b y valores numéricos.</p>}
              {!errFun && baseOk && !errN && !camposOk && <p className="text-xs text-rose-400">Usa n ≤ 100 000.</p>}
              {!errFun && camposOk && !datosOk && <p className="text-xs text-rose-400">La función no está definida (o no es finita) en el intervalo.</p>}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs font-mono text-slate-300 space-y-1">
              <div>a = {fmt(a)} · b = {fmt(b)} · n = {Number.isFinite(n) ? n : '—'}</div>
              <div className="text-rose-300">h = (b − a)/n = {datosOk ? `(${fmt(b)} − ${fmt(a)})/${n} = ${fmt(h)}` : '—'}</div>
              <div className="text-slate-500">{errN ? 'n inválido → ejecución detenida' : 'n par ✓'}</div>
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
            {/* ------------------- 2. h y malla ------------------- */}
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

            {/* ------------------- 3. Tabla y fórmula ------------------- */}
            <Seccion num={3} titulo="Paso 2 — Tabla de evaluación, vector de coeficientes y fórmula de Simpson 1/3"
              nota="Coeficientes [1, 4, 2, 4, …, 2, 4, 1]: 4 en los índices impares, 2 en los pares interiores y 1 en los extremos">
              <div className="font-mono text-xs text-slate-400 mb-3 overflow-x-auto whitespace-nowrap">
                c = [{n <= 24 ? coefs.join(', ') : `${coefs.slice(0, 7).join(', ')}, …, ${coefs.slice(-4).join(', ')}`}]
              </div>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">i</th>
                      <th className="text-right font-medium px-3 py-2">{v}ᵢ</th>
                      <th className="text-right font-medium px-3 py-2">f({v}ᵢ){preset.unidadY ? ` (${preset.unidadY})` : ''}</th>
                      <th className="text-right font-medium px-3 py-2">coef</th>
                      <th className="text-right font-medium px-3 py-2">coef·f({v}ᵢ)</th>
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
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{coefs[i]}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(coefs[i] * vals[i])}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-800 bg-slate-900/60">
                      <td colSpan={4} className="px-3 py-2 font-mono text-right text-slate-300">Σ coef·f({v}ᵢ) =</td>
                      <td className="px-3 py-2 font-mono text-right text-slate-100">{fix(sumaTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                <div className="whitespace-nowrap text-slate-500">I ≈ (h/3)·[ f(x₀) + 4·Σ(i impar) f(xᵢ) + 2·Σ(i par interior) f(xᵢ) + f(xₙ) ]</div>
                <div className="whitespace-nowrap">f(x₀) + f(xₙ) = {fix(vals[0])} + {fix(vals[n])} = {fix(sumaExtremos)}</div>
                <div className="whitespace-nowrap">Σ impares = {fix(sumaImpares)}  →  4·Σ = {fix(4 * sumaImpares)}</div>
                <div className="whitespace-nowrap">Σ pares interiores = {fix(sumaPares)}  →  2·Σ = {fix(2 * sumaPares)}</div>
                <div className="whitespace-nowrap">I_Simpson = ({fmt(h)}/3)·{fix(sumaTotal)} = <span className="text-emerald-300 text-sm">{fix(I)}{unidadI}</span></div>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 inline-block">
                <div className="text-xs text-emerald-300/80">Resultado de Simpson 1/3 compuesto (n = {n})</div>
                <div className="text-2xl font-bold font-mono text-emerald-200">{fix(I)}{unidadI}</div>
              </div>
            </Seccion>

            {/* ------------------- 4. Valor exacto, error y cota ------------------- */}
            <Seccion num={4} titulo="Valor exacto, error real y cota superior del error teórico"
              nota="|E_t| ≤ (b − a)·h⁴/180 · M,   M = máx|f⁽⁴⁾(x)| en [a, b]  (equivale a n·h⁵/180·M)">
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <div className="text-xs text-slate-400">{preset.analitica ? 'Solución analítica' : 'Valor de referencia numérico (Simpson, n = 200 000)'}</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    {preset.analitica && preset.analitica.map((l, k) => <div key={k} className="whitespace-nowrap">{l}</div>)}
                    <div className="text-sky-300 whitespace-nowrap">I_exacto = {fix(exacto)}{unidadI}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <div className="text-[11px] text-slate-500">Error absoluto real</div>
                      <div className="font-mono text-sm text-slate-100">{fix(errorAbs)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <div className="text-[11px] text-slate-500">Error relativo (%)</div>
                      <div className="font-mono text-sm text-slate-100">{fix(errorPct)} %</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {Mdato != null && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                      <div className="text-rose-300">Con el dato del enunciado: M ≈ {Mdato}</div>
                      <div className="whitespace-nowrap">|E_t| ≤ ({fmt(b)} − {fmt(a)})·({fmt(h)})⁴/180 · {Mdato}</div>
                      <div className="whitespace-nowrap">= {fix((b - a) * h ** 4 / 180, 6)} · {Mdato} = <span className="text-rose-200 text-sm">{fix(cotaDato)}</span></div>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    <div className="text-sky-300">Con M estimado numéricamente: máx|f⁽⁴⁾| ≈ {fix(Mest, 4)}</div>
                    <div className="whitespace-nowrap">|E_t| ≤ ({fmt(b)} − {fmt(a)})·({fmt(h)})⁴/180 · {fix(Mest, 4)} = <span className="text-sky-200 text-sm">{fix(cotaEst)}</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {Mdato != null && (
                  <div className={`rounded-xl border px-4 py-2.5 text-sm ${errorAbs <= cotaDato * (1 + 1e-6) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {errorAbs <= cotaDato * (1 + 1e-6)
                      ? `El error real (${fix(errorAbs)}) cumple la cota con M = ${Mdato}.`
                      : `Atención: el error real (${fix(errorAbs)}) es MAYOR que la cota con M = ${Mdato} (${fix(cotaDato)}). El M del enunciado no es el máximo real de |f⁽⁴⁾|; con el M estimado (${fix(Mest, 4)}) la cota sí lo cubre.`}
                  </div>
                )}
                <div className={`rounded-xl border px-4 py-2.5 text-sm ${errorAbs <= cotaEst * (1 + 1e-6) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  {errorAbs <= cotaEst * (1 + 1e-6)
                    ? `El error real (${fix(errorAbs)}) cumple la cota con M estimado (${fix(cotaEst)}).`
                    : 'El error real supera la cota estimada (puede deberse a la estimación numérica de f⁽⁴⁾).'}
                </div>
              </div>
            </Seccion>

            {/* ------------------- 5. Gráfica ------------------- */}
            <Seccion num={5} titulo="Gráfica — función y parábolas de Simpson"
              nota="Cada par de subintervalos se aproxima con una parábola que pasa por 3 puntos de la malla; la zona sombreada es el área que integra Simpson 1/3">
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
                  <Area type="monotone" dataKey="simp" name={`parábolas de Simpson (n = ${n})`} stroke="#fb7185" strokeWidth={1.5} fill="#fb7185" fillOpacity={0.18} isAnimationActive={false} dot={false} />
                  <Line type="monotone" dataKey="fx" name={`f(${v})`} stroke="#38bdf8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  {puntosNodos.length > 0 && <Scatter data={puntosNodos} dataKey="y" name={`nodos ${v}ᵢ`} fill="#facc15" shape="circle" />}
                  {n <= 40 && nodos.map((p) => <ReferenceLine key={p.i} x={p.t} stroke="#64748b" strokeDasharray="3 3" opacity={0.5} />)}
                </ComposedChart>
              </ResponsiveContainer>
            </Seccion>

            {/* ------------------- 6. Convergencia ------------------- */}
            <Seccion num={6} titulo="Análisis de convergencia — n, h, valor de la integral y cota del error |E_t|"
              nota="Requisito de la actividad: n ∈ {2, 4, 6, 12, 24} (puedes editar la lista; los valores impares se rechazan)">
              <label className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-3">
                Valores de n:
                <input type="text" value={listaN} onChange={(e) => setListaN(e.target.value)} spellCheck={false}
                  className="w-64 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-xs focus:outline-none focus:border-rose-500/60" />
                <button onClick={() => setListaN('2, 4, 6, 12, 24')} className={btnCls}>restablecer</button>
              </label>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-right font-medium px-3 py-2">n</th>
                      <th className="text-right font-medium px-3 py-2">h</th>
                      <th className="text-right font-medium px-3 py-2">I (Simpson 1/3)</th>
                      {Mdato != null && <th className="text-right font-medium px-3 py-2">Cota |E_t| (M = {Mdato})</th>}
                      <th className="text-right font-medium px-3 py-2">Cota |E_t| (M estimado)</th>
                      <th className="text-right font-medium px-3 py-2">Error real</th>
                      <th className="text-right font-medium px-3 py-2">E(prev)/E</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConv.map((r, k) => r.err ? (
                      <tr key={k} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{Number.isFinite(r.nn) ? r.nn : '?'}</td>
                        <td colSpan={Mdato != null ? 6 : 5} className="px-3 py-1.5 text-xs text-rose-400">{r.err}</td>
                      </tr>
                    ) : (
                      <tr key={k} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-right text-slate-200">{r.nn}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">{fmt(r.hh, 6)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-sky-300">{fix(r.Inn)}</td>
                        {Mdato != null && <td className="px-3 py-1.5 font-mono text-right text-rose-300">{fix(r.cotaD)}</td>}
                        <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(r.cotaE)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-100">{fix(r.ea)}</td>
                        <td className="px-3 py-1.5 font-mono text-right text-slate-400">
                          {k > 0 && !filasConv[k - 1].err && r.ea > 0 ? fmt(filasConv[k - 1].ea / r.ea, 2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                El error de Simpson es proporcional a h⁴: al duplicar n (h a la mitad) el error baja unas 16 veces. Valor exacto de referencia: {fix(exacto)}.
              </p>
              {filasConv.filter((r) => !r.err).length > 1 && (
                <div className="mt-4">
                  <div className="text-sm text-slate-300 mb-2">Error real vs. n (escala logarítmica)</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={filasConv.filter((r) => !r.err).map((r) => ({ n: r.nn, error: Math.max(r.ea, 1e-16) })).sort((p, q) => p.n - q.n)} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="n" scale="log" domain={['auto', 'auto']} stroke="#64748b"
                        label={{ value: 'n (subintervalos)', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                      <YAxis scale="log" domain={['auto', 'auto']} stroke="#64748b" tickFormatter={(val) => Number(val).toExponential(0)} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }} formatter={(val) => Number(val).toExponential(3)} labelFormatter={(val) => `n = ${val}`} />
                      <Line type="monotone" dataKey="error" name="error real" stroke="#fb7185" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Seccion>

            {/* ------------------- 7. Comparación de métodos ------------------- */}
            <Seccion num={7} titulo="Comparación — trapecio, Simpson 1/3 y Simpson 3/8 (mismo n)"
              nota="Simpson 1/3 necesita n par; Simpson 3/8 necesita n múltiplo de 3 (en la guía: 3/8 es útil cuando el número de segmentos es impar)">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Método (n = {n})</th>
                      <th className="text-right font-medium px-3 py-2">Valor</th>
                      <th className="text-right font-medium px-3 py-2">Error absoluto</th>
                      <th className="text-right font-medium px-3 py-2">% de error</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-900">
                      <td className="px-3 py-1.5 text-slate-300">Trapecio compuesto</td>
                      <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(It)}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(Math.abs(exacto - It))}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(pctDe(It))} %</td>
                    </tr>
                    <tr className="border-t border-slate-900 bg-emerald-500/10">
                      <td className="px-3 py-1.5 text-slate-200">Simpson 1/3 compuesto</td>
                      <td className="px-3 py-1.5 font-mono text-right text-emerald-200">{fix(I)}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(errorAbs)}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(errorPct)} %</td>
                    </tr>
                    <tr className="border-t border-slate-900">
                      <td className="px-3 py-1.5 text-slate-300">Simpson 3/8 compuesto</td>
                      {I38 != null ? (
                        <>
                          <td className="px-3 py-1.5 font-mono text-right text-slate-200">{fix(I38)}</td>
                          <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(Math.abs(exacto - I38))}</td>
                          <td className="px-3 py-1.5 font-mono text-right text-slate-300">{fix(pctDe(I38))} %</td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-3 py-1.5 text-xs text-slate-500">no aplica: n debe ser múltiplo de 3</td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
              {esp38Ok === true && <p className="text-xs text-emerald-400 mt-2">✓ Simpson 3/8 coincide con el ejemplo de la guía ({preset.esperado38}).</p>}
              <p className="text-xs text-slate-500 mt-2">
                Fórmulas: 3/8 → (3h/8)·[f₀ + 3f₁ + 3f₂ + 2f₃ + 3f₄ + 3f₅ + … + fₙ]. Error simple de 3/8: E = −(b − a)⁵/6480 · f⁽⁴⁾(ξ).
              </p>
            </Seccion>

            {/* ------------------- 8. n mínimo ------------------- */}
            <Seccion num={8} titulo="Elegir n para una tolerancia (ejercicio de la guía: error inferior a 10⁻³)"
              nota="Se despeja n de (b − a)·h⁴/180·M ≤ tolerancia y se toma el menor n PAR que lo cumple">
              <label className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-3">
                Tolerancia:
                <input type="number" step="any" value={tolStr} onChange={(e) => setTolStr(e.target.value)} className={inputCls} />
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <div className="text-xs text-slate-500">Con M estimado ({fix(Mest, 4)})</div>
                  <div className="font-mono text-lg text-slate-100">n mínimo = {nMinEst ?? '—'}</div>
                  {nMinEst && <div className="font-mono text-xs text-slate-400">error real con ese n: {fix(errNMinEst)} {errNMinEst <= tol ? '✓ ≤ tolerancia' : '✗ supera la tolerancia'}</div>}
                </div>
                {Mdato != null && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                    <div className="text-xs text-slate-500">Con M del enunciado ({Mdato})</div>
                    <div className="font-mono text-lg text-slate-100">n mínimo = {nMinDato ?? '—'}</div>
                    {nMinDato && <div className="font-mono text-xs text-slate-400">error real con ese n: {fix(errNMinDato)} {errNMinDato <= tol ? '✓ ≤ tolerancia' : '✗ supera la tolerancia'}</div>}
                  </div>
                )}
              </div>
            </Seccion>

            {/* ------------------- 9. Código ------------------- */}
            <Seccion num={9} titulo="Código fuente documentado (JavaScript de esta app y equivalente en Python)"
              nota="Validación con excepción, vector de coeficientes [1,4,2,…,4,1], Simpson 1/3 compuesto y bucle de convergencia">
              <div className="flex flex-wrap gap-2 mb-3">
                <button onClick={() => setMostrarCodigo((x) => !x)} className={btnCls}>{mostrarCodigo ? 'ocultar código' : 'ver código'}</button>
                {mostrarCodigo && (
                  <>
                    <button onClick={() => setLang('js')} className={`text-xs px-3 py-1.5 rounded-full border ${lang === 'js' ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'border-slate-700 text-slate-300'}`}>JavaScript</button>
                    <button onClick={() => setLang('py')} className={`text-xs px-3 py-1.5 rounded-full border ${lang === 'py' ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'border-slate-700 text-slate-300'}`}>Python</button>
                    <button onClick={() => copiarTexto(lang === 'js' ? CODIGO_JS : CODIGO_PY, 'codigo', setCopiado)}
                      className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">{estadoCopiado('codigo', 'copiar código')}</button>
                  </>
                )}
              </div>
              <AnimatePresence>
                {mostrarCodigo && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }} className="overflow-hidden">
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950/70 border border-slate-800 rounded-xl p-4 overflow-x-auto leading-relaxed">
{lang === 'js' ? CODIGO_JS : CODIGO_PY}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </Seccion>
          </>
        )}

        {/* --------------- 10. Desarrollo manual (hoja bond) --------------- */}
        <Seccion num={datosOk ? 10 : 2} titulo="Desarrollo manual completo — para copiar a hoja bond / Word"
          nota="Desarrollo manual teórico con los datos exactos de la actividad (n = 6), dividido en 3 hojas (cada una con su botón de copiar)">
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
            Nota: este texto usa siempre los datos exactos de la actividad (P(t), [0, 6], n = 6, M ≈ 0.45 y la lista de n pedida),
            aunque edites los valores de la sección 1.
          </p>
        </Seccion>

      </div>
    </div>
  )
}
