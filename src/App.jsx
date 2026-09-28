import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import upeuLogo from './assets/upeu-logo.png'

import BisecProblema1 from './Bisec_Problema1'
import BisecProblema2 from './Bisec_Problema2'
import PuntoFijoProblema from './Problema1_PuntoFijo'
import NewtonProblema from './Problema2_Newton'
import SecanteProblema from './Problema3_Secante'
import MullerProblema from './Muller_Problema'
import ExamenP3 from './Examen_P3_FalsaPosicion_Cubica'
import ExamenP4 from './Examen_P4_PuntoFijo_Cubica'
import ExamenP5 from './Examen_P5_FalsaPosicion_Coseno'
import ExamenP6 from './Examen_P6_Muller_Cuartica'
import PracticaLU from './Practica_BalanceoCarga_LU'
import PracticaJacobi from './Practica_BalanceoCarga_Jacobi'

/* ============ Iconos (SVG minimalistas, sin dependencias externas) ============ */
const Icon = {
  bisec: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  open: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 20 20 4M4 4l7 0M4 4l0 7M20 20l-7 0M20 20l0-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  poly: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 17c2-8 4-12 6-12s2 6 4 6 2-9 5-9M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  home: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 11.5 12 4l9 7.5M5 10v9h5v-5h4v5h5v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  menu: (p) => (
  <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
),
matrix: (p) => (
  <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 4h16v16H4z M4 10h16M4 16h16M10 4v16M16 4v16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
),
}

const THEME = {
  cyan: { text: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-400/30', dot: 'bg-cyan-400' },
  violet: { text: 'text-violet-300', bg: 'bg-violet-500/15', border: 'border-violet-400/30', dot: 'bg-violet-400' },
  amber: { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-400/30', dot: 'bg-amber-400' },
  rose: { text: 'text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-400/30', dot: 'bg-rose-400' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-400/30', dot: 'bg-emerald-400' },
}

const MODULES = [
  {
    id: 'bisec',
    name: 'Métodos de Intervalo Cerrado',
    subtitle: 'Bisección · Falsa Posición',
    color: 'cyan',
    icon: Icon.bisec,
    problems: [
      { id: 'bisec-1', label: 'Problema 1', desc: 'Bisección — dimensionamiento de un enlace de red', Component: BisecProblema1 },
      { id: 'bisec-2', label: 'Problema 2', desc: 'Falsa posición — equilibrio en migración a la nube', Component: BisecProblema2 },
    ],
  },
  {
    id: 'gaa',
    name: 'Métodos Abiertos',
    subtitle: 'Punto Fijo · Newton-Raphson · Secante',
    color: 'violet',
    icon: Icon.open,
    problems: [
      { id: 'gaa-1', label: 'Problema 1', desc: 'Punto fijo — control de temperatura en un datacenter', Component: PuntoFijoProblema },
      { id: 'gaa-2', label: 'Problema 2', desc: 'Newton-Raphson — dimensionamiento de almacenamiento', Component: NewtonProblema },
      { id: 'gaa-3', label: 'Problema 3', desc: 'Secante — optimización de un servidor', Component: SecanteProblema },
    ],
  },
  {
    id: 'muller',
    name: 'Raíces de Polinomios',
    subtitle: 'Descartes · Lagrange · Método de Müller',
    color: 'amber',
    icon: Icon.poly,
    problems: [
      { id: 'muller-1', label: 'Sesión 4', desc: 'Estabilidad de un filtro digital IIR', Component: MullerProblema },
    ],
  },
  {
    id: 'sel',
    name: 'Sistemas de Ecuaciones Lineales',
    subtitle: 'Factorización LU · Método de Jacobi',
    color: 'emerald',
    icon: Icon.matrix,
    problems: [
      { id: 'sel-1', label: 'Sesión 6', desc: 'Balanceo de carga en clústers — factorización LU', Component: PracticaLU },
      { id: 'sel-2', label: 'Sesión 7', desc: 'Balance de carga en un clúster de 4 nodos — método de Jacobi', Component: PracticaJacobi },
    ],
  },
  {
    id: 'examen',
    name: 'Examen',
    subtitle: 'Falsa Posición · Punto Fijo · Müller',
    color: 'rose',
    icon: Icon.open,
    problems: [
      { id: 'examen-3', label: 'Problema 3', desc: 'Falsa posición — x³ − 5x − 3 = 0', Component: ExamenP3 },
      { id: 'examen-4', label: 'Problema 4', desc: 'Punto fijo — x³ − 3x + 1 = 0', Component: ExamenP4 },
      { id: 'examen-5', label: 'Problema 5', desc: 'Falsa posición — 2cos(x) − x/2 = 0', Component: ExamenP5 },
      { id: 'examen-6', label: 'Problema 6', desc: 'Müller — x⁴ − 4x³ − 19x² + 106x − 120', Component: ExamenP6 },
    ],
  },
]

const ALL_PROBLEMS = MODULES.flatMap(m => m.problems.map(p => ({ ...p, moduleId: m.id, moduleName: m.name, color: m.color })))

function SidebarItem({ problem, active, onSelect, theme }) {
  return (
    <button
      onClick={() => onSelect(problem.id)}
      className={`group relative w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? `${theme.bg} ${theme.text}` : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
    >
      {active && (
        <motion.span layoutId="active-pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className={`absolute inset-0 rounded-xl border ${theme.border}`} />
      )}
      <span className="relative flex flex-col">
        <span className="text-sm font-medium flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${active ? theme.dot : 'bg-slate-600 group-hover:bg-slate-400'}`} />
          {problem.label}
        </span>
        <span className="text-[11px] text-slate-500 ml-3.5 leading-tight mt-0.5">{problem.desc}</span>
      </span>
    </button>
  )
}

function ModuleGroup({ mod, expanded, onToggle, activeId, onSelect }) {
  const theme = THEME[mod.color]
  const ModIcon = mod.icon
  const hasActive = mod.problems.some(p => p.id === activeId)
  return (
    <div className="mb-2">
      <button onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${hasActive ? theme.bg : 'hover:bg-white/5'}`}>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.bg} ${theme.text} border ${theme.border}`}>
          <ModIcon className="w-4 h-4" />
        </span>
        <span className="flex-1 text-left">
          <span className={`block text-sm font-semibold ${hasActive ? theme.text : 'text-slate-200'}`}>{mod.name}</span>
          <span className="block text-[11px] text-slate-500">{mod.subtitle}</span>
        </span>
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-slate-500">
          <Icon.chevron className="w-4 h-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden">
            <div className="pl-2 pt-1.5 pb-1 space-y-1">
              {mod.problems.map(p => (
                <SidebarItem key={p.id} problem={p} active={p.id === activeId} onSelect={onSelect} theme={theme} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Sidebar({ activeId, onSelect, expandedIds, onToggleModule, mobileOpen, setMobileOpen, onGoHome }) {
  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/60 z-30 lg:hidden" />
        )}
      </AnimatePresence>
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-[280px] shrink-0 z-40 bg-[#0a0e1a] border-r border-white/10 flex flex-col
          transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-slate-900 shrink-0">
            <img src={upeuLogo} alt="UPeU" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Métodos Numéricos</p>
            <p className="text-[11px] text-slate-500 truncate">Guías de Aprendizaje Autónomo</p>
          </div>
        </div>

        <button onClick={onGoHome}
          className={`mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${activeId === null ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
          <Icon.home className="w-4 h-4" /> Inicio
        </button>

        <div className="flex-1 overflow-y-auto px-4 py-4 sidebar-scroll">
          <p className="px-3 text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-2">Módulos desarrollados</p>
          {MODULES.map(mod => (
            <ModuleGroup key={mod.id} mod={mod} expanded={expandedIds.includes(mod.id)}
              onToggle={() => onToggleModule(mod.id)} activeId={activeId} onSelect={onSelect} />
          ))}
        </div>

        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[11px] text-slate-500">Docente: Jorge Luis Manrique Plasencia</p>
          <p className="text-[11px] text-slate-600">Universidad Peruana Unión</p>
        </div>
      </aside>
    </>
  )
}

function LiveClock() {
  return (
    <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      Cálculo en tiempo real
    </span>
  )
}

function Topbar({ moduleName, problemLabel, onMenu }) {
  return (
    <div className="sticky top-0 z-20 backdrop-blur-lg bg-[#05070d]/80 border-b border-white/10">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onMenu} className="lg:hidden text-slate-300 p-1.5 rounded-lg hover:bg-white/10">
            <Icon.menu className="w-5 h-5" />
          </button>
          <div className="text-sm text-slate-400 truncate">
            {moduleName ? (
              <span><span className="text-slate-500">{moduleName}</span> <span className="mx-1.5 text-slate-700">/</span> <span className="text-slate-200 font-medium">{problemLabel}</span></span>
            ) : <span className="text-slate-200 font-medium">Panel de inicio</span>}
          </div>
        </div>
        <LiveClock />
      </div>
    </div>
  )
}

function StatCard({ mod, count, onOpen }) {
  const theme = THEME[mod.color]
  const ModIcon = mod.icon
  return (
    <motion.button whileHover={{ y: -4 }} onClick={onOpen}
      className="text-left backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors relative overflow-hidden group">
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 ${theme.bg}`} />
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${theme.bg} ${theme.text} border ${theme.border} mb-4`}>
        <ModIcon className="w-5 h-5" />
      </span>
      <p className="text-white font-semibold">{mod.name}</p>
      <p className="text-slate-500 text-xs mt-1">{mod.subtitle}</p>
      <div className="flex items-end justify-between mt-5">
        <p className={`text-3xl font-bold ${theme.text}`}>{count}</p>
        <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors">Ver problemas →</span>
      </div>
    </motion.button>
  )
}

function Home({ onOpenModule, onOpenProblem }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
      className="max-w-[1400px] mx-auto p-6 md:p-10">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-md bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 rounded-2xl p-8 mb-8">
        <p className="text-slate-500 text-sm mb-2">Bienvenido</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white">Curso de Métodos Numéricos</h1>
        <p className="text-slate-400 mt-3 max-w-2xl text-sm leading-relaxed">
          Este panel reúne, en un solo lugar, los {ALL_PROBLEMS.length} ejercicios desarrollados a lo largo del curso: los métodos de intervalo cerrado,
          los métodos abiertos, las raíces de polinomios con el método de Müller y los sistemas de ecuaciones lineales (factorización LU y método de Jacobi). Selecciona un módulo para explorar
          cada ejercicio con su tabla de iteraciones, gráfico y resultados recalculados en tiempo real.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {MODULES.map(mod => (
          <StatCard key={mod.id} mod={mod} count={mod.problems.length} onOpen={() => onOpenModule(mod.id)} />
        ))}
      </div>

      <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Todos los ejercicios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_PROBLEMS.map(p => {
            const theme = THEME[p.color]
            return (
              <button key={p.id} onClick={() => onOpenProblem(p.id)}
                className="flex items-center gap-3 text-left px-4 py-3 rounded-xl bg-black/20 hover:bg-black/40 border border-white/5 hover:border-white/15 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-200 font-medium truncate">{p.moduleName} — {p.label}</span>
                  <span className="block text-xs text-slate-500 truncate">{p.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(['bisec', 'gaa', 'muller', 'sel', 'examen'])
  const [mobileOpen, setMobileOpen] = useState(false)

  const active = useMemo(() => ALL_PROBLEMS.find(p => p.id === activeId) || null, [activeId])
  const activeModule = useMemo(() => MODULES.find(m => m.id === active?.moduleId) || null, [active])

  function selectProblem(id) {
    setActiveId(id)
    setMobileOpen(false)
    const mod = MODULES.find(m => m.problems.some(p => p.id === id))
    if (mod && !expandedIds.includes(mod.id)) setExpandedIds(prev => [...prev, mod.id])
  }

  function openModule(modId) {
    setExpandedIds(prev => prev.includes(modId) ? prev : [...prev, modId])
    const mod = MODULES.find(m => m.id === modId)
    if (mod?.problems?.[0]) selectProblem(mod.problems[0].id)
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100 flex">
      <Sidebar
        activeId={activeId}
        onSelect={selectProblem}
        expandedIds={expandedIds}
        onToggleModule={(id) => setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onGoHome={() => { setActiveId(null); setMobileOpen(false) }}
      />

      <div className="flex-1 min-w-0">
        <Topbar moduleName={activeModule?.name} problemLabel={active?.label} onMenu={() => setMobileOpen(true)} />
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div key={active.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }}>
              <active.Component />
            </motion.div>
          ) : (
            <Home key="home" onOpenModule={openModule} onOpenProblem={selectProblem} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
