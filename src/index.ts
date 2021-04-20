import {
  Bucket,
  GetFileMetadataResponse,
  Storage,
  StorageOptions
} from '@google-cloud/storage';
import fs from 'fs';
import through from 'through2';
import zlib from 'zlib';
import crypto from 'crypto';
import mime from 'mime-types';
import { pascalCase } from 'pascal-case';
import PluginError from 'plugin-error';

const PLUGIN_NAME = 'gulp-gcs-upload';

/**
 * calculate file hash
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
const getContentType = (file): string => {
  const mimeType: string =
    mime.lookup(file.unzipPath || file.path) || 'application/octet-stream';

  const charset: string | false = mime.charset(mimeType);

  return charset ? mimeType + '; charset=' + charset.toLowerCase() : mimeType;
};

// /**
//  * Turn the HTTP style headers into AWS Object params
//  */
// const toGcsParams = file => {
//   const params: any = {};

//   const headers = file.gcs.headers || {};

//   for (const header in headers) {
//     params[pascalCase(header)] = headers[header];
//   }

//   params.Key = file.gcs.path;
//   params.Body = file.contents;

//   return params;
// };

/**
 * init file gcs hash
 * @param  {Vinyl} file file object
 *
 * @return {Vinyl} file
 * @api private
 */

const initFile = file => {
  if (!file.gcs) {
    file.gcs = {};
    file.gcs.headers = {};
    file.gcs.path = file.relative.replace(/\\/g, '/');
  }
  return file;
};

/**
 * create a through stream that gzip files
 * file content is gziped and Content-Encoding is added to gcs.headers
 * @param  {Object} options
 *
 * options keys are:
 *   ext: extension to add to gzipped files
 *   smaller: whether to only gzip files if the result is smaller
 *
 * @return {Stream}
 * @api public
 */
export const gzip = options => {
  if (!options) {
    options = {};
  }

  if (!options.ext) {
    options.ext = '';
  }

  return through.obj(function (file, enc, cb) {
    // Do nothing if no contents
    if (file.isNull()) {
      return cb();
    }

    // Streams not supported
    if (file.isStream()) {
      this.emit(
        'error',
        new PluginError(PLUGIN_NAME, 'Stream content is not supported')
      );
      return cb();
    }

    // Check if file.contents is a `Buffer`
    if (file.isBuffer()) {
      initFile(file);

      // Zip file
      zlib.gzip(file.contents, options, (err, buf) => {
        if (err) {
          return cb(err);
        }

        if (options.smaller && buf.length >= file.contents.length) {
          return cb(err, file);
        }

        // Add content-encoding header
        file.gcs.headers['Content-Encoding'] = 'gzip';
        file.unzipPath = file.path;
        file.path += options.ext;
        file.gcs.path += options.ext;
        file.contents = buf;
        return cb(err, file);
      });
    }
  });
};

class Publisher {
  private client: Bucket;
  private config: StorageOptions;
  private uploadBase: string;
  private cacheFile: string;
  private fileCache: { [key: string]: string };

  constructor(
    { bucketName, uploadBase, cacheFile },
    storageOptions: StorageOptions
  ) {
    if (!bucketName) {
      throw new Error('Missing bucket name');
    }

    this.config = storageOptions;
    this.uploadBase = uploadBase;
    this.client = new Storage(this.config).bucket(bucketName);

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
    let counter = 0;

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

  public publish = (headers, options) => {
    const _this = this;

    // Init opts
    if (!options) {
      options = { force: false };
    }

    // Init param object
    if (!headers) {
      headers = {};
    }

    return through.obj(function (file, enc, cb) {
      let header, etag;

      // Do nothing if no contents
      if (file.isNull()) {
        return cb();
      }

      // Streams not supported
      if (file.isStream()) {
        this.emit(
          'error',
          new PluginError(PLUGIN_NAME, 'Stream content is not supported')
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
        if (!options.force && _this.fileCache[file.gcs.path] === etag) {
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

        // Add extra headers
        for (header in headers) {
          file.gcs.headers[header] = headers[header];
        }

        if (options.simulate) {
          return cb(null, file);
        }

        // Get gcs headers
        _this.client.file(file.gcs.path).getMetadata((err, metadata, res) => {
          // Ignore 403 and 404 errors since we're checking if a file exists on gcs
          if (err && [403, 404].indexOf(err.code) < 0) {
            return cb(err);
          } else {
            metadata = {};
          }

          // Skip: no updates allowed
          const noUpdate = options.createOnly && metadata.etag;

          // Skip: file are identical
          const noChange = !options.force && metadata.etag === etag;

          if (noUpdate || noChange) {
            file.gcs.state = 'skip';
            file.gcs.etag = etag;
            file.gcs.date = new Date(metadata.updated);
            cb(err, file);

            // Update: file are different
          } else {
            file.gcs.state = metadata.etag ? 'update' : 'create';

            _this.client.upload(`${_this.uploadBase}/${file.gcs.path}`, err => {
              if (err) {
                return cb(err);
              }

              file.gcs.date = new Date();
              file.gcs.etag = etag;
              cb(err, file);
            });
          }
        });
      }
    });
  };
}

/**
 * Shortcut for `new Publisher()`.
 *
 * @param {Object} options
 * @param {Object} StorageOptions
 * @return {Publisher}
 *
 * @api public
 */

export const create = (
  options: {
    bucketName: string;
    uploadBase: string;
    cacheFile: string;
  },
  storageOptions: StorageOptions
) => new Publisher(options, storageOptions);
