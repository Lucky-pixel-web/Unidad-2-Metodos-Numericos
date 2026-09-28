import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'   

export default defineConfig({
  base: '/Unidad-2-Metodos-Numericos/',
  plugins: [react(), tailwindcss()], 
})