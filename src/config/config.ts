import fs from 'fs';
import path from 'path';
import { MindPalaceConfig, DEFAULT_CONFIG } from '../types';
import { isSafeObject } from '../storage/validation';

/**
 * Validate that a loaded config object is safe (no prototype pollution, bounded depth).
 */
function isSafeConfig(obj: unknown): boolean {
  return isSafeObject(obj);
}

/**
 * Deep merge two objects. Source values override target values.
 * Only merges plain objects, not arrays.
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      (result as any)[key] = deepMerge(targetVal as any, sourceVal as any);
    } else if (sourceVal !== undefined) {
      (result as any)[key] = sourceVal;
    }
  }

  return result;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private config: MindPalaceConfig;

  constructor(storageDir?: string) {
    if (storageDir) {
      this.configDir = storageDir;
    } else {
      const home = process.env.HOME || process.env.USERPROFILE || '/root';
      this.configDir = path.join(home, '.clawbot', 'mind-palace');
    }
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * Ensure config directory exists with proper permissions
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load config from file with deep merge against defaults
   */
  private loadConfig(): MindPalaceConfig {
    this.ensureDir();

    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const saved = JSON.parse(data);
        if (!isSafeConfig(saved)) {
          console.warn('Config contains unsafe keys or excessive depth. Using defaults.');
          return deepMerge({} as MindPalaceConfig, DEFAULT_CONFIG);
        }
        return deepMerge(DEFAULT_CONFIG, saved);
      } catch (error) {
        console.warn(`Failed to load config: ${error}. Using defaults.`);
        return deepMerge({} as MindPalaceConfig, DEFAULT_CONFIG);
      }
    }

    // Create default config file
    const config = deepMerge({} as MindPalaceConfig, DEFAULT_CONFIG);
    this.saveConfig(config);
    return config;
  }

  /**
   * Get current config
   */
  public getConfig(): MindPalaceConfig {
    return deepMerge({} as MindPalaceConfig, this.config);
  }

  /**
   * Update specific config values (deep merge)
   */
  public update(updates: Partial<MindPalaceConfig>): void {
    this.config = deepMerge(this.config, updates);
    this.saveConfig(this.config);
  }

  /**
   * Update nested config value by dot-path
   */
  public updateNested(dotPath: string, value: any): void {
    const keys = dotPath.split('.');
    let obj: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in obj)) {
        obj[key] = {};
      }
      obj = obj[key];
    }

    const lastKey = keys[keys.length - 1];
    obj[lastKey] = value;

    this.saveConfig(this.config);
  }

  /**
   * Save config to file with secure permissions
   */
  private saveConfig(config: MindPalaceConfig): void {
    this.ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), {
      mode: 0o600,
      encoding: 'utf-8',
    });
  }

  /**
   * Reset to defaults
   */
  public reset(): void {
    this.config = deepMerge({} as MindPalaceConfig, DEFAULT_CONFIG);
    this.saveConfig(this.config);
  }

  /**
   * Get storage directory
   */
  public getStorageDir(): string {
    return this.configDir;
  }

  /**
   * Get config file path
   */
  public getConfigPath(): string {
    return this.configPath;
  }
}

// Singleton instance
let configManager: ConfigManager | null = null;

/**
 * Get config manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

/**
 * Reset config manager (for testing)
 */
export function resetConfigManager(storageDir?: string): ConfigManager {
  configManager = new ConfigManager(storageDir);
  return configManager;
}
