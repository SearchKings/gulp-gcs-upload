export interface PluginOptions {
  bucketName: string;
  cacheFilePath?: string;
  createOnly?: boolean;
  uploadConcurrency?: number;
}

export interface ReportOptions {
  states?: FileState[];
}

export type FileState = 'cache' | 'skip' | 'update' | 'create';
