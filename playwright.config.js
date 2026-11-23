import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  // Le runner de la CI rend en logiciel (SwiftShader) : un test qui recharge plusieurs fois le jeu y dépasse 30 s,
  // et une attente sur le rendu y dépasse les 5 s par défaut d'une assertion.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  // Chromium s'y bloque parfois (page qui ne répond plus, contexte impossible à créer) : une seconde tentative
  // repart d'un navigateur neuf, et le rapport signale le test comme « flaky » au lieu de le taire.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4187",
    viewport: { width: 780, height: 540 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    // Trace de la première tentative gardée si elle échoue, pour diagnostiquer un blocage. Sans captures
    // d'écran : filmer le canvas chargerait encore le rendu logiciel.
    trace: process.env.CI ? { mode: "retain-on-first-failure", screenshots: false } : "off",
  },
  // Les tests portent sur la build de production : elle est reconstruite à chaque lancement.
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4187 --strictPort",
    url: "http://127.0.0.1:4187",
  },
});
