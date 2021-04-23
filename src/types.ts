export interface PluginOptions {
  bucketName: string;
  cacheFilePath?: string;
  createOnly?: boolean;
  uploadConcurrency?: number;
}

export interface ReportOptions {
  states?: FileState;
}

type FileState = 'cache' | 'skip' | 'update' | 'create';
