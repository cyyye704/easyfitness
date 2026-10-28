import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readSupabaseConfiguration } from './src/auth/config.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const environment = loadEnv(mode, process.cwd(), 'VITE_')
    const { error } = readSupabaseConfiguration(
      environment.VITE_SUPABASE_URL,
      environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    )
    // Reject a misconfigured secret before Vite can inline it into browser assets.
    if (error) throw new Error(error)
  }
  return { plugins: [react()] }
})
