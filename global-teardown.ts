import { spawn } from 'child_process';
import * as fs from 'fs';

/**
 * Global teardown that runs after all tests complete.
 * Opens Allure report in browser (single instance).
 */
async function globalTeardown() {
  const resultsDir = './allure-results';
  
  if (!fs.existsSync(resultsDir)) {
    console.log('[teardown] No allure-results folder found.');
    return;
  }

  const files = fs.readdirSync(resultsDir);
  if (files.length === 0) {
    console.log('[teardown] allure-results folder is empty.');
    return;
  }

  console.log(`[teardown] Found ${files.length} result files, opening Allure report...`);

  // Single command: allure serve (generates temp report + opens browser)
  const child = spawn('npx', ['allure', 'serve', 'allure-results'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,  // Hide CMD window on Windows
  });
  child.unref();

  console.log('[teardown] Allure report server started.');
}

export default globalTeardown;
