import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  // Le runner de la CI rend en logiciel (SwiftShader) : un test qui recharge plusieurs fois le jeu y dépasse 30 s.
  timeout: process.env.CI ? 60_000 : 30_000,
  use: {
    baseURL: "http://127.0.0.1:4187",
    viewport: { width: 780, height: 540 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  // Les tests portent sur la build de production : elle est reconstruite à chaque lancement.
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4187 --strictPort",
    url: "http://127.0.0.1:4187",
  },
});
