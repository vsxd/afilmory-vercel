import type { StorageConfig, StorageProvider } from "./interfaces.js";

export type StorageProviderFactory<T extends StorageConfig = StorageConfig> = (
  config: T,
) => StorageProvider;

export class StorageRegistry {
  private providers = new Map<string, StorageProviderFactory>();

  registerProvider(provider: string, factory: StorageProviderFactory): void {
    this.providers.set(provider, factory);
  }

  createProvider(config: StorageConfig): StorageProvider {
    const factory = this.providers.get(config.provider);

    if (!factory) {
      throw new Error(
        `Unsupported storage provider: ${config.provider as string}`,
      );
    }

    return factory(config);
  }

  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export function createStorageRegistry(): StorageRegistry {
  return new StorageRegistry();
}

const defaultStorageRegistry = createStorageRegistry();

/**
 * @deprecated Use an explicit StorageRegistry from BuilderServices instead.
 */
export class StorageFactory {
  static registerProvider(
    provider: string,
    factory: StorageProviderFactory,
  ): void {
    defaultStorageRegistry.registerProvider(provider, factory);
  }

  static createProvider(config: StorageConfig): StorageProvider {
    return defaultStorageRegistry.createProvider(config);
  }

  static getRegisteredProviders(): string[] {
    return defaultStorageRegistry.getRegisteredProviders();
  }
}
