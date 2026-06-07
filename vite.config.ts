import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = '\\\\CMHEX\\Media\\PFDB-React';

// Preserve the server-managed changelog.json across builds.
// emptyOutDir wipes the output dir before writing, so we save and restore it.
function preserveChangelog() {
  let saved: string | null = null;
  return {
    name: 'preserve-server-changelog',
    apply: 'build' as const,
    buildStart() {
      try {
        saved = fs.readFileSync(path.join(OUT_DIR, 'changelog.json'), 'utf8');
      } catch {
        saved = null;
      }
    },
    closeBundle() {
      if (saved != null) {
        fs.writeFileSync(path.join(OUT_DIR, 'changelog.json'), saved);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preserveChangelog(),
  ],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
  },
})
