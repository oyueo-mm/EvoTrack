import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/EvoTrack/",
  plugins: [react(), tailwindcss()],
  // Worker-only TensorFlow imports must be prebundled before the first session;
  // discovering them lazily can make Vite reload the UI and discard its state.
  optimizeDeps: {
    include: ["react", "react-dom/client", "lucide-react", "@tensorflow/tfjs"],
  },
  server: {
    watch: {
      ignored: [
        "**/docs/**",
        "**/scripts/**",
        "**/tests/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/.cache/**",
      ],
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
  build: { chunkSizeWarningLimit: 1800 },
});
