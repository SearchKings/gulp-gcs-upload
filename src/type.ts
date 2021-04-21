import { ZlibOptions } from 'zlib';

export interface PluginOptions {
  bucketName: string;
  uploadBase: string;
  cacheFile: string;
}

export interface ReportOptions {
  states?: string;
}

export interface PluginFile {
  path: string;
  unzipPath: string;
  relative: string;
  gcs: PluginGCS;
  contents: any;
}

export interface PluginGCS {
  path?: string;
  headers?: any;
}

export interface ZlibOptionsExtend extends ZlibOptions {
  smaller?: number;
  ext?: string;
}
