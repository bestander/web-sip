import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Config {
  port: number;
  sipPassword: string;
  janusUrl: string;
  janusAdminUrl: string;
  janusAdminSecret: string;
}

const defaultConfig: Config = {
  port: 3000,
  sipPassword: 'changeme',
  janusUrl: 'ws://localhost:8188',
  janusAdminUrl: 'http://localhost:7088/admin',
  janusAdminSecret: 'janusoverlord'
};

export function loadConfig(): Config {
  const configPath = join(__dirname, '../config.json');

  if (!existsSync(configPath)) {
    console.warn('No config.json found, using defaults');
    return defaultConfig;
  }

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    const fileConfig = JSON.parse(fileContent);
    return { ...defaultConfig, ...fileConfig };
  } catch (error) {
    console.error('Failed to load config.json:', error);
    return defaultConfig;
  }
}

export const config = loadConfig();
