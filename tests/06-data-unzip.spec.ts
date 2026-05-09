import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { extractFirstCsv, findZipByKeyword } from '../utils/zip-extractor';
import { REPORT_TYPES, reportFileKeyword } from '../data/metric-definitions';
import * as fs from 'fs';

test.describe.serial('Use Case 6 — Unzip downloaded reports', () => {
  test('extract CSV from each ZIP', async () => {
    await allure.suite('UC6 Data Unzip');
    fs.mkdirSync(config.dataDir, { recursive: true });

    for (const key of REPORT_TYPES) {
      const kw = reportFileKeyword(key);
      const zip = findZipByKeyword(config.downloadDir, kw);
      expect(zip, `Expected a ZIP matching "${kw}" in ${config.downloadDir}`).not.toBeNull();
      const csvPath = await extractFirstCsv(zip!, config.dataDir);
      expect(fs.existsSync(csvPath)).toBeTruthy();
      expect(fs.statSync(csvPath).size).toBeGreaterThan(0);
    }
  });
});