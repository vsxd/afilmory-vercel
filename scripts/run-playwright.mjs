import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const environment = { ...process.env };
const playwrightArguments = process.argv.slice(2);

// Keep the package scripts portable: shell-level `env -u` and inline
// assignments do not work in cmd.exe. Playwright forces colors for its child
// processes, so remove the conflicting opt-out before any workers are spawned.
delete environment.NO_COLOR;
const deprecationFilter = "--disable-warning=DEP0205";
if (!environment.NODE_OPTIONS?.includes(deprecationFilter)) {
  environment.NODE_OPTIONS = [environment.NODE_OPTIONS, deprecationFilter]
    .filter(Boolean)
    .join(" ");
}
// The config is evaluated again inside Playwright workers, where CLI project
// arguments are no longer present. Persist the selected mode in the child env.
if (playwrightArguments.some((argument) => argument.includes("prod-smoke"))) {
  environment.E2E_PROD_SMOKE = "true";
}
if (
  playwrightArguments.some(
    (argument) =>
      argument.includes("webkit-smoke") || argument.includes("iphone-smoke"),
  )
) {
  environment.E2E_CROSS_BROWSER_SMOKE = "true";
}

const child = spawn(process.execPath, [playwrightCli, ...playwrightArguments], {
  env: environment,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(`[playwright] Failed to start: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
