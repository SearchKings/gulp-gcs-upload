import {
  Bucket,
  Storage,
  StorageOptions,
  UploadOptions
} from '@google-cloud/storage';
import fs from 'fs';
import through from 'through2';
import crypto from 'crypto';
import mime from 'mime-types';
import PluginError from 'plugin-error';
import colors from 'ansi-colors';
import fancyLog from 'fancy-log';
import internal from 'stream';
import Vinyl from 'vinyl';
import omit from 'lodash.omit';

import { PluginOptions, ReportOptions } from './types';

/**
 * Uploads a stream of files to a Google Cloud Storage bucket
 */
export class Publisher {
  private cacheFilePath: string;
  private client: Bucket;
  private fileCache: { [filePath: string]: string };
  private pluginOptions: PluginOptions;

  constructor(pluginOptions: PluginOptions, storageOptions: StorageOptions) {
    if (!pluginOptions?.bucketName) {
      throw new Error('Missing bucket name');
    }

    this.pluginOptions = pluginOptions;
    this.client = new Storage(storageOptions).bucket(pluginOptions.bucketName);

    // Init Cache file
    this.cacheFilePath = pluginOptions.cacheFilePath
      ? pluginOptions.cacheFilePath
      : `.gcspublish-${pluginOptions.bucketName}`;

    // Load cache
    try {
      this.fileCache = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
    } catch (err) {
      this.fileCache = {};
    }
  }

  /**
   * Calculates an md5 hash for a given file buffer
   * @param buf Buffer of file to create hash for
   * @returns Calculated md5 hash
   */
  private md5Hash(buf: Buffer): string {
    return crypto.createHash('md5').update(buf).digest('hex');
  }

  /**
   * Adds some internal-only properties to a vinyl file
   * @param file File to initialize properties on
   * @returns Modified vinyl with with private properties
   */
  private initFile(file: Vinyl): Vinyl {
    if (!file.gcs) {
      file.gcs = {};
      file.gcs.path = file.relative.replace(/\\/g, '/');
    }

    return file;
  }

  /**
   * Write the current cache to the destination cache file
   */
  private saveCache(): void {
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.fileCache));
  }

  /**
   * Determine the content type of a file based on charset and mime type.
   * @param file Vinyl file to get the content type for
   * @returns Content type of the passed-in file
   */
  private getContentType(file: Vinyl): string {
    const mimeType: string =
      mime.lookup(file.unzipPath || file.path) || 'application/octet-stream';

    const charset: string | false = mime.charset(mimeType);

    return charset ? mimeType + '; charset=' + charset.toLowerCase() : mimeType;
  }

  /**
   * Adds a file to the in-memory cache, to be persisted to disk later
   * @param path Path of file to cache
   * @param hash Hash of file to cache
   */
  private addToCache(path: string, hash: string): void {
    this.fileCache[path] = hash;
  }

  /**
   * Publish the streamed files to the configured Google Cloud Storage bucket
   * @param uploadOptions Google Cloud Storage upload options for each file
   * @returns Stream that completes when uploading is done
   */
  public publish(uploadOptions?: UploadOptions): internal.Transform {
    const _this: this = this;

    const stream = through.obj(function (file: Vinyl, enc, cb) {
      // Do nothing if no contents
      if (file.isNull()) {
        return cb();
      }

      // Streams not supported
      if (file.isStream()) {
        this.emit(
          'error',
          new PluginError('gulp-gcs-upload', 'Stream content is not supported')
        );
        return cb();
      }

      // Check if file.contents is a `Buffer`
      if (file.isBuffer()) {
        _this.initFile(file);

        // Determine contentType
        const contentType = _this.getContentType(file);

        // Get file metadata from GCS
        _this.client.file(file.gcs.path).getMetadata((err, metadata) => {
          // Ignore 403 and 404 errors since we're checking if a file exists on gcs
          if (err && [403, 404].indexOf(err.code) < 0) {
            return cb(err);
          } else {
            metadata = metadata || {};
          }

          // Check if file is identical to the one in cache
          if (
            _this.fileCache[file.gcs.path] &&
            _this.fileCache[file.gcs.path] === metadata.md5Hash
          ) {
            file.gcs.state = 'cache';
            return cb(null, file);
          }

          // Skip: file exists, no updates allowed
          const noUpdate = !!(
            _this.pluginOptions.createOnly && metadata.md5Hash
          );

          if (noUpdate) {
            file.gcs.state = 'skip';
            _this.addToCache(file.gcs.path, metadata.md5Hash);
            cb(err, file);

            // Update: files are different or file doesn't exist yet
          } else {
            file.gcs.state = !!metadata.md5Hash ? 'update' : 'create';

            _this.client.upload(
              `${file.base}/${file.gcs.path}`,
              {
                // To avoid incorrect order of Vinyl metadata, set property inside of this block
                destination: file.gcs.path,
                contentType,
                gzip: true,
                // Omit below properties and let plugin handle it
                ...omit(uploadOptions, ['destination', 'contentType'])
              },
              (err, uploadedFile) => {
                if (err) {
                  return cb(err);
                }

                _this.addToCache(file.gcs.path, uploadedFile.metadata.md5Hash);
                cb(err, file);
              }
            );
          }
        });
      }
    });

    stream.on('finish', () => this.saveCache());

    return stream;
  }

  /**
   * Logs the state of the file stream, indicating which files were created or updated
   * @param reportOptions Options containing a list of states to report on
   * @returns Stream containing the report results
   */
  public report(reportOptions?: ReportOptions): internal.Transform {
    if (!reportOptions) {
      reportOptions = {};
    }

    const stream = through.obj(function (file, enc, cb) {
      let state: string;

      if (!file.gcs) {
        return cb(null, file);
      }

      if (!file.gcs.state) {
        return cb(null, file);
      }

      if (
        reportOptions.states &&
        reportOptions.states.indexOf(file.gcs.state) === -1
      ) {
        return cb(null, file);
      }

      state = `[${file.gcs.state}]`;

      switch (file.gcs.state) {
        case 'create':
          state = colors.green(state);
          break;
        default:
          state = colors.cyan(state);
          break;
      }

      fancyLog(state, file.gcs.path);
      cb(null, file);
    });

    stream.resume();

    return stream;
  }
}
