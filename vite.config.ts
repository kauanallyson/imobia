import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  ssr: { noExternal: ['@mui/*'] },
  // Lets Meta reach the dev server through `bun run tunnel`.
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [
    // Console piping sends server logs to the browser and back, which loops forever.
    devtools({ consolePiping: { enabled: false } }),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
