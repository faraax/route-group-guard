export interface EnsureManifestOptions {
  appDir?: string;
  outFile?: string;
  silent?: boolean;
}

export function ensureManifest(options?: EnsureManifestOptions): {
  routes: Array<{
    path: string;
    access?: 'public' | 'private';
    roles: string[];
    permissions: string[];
  }>;
  warnings: string[];
};
