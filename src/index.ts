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
  private cacheFile: string;
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
    this.cacheFile = pluginOptions.cacheFile
      ? pluginOptions.cacheFile
      : `.gcspublish-${pluginOptions.bucketName}`;

    // Load cache
    try {
      this.fileCache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
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
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.fileCache));
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
   * Used to pipe upload results into a cache file to avoid re-uploading later
   * @returns Stream that completes when caching is done
   */
  public cache(): internal.Transform {
    let counter: number = 0;

    const stream = through.obj((file, enc, cb) => {
      if (file.gcs && file.gcs.path) {
        // Do nothing for files already cached
        if (file.gcs.state === 'cache') {
          return cb(null, file);
        }

        if (file.gcs.etag) {
          this.fileCache[file.gcs.path] = file.gcs.etag;
        }

        // Save cache every 10 files
        if (++counter % 10) {
          this.saveCache();
        }
      }

      cb(null, file);
    });

    stream.on('finish', () => this.saveCache());

    return stream;
  }

  /**
   * Publish the streamed files to the configured Google Cloud Storage bucket
   * @param uploadOptions Google Cloud Storage upload options for each file
   * @returns Stream that completes when uploading is done
   */
  public publish(uploadOptions?: UploadOptions): internal.Transform {
    const _this: this = this;

    return through.obj(function (file: Vinyl, enc, cb) {
      let etag: string;

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

        // Calculate etag
        etag = `"${_this.md5Hash(file.contents)}"`;

        // Check if file is identical to the one in cache
        if (_this.fileCache[file.gcs.path] === etag) {
          file.gcs.state = 'cache';
          return cb(null, file);
        }

        // Add content-type header
        if (!file.gcs.headers.contentType) {
          file.gcs.headers.contentType = _this.getContentType(file);
        }

        // Add content-length header
        if (!file.gcs.headers.contentLength) {
          file.gcs.headers.contentLength = file.contents.length;
        }

        // Get file metadata from GCS
        _this.client.file(file.gcs.path).getMetadata((err, metadata) => {
          // Ignore 403 and 404 errors since we're checking if a file exists on gcs
          if (err && [403, 404].indexOf(err.code) < 0) {
            return cb(err);
          } else {
            metadata = metadata || {};
          }

          // Skip: file exists, no updates allowed
          const noUpdate = !!(_this.pluginOptions.createOnly && metadata.etag);

          // Skip: file are identical
          const noChange = !!(metadata.etag === etag);

          if (noUpdate || noChange) {
            file.gcs.state = 'skip';
            file.gcs.etag = etag;
            cb(err, file);

            // Update: files are different or file doesn't exist yet
          } else {
            file.gcs.state = !!metadata.etag ? 'update' : 'create';

            _this.client.upload(
              `${file.base}/${file.gcs.path}`,
              {
                // To avoid incorrect order of Vinyl metadata, set property inside of this block
                destination: file.gcs.path,
                contentType: file.gcs.headers.contentType,
                gzip: true,
                // Omit below properties and let plugin handle it
                ...omit(uploadOptions, ['destination', 'contentType'])
              },
              err => {
                if (err) {
                  return cb(err);
                }

                file.gcs.etag = etag;
                cb(err, file);
              }
            );
          }
        });
      }
    });
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
