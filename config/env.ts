import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv'; // The dotenv package loads environment variables from a .env file into process.env object at runtime.
dotenv.config();

const envName = process.env.ENVIRONMENT ?? 'preprod';
const cfgPath = path.join(__dirname, 'environments', `${envName}.json`);
if (!fs.existsSync(cfgPath)) {
  throw new Error(`Config file not found: ${cfgPath}`);
}

const file = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

// Get credentials based on environment
const emailVar = envName === 'prod' ? 'PROD_EMAIL' : 'PREPROD_EMAIL';
const passwordVar = envName === 'prod' ? 'PROD_PASSWORD' : 'PREPROD_PASSWORD';

export const config = {
  ...file,
  email: process.env[emailVar] ?? '',
  password: process.env[passwordVar] ?? '',
  downloadDir: path.resolve(process.env.DOWNLOAD_DIR ?? './test-data/downloads'),
  dataDir: path.resolve(process.env.DATA_DIR ?? './test-data/data'),
  campaignManagementPath: file.campaignManagementPath ?? '/asa/campaign-management',
  campaignGroupName: file.campaignGroupName ?? 'policybazaar',
  // App search text used on /campaigns (KPI dashboard). Different casing than
  // reportAppSearchText because the two pages have different search behavior.
  campaignAppSearchText: file.campaignAppSearchText ?? file.reportAppSearchText ?? 'policybazar',
  tolerance: file.tolerance ?? { relative: 0.02, absolute: 0.015 },
};