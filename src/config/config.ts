import fs from 'fs';
import path from 'path';
import { MindPalaceConfig, DEFAULT_CONFIG } from '../types';

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private config: MindPalaceConfig;

  constructor() {
    const home = process.env.HOME || process.env.USERPROFILE || '/root';
    this.configDir = path.join(home, '.clawbot', 'mind-palace');
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * Ensure config directory exists
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Load config from file, or create default if not exists
   */
  private loadConfig(): MindPalaceConfig {
    this.ensureDir();

    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      } catch (error) {
        console.warn(`Failed to load config: ${error}. Using defaults.`);
        return { ...DEFAULT_CONFIG };
      }
    }

    // Create default config file
    this.saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Get current config
   */
  public getConfig(): MindPalaceConfig {
    return { ...this.config };
  }

  /**
   * Update specific config values
   */
  public update(updates: Partial<MindPalaceConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig(this.config);
  }

  /**
   * Update nested config value
   */
  public updateNested(path: string, value: any): void {
    const keys = path.split('.');
    let obj = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i] as keyof typeof obj;
      if (!(key in obj)) {
        (obj as any)[key] = {};
      }
      obj = (obj as any)[key];
    }

    const lastKey = keys[keys.length - 1];
    (obj as any)[lastKey] = value;

    this.saveConfig(this.config);
  }

  /**
   * Save config to file
   */
  private saveConfig(config: MindPalaceConfig): void {
    this.ensureDir();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Reset to defaults
   */
  public reset(): void {
    this.config = { ...DEFAULT_CONFIG };
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
