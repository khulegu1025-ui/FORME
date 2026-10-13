import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const management=process.env.FORME_APP==='management';
export default defineConfig({
  root,
  publicDir: management?'public-management':'public',
  plugins: [react(),{name:'forme-entry',transformIndexHtml:{order:'pre',handler(html){return management?html.replace('/src/main.tsx','/src/management.tsx').replace('FORME — The everyday edit','FORME — Management'):html;}}}],
  build: { outDir: management?'../build/management':'../build/customer', emptyOutDir: true, sourcemap: false },
});
