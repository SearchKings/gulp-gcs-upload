export interface PluginOptions {
  bucketName: string;
  cacheFile?: string;
  createOnly?: boolean;
}

export interface ReportOptions {
  states?: string[];
}
