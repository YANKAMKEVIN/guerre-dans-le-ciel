import { defineConfig, devices } from '@playwright/test';

// Port choisi hors des valeurs par défaut (machine partagée) ; E2E_PORT pour en imposer un autre.
const PORT = Number(process.env.E2E_PORT ?? 5847);
// Rendu WebGL logiciel (SwiftShader) : marche sans carte graphique, en CI comme en local.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off', screenshot: 'only-on-failure', launchOptions },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', testMatch: /desktop\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } },
    {
      name: 'mobile-paysage',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7 landscape'], defaultBrowserType: 'chromium' },
    },
  ],
});
