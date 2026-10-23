import { defineConfig } from "@playwright/test";
const deployedURL = process.env.EVOTRACK_BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  reporter: deployedURL
    ? [["list"], ["json", { outputFile: ".cache/deployment-qa/report.json" }]]
    : "list",
  use: {
    baseURL: deployedURL ?? "http://127.0.0.1:5187/EvoTrack/",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: deployedURL
    ? undefined
    : {
        command: "npm run dev -- --port 5187 --strictPort",
        url: "http://127.0.0.1:5187/EvoTrack/",
        reuseExistingServer: false,
        timeout: 60000,
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
