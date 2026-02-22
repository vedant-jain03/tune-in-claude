import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.tune-in');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {};
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}
