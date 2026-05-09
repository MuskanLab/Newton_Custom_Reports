import { test, expect, STORAGE_STATE } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { LoginPage } from '../pages/login.page';
import * as fs from 'fs';
import * as path from 'path';

test.describe.serial('Use Case 1 — Login', () => {
  test('valid user can log in and reach the dashboard', async ({ sharedPage: page, context }) => {
    await allure.suite('UC1 Login');
    await allure.severity('blocker');

    expect(config.email, 'NEWTON_EMAIL must be set in .env').not.toBe('');
    expect(config.password, 'NEWTON_PASSWORD must be set in .env').not.toBe('');

    const login = new LoginPage(page);
    await login.goto(config.applicationUrl, config.loginPath);
    await login.login(config.email, config.password);

    await expect(page).toHaveURL(/telescope|dashboard/);

    // Persist session so dependent tests can skip login.
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
  });
});