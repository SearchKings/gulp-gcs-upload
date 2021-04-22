export interface PluginOptions {
  bucketName: string;
  cacheFilePath?: string;
  createOnly?: boolean;
}

export interface ReportOptions {
  states?: string[];
}
