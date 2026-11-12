import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

/* =========================================================================
   SESIÓN 14 · ECUACIONES DIFERENCIALES ORDINARIAS — EULER Y EULER MEJORADO
   Problema de valor inicial (PVI) de la Guía de Aprendizaje Autónomo:

        (y² − x²) dx + x·y dy = 0,      y(1) = 2

   Despejando dy/dx:   x·y·dy = (x² − y²)·dx   →   y' = f(x, y) = (x² − y²)/(x·y)

   Teoría (guía teórica, Sesión 14):
     • Forma general de los métodos de un paso (Runge-Kutta):
           nuevo valor = valor anterior + pendiente × tamaño de paso   →   y_{i+1} = y_i + φ·h
     • Euler (orden 1):            y_{j+1} = y_j + h·f(x_j, y_j)
     • Euler mejorado / Heun (orden 2) — predictor-corrector:
           z_{j+1} = y_j + h·f(x_j, y_j)                                (predictor = Euler)
           y_{j+1} = y_j + (h/2)·[ f(x_j, y_j) + f(x_{j+1}, z_{j+1}) ]  (corrector = promedio de pendientes)
     • Runge-Kutta 3: k1 = f(x,y), k2 = f(x+h/2, y+h·k1/2), k3 = f(x+h, y − h·k1 + 2h·k2),
           y_{n+1} = y_n + (h/6)(k1 + 4k2 + k3)            (error local O(h⁴), global O(h³))
     • Runge-Kutta 4: y_{i+1} = y_i + (h/6)(k1 + 2k2 + 2k3 + k4)

   Requisitos del enunciado (PDF de la actividad):
     1) Aproximar MANUALMENTE y(1.2) con h = 0.1 usando Euler y Euler mejorado.
     2) Comparar los errores relativos con relación al valor verdadero.
     3) Elaborar un software que resuelva el problema de manera automática.

   Valor verdadero (solución exacta):  y(x) = √((x⁴ + 7)/(2x²))   →   y(1.2) = 1.774980
   ========================================================================= */

/* ============================== UTILIDADES =============================== */

const SUBS = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n) => String(n).split('').map((d) => SUBS[+d] ?? d).join('')

function fmt(v, d = 6) {
  if (!Number.isFinite(v)) return '—'
  const r = Number(v.toFixed(d))
  return Object.is(r, -0) ? '0' : r.toString()
}
/* Decimal fijo con signo menos tipográfico; diminutos en notación científica */
const fix = (v, d = 6) => {
  if (!Number.isFinite(v)) return '—'
  if (v !== 0 && Math.abs(v) < 1e-6) return v.toExponential(3).replace('-', '−')
  const s = v.toFixed(d)
  return (/^-0\.0+$/.test(s) ? s.slice(1) : s).replace('-', '−')
}
/* Número entre paréntesis si es negativo:  0.1·(−1.5) */
const par = (v, d = 6) => (v < 0 ? `(${fix(v, d)})` : fix(v, d))
const pct = (v) => (Number.isFinite(v) ? `${v < 1e-4 && v > 0 ? v.toExponential(3) : v.toFixed(4)} %` : '—')

/* ------------------------------------------------------------------------
   f(x, y) a partir de un texto. Se permiten x, y, pi, e, ^ y funciones de Math.
   ------------------------------------------------------------------------ */
const PERMITIDAS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log10']

function crearFuncion(texto) {
  try {
    let e = String(texto).trim()
    if (!e) return { error: 'Escribe f(x, y).' }
    e = e.replace(/sen\(/gi, 'sin(').replace(/\bln\(/gi, 'log(').replace(/\bpi\b/gi, 'PI').replace(/\be\b/g, 'E')
    for (let k = 0; k < 6; k++) {
      const nuevo = e.replace(/([A-Za-z0-9_.]+|\([^()]*\))\s*\^\s*([A-Za-z0-9_.]+|\([^()]*\))/g, 'pow($1,$2)')
      if (nuevo === e) break
      e = nuevo
    }
    if (!/^[0-9a-zA-Z_+\-*/().,\s]*$/.test(e)) return { error: 'Hay caracteres no permitidos.' }
    const ids = e.match(/[a-zA-Z_]+[0-9]*/g) ?? []
    if (!ids.every((id) => id === 'x' || id === 'y' || id === 'PI' || id === 'E' || PERMITIDAS.includes(id))) {
      return { error: 'Usa solo x, y, pi, e y funciones como sin, cos, exp, log, sqrt, pow.' }
    }
    const fn = new Function('x', 'y', ...PERMITIDAS, 'PI', 'E', `return (${e});`)
    const mates = PERMITIDAS.map((nm) => Math[nm])
    return { f: (x, y) => fn(x, y, ...mates, Math.PI, Math.E) }
  } catch {
    return { error: 'Expresión no válida (usa * para multiplicar: 2*x*y).' }
  }
}

/* ------------------------------------------------------------------------
   ENTRADA Y VALIDACIÓN — excepción si los datos no forman una malla válida
   ------------------------------------------------------------------------ */
function validar(x0, xf, h) {
  if (![x0, xf, h].every(Number.isFinite)) throw new Error('x₀, x_f y h deben ser números.')
  if (h <= 0) throw new Error('h debe ser positivo.')
  if (xf <= x0) throw new Error('x_f debe ser mayor que x₀.')
  const n = (xf - x0) / h
  if (Math.abs(n - Math.round(n)) > 1e-9) {
    throw new Error(`(x_f − x₀)/h = ${fmt(n, 4)} no es entero: h debe dividir exactamente el intervalo.`)
  }
  if (Math.round(n) > 100000) throw new Error('Demasiados pasos (n > 100 000).')
  return Math.round(n)
}

/* Comprueba que la pendiente sea un número finito (p. ej. x·y = 0 la indefine) */
function pend(f, x, y) {
  const v = f(x, y)
  if (!Number.isFinite(v)) throw new Error(`f(${fmt(x)}, ${fmt(y)}) no está definida (división entre cero o dominio inválido).`)
  return v
}

/* ---------------------------- MÉTODOS DE UN PASO ---------------------------- */

/** Euler:  y_{j+1} = y_j + h·f(x_j, y_j) */
function euler(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const k = pend(f, x, y)
    const yn = y + h * k
    filas.push({ j, x, y, k, hk: h * k, xn: x0 + (j + 1) * h, yn })
    y = yn
  }
  return filas
}

/** Euler mejorado (Heun):  predictor z = y + h·f(x,y);  corrector y+ = y + (h/2)[f(x,y) + f(x+h, z)] */
function eulerMejorado(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const xn = x0 + (j + 1) * h
    const k1 = pend(f, x, y)
    const z = y + h * k1
    const k2 = pend(f, xn, z)
    const yn = y + (h / 2) * (k1 + k2)
    filas.push({ j, x, y, k1, z, k2, xn, yn })
    y = yn
  }
  return filas
}

/** Runge-Kutta de 3.er orden (fórmula de la guía) */
function rk3(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const k1 = pend(f, x, y)
    const k2 = pend(f, x + h / 2, y + (h / 2) * k1)
    const k3 = pend(f, x + h, y - h * k1 + 2 * h * k2)
    const yn = y + (h / 6) * (k1 + 4 * k2 + k3)
    filas.push({ j, x, y, k1, k2, k3, xn: x0 + (j + 1) * h, yn })
    y = yn
  }
  return filas
}

/** Runge-Kutta de 4.º orden (RK4 clásico) */
function rk4(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const k1 = pend(f, x, y)
    const k2 = pend(f, x + h / 2, y + (h / 2) * k1)
    const k3 = pend(f, x + h / 2, y + (h / 2) * k2)
    const k4 = pend(f, x + h, y + h * k3)
    const yn = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    filas.push({ j, x, y, k1, k2, k3, k4, xn: x0 + (j + 1) * h, yn })
    y = yn
  }
  return filas
}

/** Valor final de un método (para la tabla de convergencia) */
const yFinal = (filas, y0) => (filas.length ? filas[filas.length - 1].yn : y0)

/** Error relativo porcentual:  E_r = |V_v − V_a| / |V_v| · 100 */
const errorRelativo = (vv, va) => (vv !== 0 ? (Math.abs(vv - va) / Math.abs(vv)) * 100 : NaN)

/** Referencia numérica cuando no hay solución exacta: RK4 con 400 subpasos por cada paso h */
function referenciaRK4(f, x0, y0, h, n, m = 400) {
  const nodos = [y0]
  const curva = [{ x: x0, y: y0 }]
  let y = y0
  const hh = h / m
  for (let j = 0; j < n; j++) {
    for (let s = 0; s < m; s++) {
      const x = x0 + j * h + s * hh
      const k1 = f(x, y)
      const k2 = f(x + hh / 2, y + (hh / 2) * k1)
      const k3 = f(x + hh / 2, y + (hh / 2) * k2)
      const k4 = f(x + hh, y + hh * k3)
      y += (hh / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
      if ((s + 1) % Math.max(1, Math.floor(m / 20)) === 0) curva.push({ x: x + hh, y })
    }
    nodos.push(y)
  }
  return { nodos, curva }
}

function indicesVisibles(total) {
  if (total <= 14) return Array.from({ length: total }, (_, i) => i)
  return [0, 1, 2, 3, 4, 5, null, total - 3, total - 2, total - 1]
}

/* ====================== EJEMPLOS (actividad y guía teórica) ===================== */

const PRESETS = [
  {
    id: 'actividad', etiqueta: 'Actividad: (y² − x²)dx + xy dy = 0',
    expr: '(x^2 - y^2)/(x*y)', x0: 1, y0: 2, xf: 1.2, h: 0.1,
    exacta: (x) => Math.sqrt((x ** 4 + 7) / (2 * x * x)),
    esperado: { euler: 1.741278, heun: 1.775807 }, fuente: 'el desarrollo manual',
    nota: 'Datos de la tarea: aproximar y(1.2) con h = 0.1 por Euler y Euler mejorado, y comparar los errores relativos con el valor verdadero.',
    analitica: [
      'M = y² − x²,  N = x·y  →  ∂M/∂y = 2y ≠ ∂N/∂x = y   (no es exacta)',
      '(∂M/∂y − ∂N/∂x)/N = (2y − y)/(x·y) = 1/x   →   factor integrante μ(x) = e^(∫dx/x) = x',
      'x(y² − x²)dx + x²y dy = 0   es exacta  →  F(x, y) = x²y²/2 − x⁴/4 = C',
      'y(1) = 2:  (1)(4)/2 − 1/4 = 7/4 = C   →   x²y² = x⁴/2 + 7/2',
      'y(x) = √((x⁴ + 7)/(2x²))',
    ],
  },
  {
    id: 'gt-euler02', etiqueta: 'Guía: y\' = x + y, h = 0.2',
    expr: 'x + y', x0: 0, y0: 1, xf: 1, h: 0.2,
    exacta: (x) => 2 * Math.exp(x) - x - 1,
    esperado: { euler: 2.97664, heun: 3.40542 },
    nota: 'Ejemplo de la guía: Euler da y(1) ≈ 2.97664 (13.4 % de error) y Euler mejorado 3.40542 (0.91 %).',
    analitica: ['y\' − y = x  (lineal)  →  y = C·eˣ − x − 1,   y(0) = 1  →  C = 2', 'y(x) = 2eˣ − x − 1   →   y(1) = 2e − 2 = 3.436564'],
  },
  {
    id: 'gt-euler01', etiqueta: 'Guía: y\' = x + y, h = 0.1',
    expr: 'x + y', x0: 0, y0: 1, xf: 1, h: 0.1,
    exacta: (x) => 2 * Math.exp(x) - x - 1,
    esperado: { euler: 3.18748 },
    nota: 'Ejemplo de la guía con h = 0.1: Euler da y(1) ≈ 3.18748 (7.2 %). Ojo: en la tabla de la guía, y(0.2) = 1.28200 es una errata; el valor correcto es 1.22000 (las filas siguientes sí usan 1.22).',
    analitica: ['y(x) = 2eˣ − x − 1'],
  },
  {
    id: 'gt-ejercicio', etiqueta: 'Guía: y\' = 2xy, y(1) = 1',
    expr: '2*x*y', x0: 1, y0: 1, xf: 1.5, h: 0.1,
    exacta: (x) => Math.exp(x * x - 1),
    esperado: null,
    nota: 'Ejercicio de la guía: aproximar y(1.5) con h = 0.1 por Euler y compararlo con el valor exacto.',
    analitica: ['dy/y = 2x dx  →  ln y = x² + C,   y(1) = 1  →  C = −1', 'y(x) = e^(x² − 1)   →   y(1.5) = e^1.25 = 3.490343'],
  },
  {
    id: 'gt-exp', etiqueta: 'Guía: y\' = e^(x+y), y(1) = 0',
    expr: 'exp(x + y)', x0: 1, y0: 0, xf: 1.2, h: 0.1,
    exacta: (x) => -Math.log(1 + Math.E - Math.exp(x)),
    esperado: null,
    nota: 'Problemas de la guía: aproximar y(1.2) con h = 0.1 por Euler mejorado y por Runge-Kutta de 3.er orden (ver sección 9).',
    analitica: ['e^(−y) dy = eˣ dx  →  −e^(−y) = eˣ + C,   y(1) = 0  →  C = −1 − e', 'y(x) = −ln(1 + e − eˣ)   →   y(1.2) = 0.920889'],
  },
  {
    id: 'paracaidista', etiqueta: 'Guía: paracaidista dv/dt',
    expr: '9.8 - (12.5/68.1)*y', x0: 0, y0: 0, xf: 12, h: 2,
    exacta: (t) => ((9.8 * 68.1) / 12.5) * (1 - Math.exp((-12.5 / 68.1) * t)),
    esperado: null,
    nota: 'Modelo de la guía: dv/dt = (mg − kv)/m = g − (k/m)v con m = 68.1 kg, g = 9.8 m/s², k = 12.5 kg/s, v(0) = 0 (aquí x = t, y = v).',
    analitica: ['dv/dt + (k/m)v = g  (lineal)  →  v(t) = (gm/k)·(1 − e^(−kt/m))', 'velocidad terminal gm/k = 53.39 m/s'],
  },
  {
    id: 'custom', etiqueta: 'Función propia',
    expr: 'x - y', x0: 0, y0: 1, xf: 1, h: 0.1,
    exacta: null, esperado: null,
    nota: 'Escribe tu propia f(x, y). Como no hay fórmula exacta, el "valor verdadero" se aproxima con RK4 usando 400 subpasos por cada h.',
    analitica: null,
  },
]

/* Texto del código fuente mostrado en pantalla (mismas funciones de arriba) */
const CODIGO_JS = `/** f(x, y) del PVI:  (y² − x²)dx + xy dy = 0   →   y' = (x² − y²)/(x·y) */
const f = (x, y) => (x * x - y * y) / (x * y)

/** Solución exacta (valor verdadero):  y = √((x⁴ + 7)/(2x²)) */
const exacta = (x) => Math.sqrt((x ** 4 + 7) / (2 * x * x))

/** Entrada y validación: lanza una excepción si h no divide exactamente [x0, xf] */
function validar(x0, xf, h) {
  if (h <= 0) throw new Error('h debe ser positivo')
  if (xf <= x0) throw new Error('xf debe ser mayor que x0')
  const n = (xf - x0) / h
  if (Math.abs(n - Math.round(n)) > 1e-9) throw new Error('(xf - x0)/h no es entero')
  return Math.round(n)                                   // número de pasos
}

/** Método de Euler:  y_{j+1} = y_j + h·f(x_j, y_j) */
function euler(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const k = f(x, y)                                    // pendiente al inicio del paso
    const yn = y + h * k
    filas.push({ j, x, y, k, xn: x + h, yn })
    y = yn
  }
  return filas
}

/** Euler mejorado (Heun): predictor z con Euler y corrector con el promedio de pendientes */
function eulerMejorado(f, x0, y0, h, n) {
  const filas = []
  let y = y0
  for (let j = 0; j < n; j++) {
    const x = x0 + j * h
    const k1 = f(x, y)                                   // pendiente al inicio
    const z = y + h * k1                                 // predictor  z_{j+1}
    const k2 = f(x + h, z)                               // pendiente al final (estimada)
    const yn = y + (h / 2) * (k1 + k2)                   // corrector  y_{j+1}
    filas.push({ j, x, y, k1, z, k2, xn: x + h, yn })
    y = yn
  }
  return filas
}

/** Error relativo porcentual respecto al valor verdadero */
const errorRelativo = (vv, va) => Math.abs(vv - va) / Math.abs(vv) * 100

// ---- Ejecución con los datos de la actividad ----
const n = validar(1, 1.2, 0.1)                           // n = 2 pasos
const E = euler(f, 1, 2, 0.1, n).at(-1).yn               // 1.741278
const H = eulerMejorado(f, 1, 2, 0.1, n).at(-1).yn       // 1.775807
const V = exacta(1.2)                                    // 1.774980
console.log('Euler', E, errorRelativo(V, E).toFixed(4) + ' %')          // 1.8988 %
console.log('Euler mejorado', H, errorRelativo(V, H).toFixed(4) + ' %') // 0.0465 %`

const CODIGO_PY = `import math

def f(x, y):
    """(y^2 - x^2)dx + xy dy = 0   ->   y' = (x^2 - y^2)/(x*y)"""
    return (x**2 - y**2) / (x * y)

def exacta(x):
    """Valor verdadero: y = sqrt((x^4 + 7)/(2x^2))"""
    return math.sqrt((x**4 + 7) / (2 * x**2))

def validar(x0, xf, h):
    """Excepción si h no divide exactamente el intervalo [x0, xf]."""
    if h <= 0:
        raise ValueError("h debe ser positivo")
    if xf <= x0:
        raise ValueError("xf debe ser mayor que x0")
    n = (xf - x0) / h
    if abs(n - round(n)) > 1e-9:
        raise ValueError(f"(xf - x0)/h = {n:.4f} no es entero")
    return round(n)

def euler(f, x0, y0, h, n):
    x, y, tabla = x0, y0, [(x0, y0)]
    for _ in range(n):
        y = y + h * f(x, y)                 # y_{j+1} = y_j + h f(x_j, y_j)
        x = x + h
        tabla.append((x, y))
    return tabla

def euler_mejorado(f, x0, y0, h, n):
    x, y, tabla = x0, y0, [(x0, y0)]
    for _ in range(n):
        k1 = f(x, y)
        z = y + h * k1                      # predictor
        k2 = f(x + h, z)
        y = y + h / 2 * (k1 + k2)           # corrector
        x = x + h
        tabla.append((x, y))
    return tabla

def error_relativo(vv, va):
    return abs(vv - va) / abs(vv) * 100

x0, y0, xf, h = 1.0, 2.0, 1.2, 0.1
n = validar(x0, xf, h)
E, H = euler(f, x0, y0, h, n), euler_mejorado(f, x0, y0, h, n)
print(f"{'x':>5} {'Euler':>10} {'E. mejorado':>12} {'Exacto':>10} {'Er Euler %':>11} {'Er Heun %':>10}")
for (x, ye), (_, yh) in zip(E, H):
    v = exacta(x)
    print(f"{x:5.1f} {ye:10.6f} {yh:12.6f} {v:10.6f} {error_relativo(v, ye):11.4f} {error_relativo(v, yh):10.4f}")`

/* ====================== TEXTO DEL DESARROLLO MANUAL ===================== */

const HOJA_1 = `SESIÓN 14 — ECUACIONES DIFERENCIALES ORDINARIAS: MÉTODOS DE EULER Y EULER MEJORADO
Problema de valor inicial (PVI)

DATOS DEL PROBLEMA
   (y² − x²) dx + x·y dy = 0,        y(1) = 2
   Se pide:  aproximar y(1.2) con h = 0.1 por Euler y Euler mejorado,
             y comparar los errores relativos con el valor verdadero.

PASO 1: ESCRIBIR LA EDO EN LA FORMA  dy/dx = f(x, y)
   x·y dy = −(y² − x²) dx = (x² − y²) dx
   dy/dx = (x² − y²)/(x·y)          →   f(x, y) = (x² − y²)/(x·y)

PASO 2: MALLA DE PUNTOS
   x₀ = 1,   y₀ = 2,   h = 0.1
   n = (x_f − x₀)/h = (1.2 − 1)/0.1 = 2 pasos
   x₁ = x₀ + h = 1.1          x₂ = x₁ + h = 1.2

PASO 3: VALOR VERDADERO (solución exacta del PVI)
   M = y² − x²,   N = x·y
   ∂M/∂y = 2y   ≠   ∂N/∂x = y          →  la ecuación NO es exacta
   (∂M/∂y − ∂N/∂x)/N = (2y − y)/(x·y) = 1/x   (solo depende de x)
   Factor integrante:  μ(x) = e^(∫ dx/x) = e^(ln x) = x

   Multiplicando por x:   (x·y² − x³) dx + x²·y dy = 0
   ∂/∂y (x·y² − x³) = 2xy   =   ∂/∂x (x²·y) = 2xy     →  ahora SÍ es exacta
   F(x, y) = ∫ x²·y dy = x²y²/2 + g(x)
   ∂F/∂x = x·y² + g'(x) = x·y² − x³   →   g'(x) = −x³   →   g(x) = −x⁴/4
   Solución general:   x²y²/2 − x⁴/4 = C

   Con y(1) = 2:   (1)²(2)²/2 − (1)⁴/4 = 2 − 0.25 = 1.75 = 7/4 = C
   x²y²/2 − x⁴/4 = 7/4    →   x²y² = x⁴/2 + 7/2    →   y(x) = √( (x⁴ + 7) / (2x²) )

   Comprobación en x = 1:  y = √(8/2) = √4 = 2  ✓

   Valores verdaderos en la malla:
   y(1.1) = √( (1.4641 + 7)/(2·1.21) ) = √( 8.4641/2.42 ) = √3.497562 = 1.870177
   y(1.2) = √( (2.0736 + 7)/(2·1.44) ) = √( 9.0736/2.88 ) = √3.150556 = 1.774980`

const HOJA_2 = `MÉTODO DE EULER   (orden 1)
   Fórmula:   y_(j+1) = y_j + h·f(x_j, y_j)
   (la pendiente al INICIO del paso se usa para extrapolar en línea recta una distancia h)

PASO 1  (j = 0):   x₀ = 1,  y₀ = 2
   f(x₀, y₀) = f(1, 2) = (1² − 2²)/(1·2) = (1 − 4)/2 = −3/2 = −1.5
   y₁ = y₀ + h·f(x₀, y₀) = 2 + 0.1·(−1.5) = 2 − 0.15 = 1.850000
   →  y(1.1) ≈ 1.850000

PASO 2  (j = 1):   x₁ = 1.1,  y₁ = 1.85
   f(x₁, y₁) = f(1.1, 1.85) = (1.1² − 1.85²)/(1.1·1.85)
             = (1.21 − 3.4225)/2.035 = −2.2125/2.035 = −1.087224
   y₂ = y₁ + h·f(x₁, y₁) = 1.85 + 0.1·(−1.087224) = 1.85 − 0.108722 = 1.741278
   →  y(1.2) ≈ 1.741278

TABLA DE RESULTADOS — EULER
    j    x_j    y_j (Euler)    f(x_j, y_j)    Valor verdadero    |V_v − V_a|    E_r (%)
    0    1.0    2.000000       −1.500000       2.000000           0.000000       0.0000
    1    1.1    1.850000       −1.087224       1.870177           0.020177       1.0789
    2    1.2    1.741278          —            1.774980           0.033703       1.8988

ERROR RELATIVO EN x = 1.2
   E_r = |V_v − V_a| / |V_v| · 100 %
       = |1.774980 − 1.741278| / 1.774980 · 100 %
       = 0.033703 / 1.774980 · 100 % = 1.8988 %`

const HOJA_3 = `MÉTODO DE EULER MEJORADO (HEUN)   (orden 2)
   Predictor:   z_(j+1) = y_j + h·f(x_j, y_j)
   Corrector:   y_(j+1) = y_j + (h/2)·[ f(x_j, y_j) + f(x_(j+1), z_(j+1)) ]
   (se promedian la pendiente al inicio y la pendiente al final del paso)
   h/2 = 0.1/2 = 0.05

PASO 1  (j = 0):   x₀ = 1,  y₀ = 2,  x₁ = 1.1
   f(x₀, y₀) = f(1, 2) = −1.5
   z₁ = y₀ + h·f(x₀, y₀) = 2 + 0.1·(−1.5) = 1.85
   f(x₁, z₁) = f(1.1, 1.85) = (1.21 − 3.4225)/2.035 = −1.087224
   y₁ = 2 + 0.05·[ −1.5 + (−1.087224) ] = 2 + 0.05·(−2.587224) = 2 − 0.129361 = 1.870639
   →  y(1.1) ≈ 1.870639

PASO 2  (j = 1):   x₁ = 1.1,  y₁ = 1.870639,  x₂ = 1.2
   f(x₁, y₁) = (1.1² − 1.870639²)/(1.1·1.870639)
             = (1.21 − 3.499290)/2.057703 = −2.289290/2.057703 = −1.112546
   z₂ = y₁ + h·f(x₁, y₁) = 1.870639 + 0.1·(−1.112546) = 1.870639 − 0.111255 = 1.759384
   f(x₂, z₂) = (1.2² − 1.759384²)/(1.2·1.759384)
             = (1.44 − 3.095433)/2.111261 = −1.655433/2.111261 = −0.784097
   y₂ = 1.870639 + 0.05·[ −1.112546 + (−0.784097) ]
      = 1.870639 + 0.05·(−1.896643) = 1.870639 − 0.094832 = 1.775807
   →  y(1.2) ≈ 1.775807

TABLA DE RESULTADOS — EULER MEJORADO
    j    x_j    y_j         f(x_j,y_j)    z_(j+1)     f(x_(j+1),z_(j+1))   y_(j+1)
    0    1.0    2.000000    −1.500000     1.850000    −1.087224            1.870639
    1    1.1    1.870639    −1.112546     1.759384    −0.784097            1.775807

    x      y (E. mejorado)    Valor verdadero    |V_v − V_a|    E_r (%)
    1.0    2.000000           2.000000           0.000000       0.0000
    1.1    1.870639           1.870177           0.000462       0.0247
    1.2    1.775807           1.774980           0.000826       0.0465

ERROR RELATIVO EN x = 1.2
   E_r = |1.774980 − 1.775807| / 1.774980 · 100 % = 0.000826 / 1.774980 · 100 % = 0.0465 %`

const HOJA_4 = `COMPARACIÓN DE LOS ERRORES RELATIVOS   (valor verdadero y(1.2) = 1.774980)

    Método            y(1.2) aproximado    |V_v − V_a|    E_r (%)
    Euler             1.741278             0.033703       1.8988
    Euler mejorado    1.775807             0.000826       0.0465

    Razón de errores:  1.8988 / 0.0465 ≈ 41   →  Euler mejorado es unas 41 veces más exacto

INTERPRETACIÓN
   • Euler subestima: usa la pendiente del inicio del paso (−1.5 y −1.087) y, como la pendiente
     va aumentando (la curva se aplana), la recta queda por debajo de la solución verdadera.
   • Euler mejorado corrige promediando la pendiente inicial y la final, por eso su error es
     mucho menor (queda ligeramente por encima: 1.775807 > 1.774980).
   • Euler es de orden 1 (error global ∝ h) y Euler mejorado de orden 2 (error global ∝ h²):
     al reducir h a la mitad, el error de Euler baja a la mitad y el de Heun a la cuarta parte.

         h        Euler y(1.2)    Error Euler    Heun y(1.2)    Error Heun
         0.1      1.741278        0.033703       1.775807       8.26e−4
         0.05     1.758935        0.016046       1.775171       1.91e−4
         0.025    1.767144        0.007836       1.775026       4.60e−5

   • Como referencia (guía teórica): Runge-Kutta 3 da 1.774944 (E_r = 0.0021 %) y
     Runge-Kutta 4 da 1.774982 (E_r = 0.000065 %).

CONCLUSIÓN
   Con h = 0.1:  y(1.2) ≈ 1.741278 (Euler, E_r = 1.90 %)  y  y(1.2) ≈ 1.775807 (Euler mejorado, E_r = 0.047 %).
   El método de Euler mejorado es el más adecuado: con el mismo h y solo una evaluación más de f
   por paso, reduce el error relativo unas 41 veces.

SOFTWARE
   El programa (Sesión 14 de la app) lee f(x, y), x₀, y₀, x_f y h; valida que h divida exactamente
   el intervalo; aplica Euler y Euler mejorado paso a paso; calcula el valor verdadero y los errores
   relativos; grafica las soluciones y analiza la convergencia al reducir h.`

const HOJAS = [
  { id: 1, titulo: 'Hoja 1 — Datos, forma y\' = f(x, y), malla y valor verdadero (solución exacta)', texto: HOJA_1 },
  { id: 2, titulo: 'Hoja 2 — Método de Euler (2 pasos) y su error relativo', texto: HOJA_2 },
  { id: 3, titulo: 'Hoja 3 — Método de Euler mejorado (Heun) y su error relativo', texto: HOJA_3 },
  { id: 4, titulo: 'Hoja 4 — Comparación de errores, interpretación y conclusión', texto: HOJA_4 },
]
const MANUAL_TODO = HOJAS.map((h) => h.texto).join('\n\n──────────── (nueva hoja) ────────────\n\n')

/* ============================ TEORÍA (guía teórica) ======================== */

function DiagramaPaso() {
  return (
    <svg viewBox="0 0 320 180" className="w-full max-w-sm" role="img" aria-label="Representación gráfica de un método de un paso">
      <line x1="30" y1="155" x2="305" y2="155" stroke="#64748b" strokeWidth="1.2" />
      <line x1="30" y1="155" x2="30" y2="12" stroke="#64748b" strokeWidth="1.2" />
      <path d="M45 105 C 80 135, 120 132, 160 118 S 240 70, 285 20" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      <line x1="110" y1="128" x2="235" y2="88" stroke="#fb923c" strokeWidth="2" />
      <circle cx="122" cy="124.2" r="4.5" fill="#facc15" />
      <circle cx="235" cy="88" r="4.5" fill="#fb923c" />
      <circle cx="235" cy="67" r="4" fill="#38bdf8" />
      <line x1="122" y1="155" x2="122" y2="150" stroke="#94a3b8" />
      <line x1="235" y1="155" x2="235" y2="150" stroke="#94a3b8" />
      <text x="116" y="170" fill="#94a3b8" fontSize="11">xᵢ</text>
      <text x="226" y="170" fill="#94a3b8" fontSize="11">xᵢ₊₁</text>
      <text x="160" y="150" fill="#94a3b8" fontSize="10">h</text>
      <text x="242" y="94" fill="#fdba74" fontSize="11">yᵢ₊₁ = yᵢ + φ·h</text>
      <text x="242" y="64" fill="#7dd3fc" fontSize="11">y(xᵢ₊₁) real</text>
      <text x="128" y="142" fill="#fdba74" fontSize="10">pendiente φ</text>
      <text x="36" y="22" fill="#94a3b8" fontSize="11">y</text>
      <text x="296" y="148" fill="#94a3b8" fontSize="11">x</text>
    </svg>
  )
}

const TEORIA = [
  {
    t: '1. Modelo matemático (paracaidista)',
    l: [
      'Un paracaidista de m = 68.1 kg cae con g = 9.8 m/s² y arrastre k = 12.5 kg/s.',
      'F = m·a  →  dv/dt = F/m,   F = F_D + F_U = mg − kv',
      'dv/dt = (mg − kv)/m   ← ecuación diferencial de primer orden',
    ],
  },
  {
    t: '2. Ecuación diferencial y su orden',
    l: [
      'Contiene una función desconocida y una o más de sus derivadas.',
      'Orden = orden de la derivada más alta. Forma general: F(x, y, y′, y″, …, y⁽ⁿ⁾) = 0.',
      'Resolverla es hallar TODAS las funciones que satisfacen la igualdad.',
    ],
  },
  {
    t: '3. Problema de valor inicial (Cauchy)',
    l: [
      'y′ − 2x = 0  →  y = x² + c  (familia infinita de soluciones).',
      'La condición inicial y(t₀) = y₀ elige una sola: con y(0) = 1  →  y = x² + 1.',
      'En esta actividad: y(1) = 2.',
    ],
  },
  {
    t: '4. Métodos de un paso (Runge-Kutta)',
    l: [
      'Nuevo valor = valor anterior + pendiente × tamaño de paso:  yᵢ₊₁ = yᵢ + φ·h',
      'Todos los métodos difieren solo en cómo estiman la pendiente φ.',
      'Desarrollados por C. Runge y M. W. Kutta a inicios del siglo XX.',
    ],
  },
  {
    t: '5. Método de Euler (Euler-Cauchy, punto pendiente)',
    l: [
      'φ = f(xᵢ, yᵢ)  (primera derivada en el punto inicial)',
      'yᵢ₊₁ = yᵢ + f(xᵢ, yᵢ)·h',
      'Extrapola linealmente; orden 1 (error global ∝ h).',
    ],
  },
  {
    t: '6. Euler mejorado (Heun): predice y corrige',
    l: [
      'y₁ = y₀ + (h/2)[f(x₀, y₀) + f(x₁, y(x₁))]; y(x₁) se desconoce → se reemplaza por Euler.',
      'z_{j+1} = y_j + h·f(x_j, y_j)   (predictor)',
      'y_{j+1} = y_j + (h/2)[f(x_j, y_j) + f(x_{j+1}, z_{j+1})]   (corrector) · orden 2',
    ],
  },
  {
    t: '7. Runge-Kutta de 3.er orden',
    l: [
      'k₁ = f(xₙ, yₙ);  k₂ = f(xₙ + h/2, yₙ + (h/2)k₁);  k₃ = f(xₙ + h, yₙ − hk₁ + 2hk₂)',
      'yₙ₊₁ = yₙ + (h/6)(k₁ + 4k₂ + k₃)',
      'Error local ∝ h⁴ y global ∝ h³: buen equilibrio entre costo y exactitud.',
    ],
  },
  {
    t: '8. Runge-Kutta de 4.º orden (RK4)',
    l: [
      'k₁ = f(xᵢ, yᵢ);  k₂ = f(xᵢ + h/2, yᵢ + k₁h/2);  k₃ = f(xᵢ + h/2, yᵢ + k₂h/2);  k₄ = f(xᵢ + h, yᵢ + k₃h)',
      'yᵢ₊₁ = yᵢ + (h/6)(k₁ + 2k₂ + 2k₃ + k₄)',
      'El más usado ("el método de Runge-Kutta"); orden 4.',
    ],
  },
  {
    t: '9. Conclusión de la guía',
    l: [
      'Los métodos son consistentes y, en general, estables.',
      'Euler: orden 1 · Heun: orden 2 · Runge-Kutta: orden 4.',
      'Euler es fácil pero poco exacto; RK es exacto pero evalúa f varias veces por paso.',
    ],
  },
]

/* ============================ PIEZAS DE INTERFAZ ========================= */

const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/40 p-5'

function Seccion({ num, titulo, children, nota }) {
  return (
    <div className={CARD}>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-xs font-mono text-orange-400/80">{String(num).padStart(2, '0')}</span>
        <h2 className="font-semibold text-slate-100">{titulo}</h2>
      </div>
      {nota && <p className="text-xs text-slate-500 mb-4 ml-7">{nota}</p>}
      <div className={nota ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }
const inputCls =
  'w-28 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-sm focus:outline-none focus:border-orange-500/60'
const btnCls = 'text-xs px-3 py-1.5 rounded-full border border-orange-500/30 text-orange-300 hover:bg-orange-500/10'
const th = 'text-right font-medium px-3 py-2 whitespace-nowrap'
const td = 'px-3 py-1.5 font-mono text-right whitespace-nowrap'

async function copiarTexto(texto, clave, setCopiado) {
  try {
    await navigator.clipboard.writeText(texto)
    setCopiado(clave)
  } catch {
    setCopiado('error')
  }
  setTimeout(() => setCopiado(null), 1800)
}

function Resultado({ etiqueta, valor, error, color }) {
  const cls = color === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : color === 'sky' ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-orange-500/30 bg-orange-500/10 text-orange-200'
  return (
    <div className={`rounded-xl border px-5 py-3 ${cls}`}>
      <div className="text-xs opacity-80">{etiqueta}</div>
      <div className="text-2xl font-bold font-mono">{valor}</div>
      {error && <div className="text-xs font-mono opacity-80 mt-0.5">{error}</div>}
    </div>
  )
}

/* ============================ COMPONENTE PRINCIPAL ======================= */

export default function PracticaEDOEuler() {
  const [presetId, setPresetId] = useState('actividad')
  const [expr, setExpr] = useState(PRESETS[0].expr)
  const [x0Str, setX0Str] = useState(String(PRESETS[0].x0))
  const [y0Str, setY0Str] = useState(String(PRESETS[0].y0))
  const [xfStr, setXfStr] = useState(String(PRESETS[0].xf))
  const [hStr, setHStr] = useState(String(PRESETS[0].h))
  const [listaH, setListaH] = useState('0.1, 0.05, 0.025, 0.0125')
  const [verTeoria, setVerTeoria] = useState(true)
  const [lang, setLang] = useState('js')
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [hojaAbierta, setHojaAbierta] = useState(null)
  const [copiado, setCopiado] = useState(null)

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[PRESETS.length - 1]
  const { f, error: errFun } = crearFuncion(expr)
  const x0 = Number(x0Str)
  const y0 = Number(y0Str)
  const xf = Number(xfStr)
  const h = Number(hStr)
  const camposLlenos = [x0Str, y0Str, xfStr, hStr].every((s) => s.trim() !== '') && Number.isFinite(y0)
  const esDefecto = expr === preset.expr && x0 === preset.x0 && y0 === preset.y0 && xf === preset.xf && h === preset.h
  const exactaFn = preset.exacta && expr === preset.expr && x0 === preset.x0 && y0 === preset.y0 ? preset.exacta : null

  /* ------- validación + cálculos (cualquier excepción se muestra como error) ------- */
  let errDatos = null
  let n = 0
  let E = [], H = [], R3 = [], R4 = [], verdad = [], curvaExacta = []
  if (!errFun && camposLlenos) {
    try {
      n = validar(x0, xf, h)
      E = euler(f, x0, y0, h, n)
      H = eulerMejorado(f, x0, y0, h, n)
      try { R3 = rk3(f, x0, y0, h, n) } catch { R3 = [] }
      try { R4 = rk4(f, x0, y0, h, n) } catch { R4 = [] }
      if (exactaFn) {
        verdad = Array.from({ length: n + 1 }, (_, i) => exactaFn(x0 + i * h))
        curvaExacta = Array.from({ length: 241 }, (_, k) => {
          const x = x0 + ((xf - x0) * k) / 240
          return { x, y: exactaFn(x) }
        })
      } else {
        const m = n > 2000 ? 4 : 400
        const ref = referenciaRK4(f, x0, y0, h, n, m)
        verdad = ref.nodos
        curvaExacta = ref.curva
      }
      if (!verdad.every(Number.isFinite)) throw new Error('El valor verdadero no es finito en algún nodo.')
    } catch (e) {
      errDatos = e.message
    }
  }
  const datosOk = !errFun && camposLlenos && !errDatos

  const xs = datosOk ? Array.from({ length: n + 1 }, (_, i) => x0 + i * h) : []
  const yE = datosOk ? [y0, ...E.map((r) => r.yn)] : []
  const yH = datosOk ? [y0, ...H.map((r) => r.yn)] : []
  const yR3 = R3.length ? [y0, ...R3.map((r) => r.yn)] : []
  const yR4 = R4.length ? [y0, ...R4.map((r) => r.yn)] : []
  const V = datosOk ? verdad[n] : NaN
  const errE = datosOk ? errorRelativo(V, yE[n]) : NaN
  const errH = datosOk ? errorRelativo(V, yH[n]) : NaN
  const errR3 = yR3.length ? errorRelativo(V, yR3[n]) : NaN
  const errR4 = yR4.length ? errorRelativo(V, yR4[n]) : NaN
  const razon = errH > 0 ? errE / errH : NaN

  const okEsp = (k, val) => (datosOk && esDefecto && preset.esperado?.[k] != null ? Math.abs(val - preset.esperado[k]) < 5e-5 * Math.max(1, Math.abs(val)) : null)
  const okEuler = okEsp('euler', yE[n])
  const okHeun = okEsp('heun', yH[n])

  /* ------- convergencia ------- */
  const listaNums = listaH.split(/[ ,;]+/).filter(Boolean).map(Number).slice(0, 10)
  const filasConv = datosOk
    ? listaNums.map((hh) => {
        try {
          const nn = validar(x0, xf, hh)
          if (nn > 200000) throw new Error('demasiados pasos')
          const ye = yFinal(euler(f, x0, y0, hh, nn), y0)
          const yh = yFinal(eulerMejorado(f, x0, y0, hh, nn), y0)
          return { hh, nn, ye, yh, ee: Math.abs(V - ye), eh: Math.abs(V - yh) }
        } catch (e) {
          return { hh, err: e.message }
        }
      })
    : []
  const convOk = filasConv.filter((r) => !r.err)

  /* ------- gráfica: curva exacta + nodos de cada método ------- */
  const datosGraf = datosOk
    ? [
        ...curvaExacta.map((p) => ({ x: p.x, exacto: p.y })),
        ...(n <= 400 ? xs.map((x, i) => ({ x, euler: yE[i], heun: yH[i], rk4: yR4[i] })) : []),
      ].sort((p, q) => p.x - q.x)
    : []

  const vis = indicesVisibles(n)
  const visNodos = indicesVisibles(n + 1)

  /* ------- acciones ------- */
  const cargarPreset = (id) => {
    const p = PRESETS.find((q) => q.id === id)
    setPresetId(id); setExpr(p.expr); setX0Str(String(p.x0)); setY0Str(String(p.y0)); setXfStr(String(p.xf)); setHStr(String(p.h))
  }
  const editarExpr = (val) => { setExpr(val); if (presetId !== 'custom') setPresetId('custom') }
  const estadoCopiado = (clave, etiqueta) =>
    copiado === clave ? '✓ copiado' : copiado === 'error' ? 'no se pudo copiar' : etiqueta
  const fuente = preset.fuente ?? 'la guía'
  const marca = (ok, esperado) =>
    ok === true ? <span className="text-emerald-400"> ✓ coincide con {fuente} ({esperado})</span>
      : ok === false ? <span className="text-rose-400"> ✗ no coincide con {fuente} ({esperado})</span> : null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ---------------------------- Encabezado ---------------------------- */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-xs uppercase tracking-wide text-orange-400/80 mb-1">
            Métodos Numéricos · Sesión 14 · Ecuaciones diferenciales ordinarias
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-50">
            Problema de Valor Inicial — Métodos de Euler y Euler Mejorado
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Se resuelve el PVI (y² − x²)dx + xy dy = 0, y(1) = 2, aproximando y(1.2) con h = 0.1 por Euler y por Euler
            mejorado (Heun). Se calcula el valor verdadero con la solución exacta, se comparan los errores relativos y se
            agregan Runge-Kutta 3 y 4 de la guía teórica como referencia. Todo se recalcula en vivo.
          </p>
        </motion.div>

        {/* ------------------------- 1. Entrada y validación ------------------------- */}
        <Seccion num={1} titulo="Entrada y validación — f(x, y), condición inicial, punto final y paso h"
          nota="Por defecto: los datos de la actividad. Si h no divide exactamente [x₀, x_f] o f no está definida, la ejecución se detiene con un mensaje de error">
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Cargar ejemplo:</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((q) => (
                <button key={q.id} onClick={() => cargarPreset(q.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${presetId === q.id ? 'bg-orange-500/20 border-orange-400/50 text-orange-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60'}`}>
                  {q.etiqueta}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">{preset.nota}</p>
          </div>
          <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="space-y-3">
              <label className="text-xs text-slate-400 block">
                y′ = f(x, y) =
                <input type="text" value={expr} onChange={(e) => editarExpr(e.target.value)} spellCheck={false}
                  className="mt-1 block w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-100 text-sm focus:outline-none focus:border-orange-500/60" />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="text-xs text-slate-400">x₀
                  <input type="number" step="any" value={x0Str} onChange={(e) => setX0Str(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
                <label className="text-xs text-slate-400">y₀ = y(x₀)
                  <input type="number" step="any" value={y0Str} onChange={(e) => setY0Str(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
                <label className="text-xs text-slate-400">x_f (punto a aproximar)
                  <input type="number" step="any" value={xfStr} onChange={(e) => setXfStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
                <label className="text-xs text-slate-400">h (tamaño de paso)
                  <input type="number" step="any" value={hStr} onChange={(e) => setHStr(e.target.value)} className={`${inputCls} mt-1 block`} /></label>
              </div>
              {errFun && <p className="text-xs text-rose-400">{errFun}</p>}
              {!errFun && !camposLlenos && <p className="text-xs text-rose-400">Completa x₀, y₀, x_f y h con números.</p>}
              {errDatos && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
                  <b>Error:</b> {errDatos}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs font-mono text-slate-300 space-y-1">
              <div>PVI: y′ = f(x, y),  y({fmt(x0)}) = {fmt(y0)}</div>
              <div className="text-orange-300">n = (x_f − x₀)/h = {datosOk ? `(${fmt(xf)} − ${fmt(x0)})/${fmt(h)} = ${n}` : '—'} pasos</div>
              <div className="text-slate-500">{datosOk ? 'datos válidos ✓' : 'datos inválidos → ejecución detenida'}</div>
            </div>
          </div>
        </Seccion>

        {/* ------------------------- 2. Teoría ------------------------- */}
        <Seccion num={2} titulo="Fundamento teórico — resumen de la guía teórica (Sesión 14)"
          nota="Modelado, EDO, PVI y la familia de métodos de un paso: Euler, Euler mejorado (Heun), RK3 y RK4">
          <button onClick={() => setVerTeoria((x) => !x)} className={`${btnCls} mb-3`}>{verTeoria ? 'ocultar teoría' : 'ver teoría'}</button>
          <AnimatePresence initial={false}>
            {verTeoria && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }} className="overflow-hidden">
                <div className="grid lg:grid-cols-[1fr_340px] gap-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {TEORIA.map((c) => (
                      <div key={c.t} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <div className="text-sm text-orange-200 mb-1.5">{c.t}</div>
                        {c.l.map((l, k) => <p key={k} className="text-xs text-slate-300 leading-relaxed">{l}</p>)}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 self-start">
                    <div className="text-sm text-slate-300 mb-2">Representación gráfica (guía)</div>
                    <DiagramaPaso />
                    <p className="text-xs text-slate-500 mt-2">
                      Con la pendiente φ estimada en xᵢ se extrapola una distancia h. La diferencia entre el punto naranja y el
                      azul es el error del paso; Heun la reduce promediando la pendiente del inicio y la del final.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Seccion>

        {!datosOk && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Corrige los datos de la sección 1 para calcular.
          </div>
        )}

        {datosOk && (
          <>
            {/* ------------------- 3. Forma explícita y valor verdadero ------------------- */}
            <Seccion num={3} titulo="Paso 1 — Forma y′ = f(x, y), malla de puntos y valor verdadero"
              nota={exactaFn ? 'El valor verdadero sale de la solución exacta del PVI' : 'Sin fórmula exacta: el valor verdadero se aproxima con RK4 de paso muy fino'}>
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  {presetId === 'actividad' && esDefecto && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 font-mono text-xs text-slate-200 space-y-1 overflow-x-auto">
                      <div className="whitespace-nowrap">(y² − x²)dx + xy dy = 0</div>
                      <div className="whitespace-nowrap">xy dy = (x² − y²)dx</div>
                      <div className="whitespace-nowrap text-orange-300">y′ = f(x, y) = (x² − y²)/(x·y)</div>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
                    <div className="text-slate-500">xⱼ = x₀ + j·h,   h = {fmt(h)},   n = {n}</div>
                    {visNodos.map((i, k) => i === null
                      ? <div key={`e${k}`} className="text-slate-500">⋮</div>
                      : <div key={i} className="whitespace-nowrap">x{sub(i)} = {fmt(xs[i])}   →   valor verdadero y(x{sub(i)}) = <span className="text-sky-300">{fix(verdad[i])}</span></div>)}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">{preset.analitica && exactaFn ? 'Solución analítica (exacta)' : 'Valor de referencia numérico'}</div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-1.5 overflow-x-auto">
                    {preset.analitica && exactaFn
                      ? preset.analitica.map((l, k) => <div key={k} className="whitespace-nowrap">{l}</div>)
                      : <div>RK4 con {n > 2000 ? 4 : 400} subpasos por cada h (error despreciable frente a Euler).</div>}
                    <div className="text-sky-300 whitespace-nowrap pt-1">V_v = y({fmt(xf)}) = {fix(V)}</div>
                  </div>
                </div>
              </div>
            </Seccion>

            {/* ------------------- 4. Euler ------------------- */}
            <Seccion num={4} titulo="Paso 2 — Método de Euler:  yⱼ₊₁ = yⱼ + h·f(xⱼ, yⱼ)"
              nota="Orden 1: usa solo la pendiente al inicio de cada paso">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-2 overflow-x-auto mb-4">
                {vis.map((j, k) => j === null ? <div key={`e${k}`} className="text-slate-500">⋮</div> : (
                  <div key={j} className="whitespace-nowrap">
                    <div className="text-slate-500">j = {j}:  x{sub(j)} = {fmt(E[j].x)},  y{sub(j)} = {fix(E[j].y)}</div>
                    <div>f(x{sub(j)}, y{sub(j)}) = {fix(E[j].k)}</div>
                    <div>y{sub(j + 1)} = {fix(E[j].y)} + {fmt(h)}·{par(E[j].k)} = <span className="text-orange-300">{fix(E[j].yn)}</span>   →  y({fmt(E[j].xn)}) ≈ {fix(E[j].yn)}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">j</th>
                      <th className={th}>xⱼ</th><th className={th}>yⱼ</th><th className={th}>f(xⱼ, yⱼ)</th>
                      <th className={th}>h·f</th><th className={th}>yⱼ₊₁</th><th className={th}>Valor verdadero</th><th className={th}>E_r (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vis.map((j, k) => j === null ? (
                      <tr key={`e${k}`} className="border-t border-slate-900"><td colSpan={8} className="px-3 py-1.5 text-center text-slate-500">⋮</td></tr>
                    ) : (
                      <tr key={j} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{j}</td>
                        <td className={`${td} text-slate-300`}>{fmt(E[j].x)}</td>
                        <td className={`${td} text-slate-200`}>{fix(E[j].y)}</td>
                        <td className={`${td} text-slate-300`}>{fix(E[j].k)}</td>
                        <td className={`${td} text-slate-400`}>{fix(E[j].hk)}</td>
                        <td className={`${td} text-orange-300`}>{fix(E[j].yn)}</td>
                        <td className={`${td} text-sky-300`}>{fix(verdad[j + 1])}</td>
                        <td className={`${td} text-slate-200`}>{pct(errorRelativo(verdad[j + 1], E[j].yn))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Resultado etiqueta={`Euler: y(${fmt(xf)}) ≈`} valor={fix(yE[n])} error={`E_r = ${pct(errE)}`} color="orange" />
                <p className="text-xs text-slate-500">{marca(okEuler, preset.esperado?.euler)}</p>
              </div>
            </Seccion>

            {/* ------------------- 5. Euler mejorado ------------------- */}
            <Seccion num={5} titulo="Paso 3 — Euler mejorado (Heun): predictor zⱼ₊₁ y corrector yⱼ₊₁"
              nota="zⱼ₊₁ = yⱼ + h·f(xⱼ, yⱼ)  ·  yⱼ₊₁ = yⱼ + (h/2)·[f(xⱼ, yⱼ) + f(xⱼ₊₁, zⱼ₊₁)]  ·  orden 2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-300 space-y-2 overflow-x-auto mb-4">
                {vis.map((j, k) => j === null ? <div key={`e${k}`} className="text-slate-500">⋮</div> : (
                  <div key={j} className="whitespace-nowrap">
                    <div className="text-slate-500">j = {j}:  x{sub(j)} = {fmt(H[j].x)},  y{sub(j)} = {fix(H[j].y)},  x{sub(j + 1)} = {fmt(H[j].xn)}</div>
                    <div>f(x{sub(j)}, y{sub(j)}) = {fix(H[j].k1)}</div>
                    <div>z{sub(j + 1)} = {fix(H[j].y)} + {fmt(h)}·{par(H[j].k1)} = {fix(H[j].z)}   →   f(x{sub(j + 1)}, z{sub(j + 1)}) = {fix(H[j].k2)}</div>
                    <div>y{sub(j + 1)} = {fix(H[j].y)} + ({fmt(h)}/2)·[{fix(H[j].k1)} + {par(H[j].k2)}] = {fix(H[j].y)} + {fmt(h / 2)}·{par(H[j].k1 + H[j].k2)} = <span className="text-emerald-300">{fix(H[j].yn)}</span></div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">j</th>
                      <th className={th}>xⱼ</th><th className={th}>yⱼ</th><th className={th}>f(xⱼ, yⱼ)</th><th className={th}>zⱼ₊₁</th>
                      <th className={th}>f(xⱼ₊₁, zⱼ₊₁)</th><th className={th}>yⱼ₊₁</th><th className={th}>Valor verdadero</th><th className={th}>E_r (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vis.map((j, k) => j === null ? (
                      <tr key={`e${k}`} className="border-t border-slate-900"><td colSpan={9} className="px-3 py-1.5 text-center text-slate-500">⋮</td></tr>
                    ) : (
                      <tr key={j} className="border-t border-slate-900">
                        <td className="px-3 py-1.5 font-mono text-slate-400">{j}</td>
                        <td className={`${td} text-slate-300`}>{fmt(H[j].x)}</td>
                        <td className={`${td} text-slate-200`}>{fix(H[j].y)}</td>
                        <td className={`${td} text-slate-300`}>{fix(H[j].k1)}</td>
                        <td className={`${td} text-slate-400`}>{fix(H[j].z)}</td>
                        <td className={`${td} text-slate-300`}>{fix(H[j].k2)}</td>
                        <td className={`${td} text-emerald-300`}>{fix(H[j].yn)}</td>
                        <td className={`${td} text-sky-300`}>{fix(verdad[j + 1])}</td>
                        <td className={`${td} text-slate-200`}>{pct(errorRelativo(verdad[j + 1], H[j].yn))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Resultado etiqueta={`Euler mejorado: y(${fmt(xf)}) ≈`} valor={fix(yH[n])} error={`E_r = ${pct(errH)}`} color="emerald" />
                <p className="text-xs text-slate-500">{marca(okHeun, preset.esperado?.heun)}</p>
              </div>
            </Seccion>

            {/* ------------------- 6. Comparación de errores ------------------- */}
            <Seccion num={6} titulo="Comparación de los errores relativos con relación al valor verdadero"
              nota="E_r = |V_v − V_a| / |V_v| · 100 %   (V_v = valor verdadero, V_a = valor aproximado)">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">x</th>
                      <th className={th}>Verdadero</th><th className={th}>Euler</th><th className={th}>E_r Euler</th>
                      <th className={th}>E. mejorado</th><th className={th}>E_r E. mejorado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicesVisibles(n + 1).map((i, k) => i === null ? (
                      <tr key={`e${k}`} className="border-t border-slate-900"><td colSpan={6} className="px-3 py-1.5 text-center text-slate-500">⋮</td></tr>
                    ) : (
                      <tr key={i} className={`border-t border-slate-900 ${i === n ? 'bg-orange-500/10' : ''}`}>
                        <td className="px-3 py-1.5 font-mono text-slate-300">{fmt(xs[i])}</td>
                        <td className={`${td} text-sky-300`}>{fix(verdad[i])}</td>
                        <td className={`${td} text-orange-300`}>{fix(yE[i])}</td>
                        <td className={`${td} text-slate-200`}>{pct(errorRelativo(verdad[i], yE[i]))}</td>
                        <td className={`${td} text-emerald-300`}>{fix(yH[i])}</td>
                        <td className={`${td} text-slate-200`}>{pct(errorRelativo(verdad[i], yH[i]))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <Resultado etiqueta={`Valor verdadero y(${fmt(xf)})`} valor={fix(V)} color="sky" />
                <Resultado etiqueta="Error relativo — Euler" valor={pct(errE)} error={`|V_v − V_a| = ${fix(Math.abs(V - yE[n]))}`} color="orange" />
                <Resultado etiqueta="Error relativo — Euler mejorado" valor={pct(errH)} error={`|V_v − V_a| = ${fix(Math.abs(V - yH[n]))}`} color="emerald" />
              </div>
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
                {Number.isFinite(razon)
                  ? `Con h = ${fmt(h)}, el error relativo de Euler mejorado es unas ${fmt(razon, 1)} veces menor que el de Euler: promediar la pendiente inicial y la final corrige casi todo el error de la extrapolación lineal.`
                  : 'Euler mejorado reproduce exactamente el valor verdadero en este caso.'}
              </div>
              {(yR3.length > 0 || yR4.length > 0) && (
                <div className="mt-4 rounded-xl border border-slate-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Método (h = {fmt(h)})</th>
                        <th className={th}>Orden</th><th className={th}>Evaluaciones de f por paso</th><th className={th}>y({fmt(xf)})</th><th className={th}>E_r (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Euler', 1, 1, yE[n], errE, ''],
                        ['Euler mejorado (Heun)', 2, 2, yH[n], errH, 'bg-emerald-500/10'],
                        ['Runge-Kutta 3', 3, 3, yR3[n], errR3, ''],
                        ['Runge-Kutta 4', 4, 4, yR4[n], errR4, ''],
                      ].map(([nom, o, ev, val, er, cls]) => (
                        <tr key={nom} className={`border-t border-slate-900 ${cls}`}>
                          <td className="px-3 py-1.5 text-slate-300">{nom}</td>
                          <td className={`${td} text-slate-400`}>{o}</td>
                          <td className={`${td} text-slate-400`}>{ev}</td>
                          <td className={`${td} text-slate-200`}>{fix(val)}</td>
                          <td className={`${td} text-slate-200`}>{pct(er)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>

            {/* ------------------- 7. Gráfica ------------------- */}
            <Seccion num={7} titulo="Gráfica — solución verdadera vs. aproximaciones"
              nota="La curva azul es la solución verdadera; los puntos son los valores que calcula cada método en la malla">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={datosGraf} margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={[x0, xf]} stroke="#64748b"
                    label={{ value: 'x', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                  <YAxis type="number" stroke="#64748b" domain={['auto', 'auto']} width={78} tickFormatter={(v) => Number(v).toFixed(3)}
                    label={{ value: 'y', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }}
                    formatter={(val) => Number(val).toFixed(6)} labelFormatter={(val) => `x = ${Number(val).toFixed(4)}`} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Line type="monotone" dataKey="exacto" name="valor verdadero y(x)" stroke="#38bdf8" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="linear" dataKey="euler" name="Euler" stroke="#fb923c" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                  <Line type="linear" dataKey="heun" name="Euler mejorado" stroke="#34d399" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Seccion>

            {/* ------------------- 8. Convergencia ------------------- */}
            <Seccion num={8} titulo="Análisis de convergencia — efecto de reducir h"
              nota="Euler es de orden 1 (error ∝ h): al dividir h entre 2 el error baja ~2 veces. Heun es de orden 2 (error ∝ h²): baja ~4 veces">
              <label className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-3">
                Valores de h:
                <input type="text" value={listaH} onChange={(e) => setListaH(e.target.value)} spellCheck={false}
                  className="w-64 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-mono text-slate-100 text-xs focus:outline-none focus:border-orange-500/60" />
                <button onClick={() => setListaH('0.1, 0.05, 0.025, 0.0125')} className={btnCls}>restablecer</button>
              </label>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className={th}>h</th><th className={th}>n</th><th className={th}>Euler y({fmt(xf)})</th><th className={th}>Error Euler</th>
                      <th className={th}>razón</th><th className={th}>Heun y({fmt(xf)})</th><th className={th}>Error Heun</th><th className={th}>razón</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConv.map((r, k) => r.err ? (
                      <tr key={k} className="border-t border-slate-900">
                        <td className={`${td} text-slate-200`}>{Number.isFinite(r.hh) ? r.hh : '?'}</td>
                        <td colSpan={7} className="px-3 py-1.5 text-xs text-rose-400">{r.err}</td>
                      </tr>
                    ) : (
                      <tr key={k} className="border-t border-slate-900">
                        <td className={`${td} text-slate-200`}>{fmt(r.hh)}</td>
                        <td className={`${td} text-slate-400`}>{r.nn}</td>
                        <td className={`${td} text-orange-300`}>{fix(r.ye)}</td>
                        <td className={`${td} text-slate-200`}>{fix(r.ee)}</td>
                        <td className={`${td} text-slate-400`}>{k > 0 && !filasConv[k - 1].err && r.ee > 0 ? fmt(filasConv[k - 1].ee / r.ee, 2) : '—'}</td>
                        <td className={`${td} text-emerald-300`}>{fix(r.yh)}</td>
                        <td className={`${td} text-slate-200`}>{fix(r.eh)}</td>
                        <td className={`${td} text-slate-400`}>{k > 0 && !filasConv[k - 1].err && r.eh > 0 ? fmt(filasConv[k - 1].eh / r.eh, 2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {convOk.length > 1 && (
                <div className="mt-4">
                  <div className="text-sm text-slate-300 mb-2">Error absoluto en x = {fmt(xf)} vs. h (escala logarítmica)</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={convOk.map((r) => ({ h: r.hh, euler: Math.max(r.ee, 1e-16), heun: Math.max(r.eh, 1e-16) })).sort((p, q) => p.h - q.h)}
                      margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="h" scale="log" domain={['auto', 'auto']} stroke="#64748b"
                        label={{ value: 'h', position: 'insideBottom', dy: 14, fill: '#64748b' }} />
                      <YAxis scale="log" domain={['auto', 'auto']} stroke="#64748b" tickFormatter={(val) => Number(val).toExponential(0)} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0' }} formatter={(val) => Number(val).toExponential(3)} labelFormatter={(val) => `h = ${val}`} />
                      <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                      <Line type="monotone" dataKey="euler" name="error Euler (pendiente 1)" stroke="#fb923c" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="heun" name="error Heun (pendiente 2)" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Seccion>

            {/* ------------------- 9. Runge-Kutta 3 y 4 ------------------- */}
            <Seccion num={9} titulo="Extensión de la guía — Runge-Kutta de 3.er y 4.º orden"
              nota="La guía pide aproximar y(1.2) con h = 0.1 también por RK3 (problema y′ = e^(x+y)) y sin método fijo para este PVI">
              {R3.length === 0 || R4.length === 0 ? (
                <p className="text-xs text-rose-400">RK3/RK4 no se pueden evaluar con estos datos (f no definida en algún punto intermedio).</p>
              ) : (
                <div className="grid lg:grid-cols-2 gap-5">
                  {[
                    { nom: 'RK3', filas: R3, ks: ['k1', 'k2', 'k3'], form: 'yₙ₊₁ = yₙ + (h/6)(k₁ + 4k₂ + k₃)', y: yR3, er: errR3 },
                    { nom: 'RK4', filas: R4, ks: ['k1', 'k2', 'k3', 'k4'], form: 'yᵢ₊₁ = yᵢ + (h/6)(k₁ + 2k₂ + 2k₃ + k₄)', y: yR4, er: errR4 },
                  ].map((m) => (
                    <div key={m.nom}>
                      <div className="text-sm text-slate-300 mb-1">{m.nom}: <span className="font-mono text-xs text-slate-400">{m.form}</span></div>
                      <div className="rounded-xl border border-slate-800 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th className="text-left font-medium px-2 py-2">j</th>
                              {m.ks.map((kk) => <th key={kk} className="text-right font-medium px-2 py-2">k{sub(kk.slice(1))}</th>)}
                              <th className="text-right font-medium px-2 py-2">yⱼ₊₁</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vis.map((j, k) => j === null ? (
                              <tr key={`e${k}`} className="border-t border-slate-900"><td colSpan={m.ks.length + 2} className="px-2 py-1 text-center text-slate-500">⋮</td></tr>
                            ) : (
                              <tr key={j} className="border-t border-slate-900">
                                <td className="px-2 py-1 font-mono text-slate-400">{j}</td>
                                {m.ks.map((kk) => <td key={kk} className="px-2 py-1 font-mono text-right text-slate-300">{fix(m.filas[j][kk])}</td>)}
                                <td className="px-2 py-1 font-mono text-right text-violet-300">{fix(m.filas[j].yn)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs font-mono text-slate-400 mt-2">y({fmt(xf)}) ≈ {fix(m.y[n])} · E_r = {pct(m.er)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>

            {/* ------------------- 10. Código ------------------- */}
            <Seccion num={10} titulo="Software — código fuente documentado (JavaScript de esta app y equivalente en Python)"
              nota="Validación con excepción, Euler, Euler mejorado (predictor-corrector) y cálculo del error relativo">
              <div className="flex flex-wrap gap-2 mb-3">
                <button onClick={() => setMostrarCodigo((x) => !x)} className={btnCls}>{mostrarCodigo ? 'ocultar código' : 'ver código'}</button>
                {mostrarCodigo && (
                  <>
                    <button onClick={() => setLang('js')} className={`text-xs px-3 py-1.5 rounded-full border ${lang === 'js' ? 'bg-orange-500/20 border-orange-400/50 text-orange-200' : 'border-slate-700 text-slate-300'}`}>JavaScript</button>
                    <button onClick={() => setLang('py')} className={`text-xs px-3 py-1.5 rounded-full border ${lang === 'py' ? 'bg-orange-500/20 border-orange-400/50 text-orange-200' : 'border-slate-700 text-slate-300'}`}>Python</button>
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

        {/* --------------- 11. Desarrollo manual (hoja bond) --------------- */}
        <Seccion num={datosOk ? 11 : 3} titulo="Desarrollo manual completo — para copiar a hoja bond / Word"
          nota="Construcción manual teórica con los datos exactos de la actividad (h = 0.1, y(1.2)), dividida en 4 hojas (cada una con su botón de copiar)">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => copiarTexto(MANUAL_TODO, 'todo', setCopiado)}
              className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
              {estadoCopiado('todo', 'copiar las 4 hojas')}
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
                        className="text-xs px-3 py-1 rounded-full border border-orange-500/30 text-orange-300 hover:bg-orange-500/10">{abierta ? 'ocultar' : 'ver'}</button>
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
            Nota: este texto usa siempre los datos exactos de la actividad ((y² − x²)dx + xy dy = 0, y(1) = 2, h = 0.1),
            aunque edites los valores de la sección 1. Las últimas cifras pueden variar ±1 por redondeo de la calculadora.
          </p>
        </Seccion>

      </div>
    </div>
  )
}
