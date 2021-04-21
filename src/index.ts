import { Bucket, Storage, StorageOptions } from '@google-cloud/storage';
import fs from 'fs';
import through from 'through2';
import crypto from 'crypto';
import mime from 'mime-types';
import PluginError from 'plugin-error';
import colors from 'ansi-colors';
import fancyLog from 'fancy-log';

import { PluginFile, PluginOptions } from './type';

/**
 * Calculate file hash
 * @param  {Buffer} buf
 * @return {String}
 *
 * @api private
 */

const md5Hash = (buf): string => {
  return crypto.createHash('md5').update(buf).digest('hex');
};

/**
 * Determine the content type of a file based on charset and mime type.
 * @param  {Object} file
 * @return {String}
 *
 * @api private
 */
const getContentType = (file: PluginFile): string => {
  const mimeType: string =
    mime.lookup(file.unzipPath || file.path) || 'application/octet-stream';

  const charset: string | false = mime.charset(mimeType);

  return charset ? mimeType + '; charset=' + charset.toLowerCase() : mimeType;
};

/**
 * Init file gcs hash
 * @param file file object
 *
 * @return file
 * @api private
 */

const initFile = (file: PluginFile): PluginFile => {
  if (!file.gcs) {
    file.gcs = {};
    file.gcs.headers = {};
    file.gcs.path = file.relative.replace(/\\/g, '/');
  }
  return file;
};

// Publisher class
export class Publisher {
  private client: Bucket;
  private uploadBase: string;
  private cacheFile: string;
  private fileCache: { [key: string]: string };

  constructor(
    { bucketName, uploadBase, cacheFile }: PluginOptions,
    storageOptions: StorageOptions
  ) {
    if (!bucketName) {
      throw new Error('Missing bucket name');
    }

    this.uploadBase = uploadBase;
    this.client = new Storage(storageOptions).bucket(bucketName);

    // Init Cache file
    this.cacheFile = cacheFile ? cacheFile : `.gcspublish-${bucketName}`;

    // Load cache
    try {
      this.fileCache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch (err) {
      this.fileCache = {};
    }
  }

  private saveCache = () => {
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.fileCache));
  };

  public cache = () => {
    let counter: number = 0;

    const stream = through.obj((file, enc, cb) => {
      if (file.gcs && file.gcs.path) {
        // Do nothing for file already cached
        if (file.gcs.state === 'cache') {
          return cb(null, file);
        }

        // Remove deleted
        if (file.gcs.state === 'delete') {
          delete this.fileCache[file.gcs.path];

          // Update others
        } else if (file.gcs.etag) {
          this.fileCache[file.gcs.path] = file.gcs.etag;
        }

        // Save cache every 10 files
        if (++counter % 10) {
          this.saveCache();
        }
      }

      cb(null, file);
    });

    stream.on('finish', this.saveCache);

    return stream;
  };

  public publish = () => {
    const _this: this = this;

    return through.obj(function (file, enc, cb) {
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
        initFile(file);

        // Calculate etag
        etag = '"' + md5Hash(file.contents) + '"';

        // Delete - stop here
        if (file.gcs.state === 'delete') {
          return cb(null, file);
        }

        // Check if file is identical as the one in cache
        if (_this.fileCache[file.gcs.path] === etag) {
          file.gcs.state = 'cache';
          return cb(null, file);
        }

        // Add content-type header
        if (!file.gcs.headers['Content-Type']) {
          file.gcs.headers['Content-Type'] = getContentType(file);
        }

        // Add content-length header
        if (!file.gcs.headers['Content-Length']) {
          file.gcs.headers['Content-Length'] = file.contents.length;
        }

        // Get file metadata from GCS
        _this.client.file(file.gcs.path).getMetadata((err, metadata) => {
          // Ignore 403 and 404 errors since we're checking if a file exists on gcs
          if (err && [403, 404].indexOf(err.code) < 0) {
            return cb(err);
          } else {
            metadata = {};
          }

          // Skip: no updates allowed
          const noUpdate = !!metadata.etag;

          // Skip: file are identical
          const noChange = !!(metadata.etag === etag);

          if (noUpdate || noChange) {
            file.gcs.state = 'skip';
            file.gcs.etag = etag;
            file.gcs.date = new Date(metadata.updated);
            cb(err, file);

            // Update: file are different
          } else {
            file.gcs.state = metadata.etag ? 'update' : 'create';

            _this.client.upload(
              `${_this.uploadBase}/${file.gcs.path}`,
              {
                destination: file.gcs.path,
                gzip: true,
                metadata: {
                  cacheControl: 'max-age=315360000, no-transform, public'
                }
              },
              err => {
                if (err) {
                  return cb(err);
                }

                file.gcs.date = new Date();
                file.gcs.etag = etag;
                cb(err, file);
              }
            );
          }
        });
      }
    });
  };

  public report = (options?: any) => {
    if (!options) {
      options = {};
    }

    const stream = through.obj(function (file, enc, cb) {
      let state;
      if (!file.gcs) {
        return cb(null, file);
      }
      if (!file.gcs.state) {
        return cb(null, file);
      }
      if (options.states && options.states.indexOf(file.gcs.state) === -1) {
        return cb(null, file);
      }

      state = `[${file.gcs.state}]`;

      switch (file.gcs.state) {
        case 'create':
          state = colors.green(state);
          break;
        case 'delete':
          state = colors.red(state);
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
  };
}
