"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.gzip = void 0;
const storage_1 = require("@google-cloud/storage");
const fs_1 = __importDefault(require("fs"));
const through2_1 = __importDefault(require("through2"));
const zlib_1 = __importDefault(require("zlib"));
const crypto_1 = __importDefault(require("crypto"));
const mime_types_1 = __importDefault(require("mime-types"));
const plugin_error_1 = __importDefault(require("plugin-error"));
const PLUGIN_NAME = 'gulp-gcs-upload';
const md5Hash = (buf) => {
    return crypto_1.default.createHash('md5').update(buf).digest('hex');
};
const getContentType = (file) => {
    const mimeType = mime_types_1.default.lookup(file.unzipPath || file.path) || 'application/octet-stream';
    const charset = mime_types_1.default.charset(mimeType);
    return charset ? mimeType + '; charset=' + charset.toLowerCase() : mimeType;
};
const initFile = file => {
    if (!file.gcs) {
        file.gcs = {};
        file.gcs.headers = {};
        file.gcs.path = file.relative.replace(/\\/g, '/');
    }
    return file;
};
const gzip = options => {
    if (!options) {
        options = {};
    }
    if (!options.ext) {
        options.ext = '';
    }
    return through2_1.default.obj(function (file, enc, cb) {
        if (file.isNull()) {
            return cb();
        }
        if (file.isStream()) {
            this.emit('error', new plugin_error_1.default(PLUGIN_NAME, 'Stream content is not supported'));
            return cb();
        }
        if (file.isBuffer()) {
            initFile(file);
            zlib_1.default.gzip(file.contents, options, (err, buf) => {
                if (err) {
                    return cb(err);
                }
                if (options.smaller && buf.length >= file.contents.length) {
                    return cb(err, file);
                }
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
exports.gzip = gzip;
class Publisher {
    constructor(bucketName, storageOptions, cacheOptions) {
        if (bucketName) {
            throw new Error('Missing `params.Bucket` config value.');
        }
        this.config = storageOptions;
        this.client = new storage_1.Storage(this.config).bucket(bucketName);
        this.cacheFile =
            cacheOptions && cacheOptions.cacheFileName
                ? cacheOptions.cacheFileName
                : '.gcspublish-' + bucketName;
        try {
            this.fileCache = JSON.parse(fs_1.default.readFileSync(this.getCacheFilename(), 'utf8'));
        }
        catch (err) {
            this.fileCache = {};
        }
    }
    getCacheFilename() {
        return this.cacheFile;
    }
    saveCache() {
        fs_1.default.writeFileSync(this.getCacheFilename(), JSON.stringify(this.fileCache));
    }
    cache() {
        let counter = 0;
        const stream = through2_1.default.obj((file, enc, cb) => {
            if (file.gcs && file.gcs.path) {
                if (file.gcs.state === 'cache') {
                    return cb(null, file);
                }
                if (file.gcs.state === 'delete') {
                    delete this.fileCache[file.gcs.path];
                }
                else if (file.gcs.etag) {
                    this.fileCache[file.gcs.path] = file.gcs.etag;
                }
                if (++counter % 10)
                    this.saveCache();
            }
            cb(null, file);
        });
        stream.on('finish', this.saveCache);
        return stream;
    }
    publish(headers, options) {
        const _this = this;
        if (!options)
            options = { force: false };
        if (!headers)
            headers = {};
        return through2_1.default.obj(function (file, enc, cb) {
            let header, etag;
            if (file.isNull()) {
                return cb();
            }
            if (file.isStream()) {
                this.emit('error', new plugin_error_1.default(PLUGIN_NAME, 'Stream content is not supported'));
                return cb();
            }
            if (file.isBuffer()) {
                initFile(file);
                etag = '"' + md5Hash(file.contents) + '"';
                if (file.gcs.state === 'delete') {
                    return cb(null, file);
                }
                if (!options.force && _this.fileCache[file.gcs.path] === etag) {
                    file.gcs.state = 'cache';
                    return cb(null, file);
                }
                if (!file.gcs.headers['Content-Type'])
                    file.gcs.headers['Content-Type'] = getContentType(file);
                if (!file.gcs.headers['Content-Length'])
                    file.gcs.headers['Content-Length'] = file.contents.length;
                for (header in headers)
                    file.gcs.headers[header] = headers[header];
                if (options.simulate) {
                    return cb(null, file);
                }
                _this.client
                    .file(file.gcs.path)
                    .getMetadata((err, [res]) => {
                    if (err && [403, 404].indexOf(err.statusCode) < 0) {
                        return cb(err);
                    }
                    res = res || {};
                    const noUpdate = options.createOnly && res.etag;
                    const noChange = !options.force && res.etag === etag;
                    if (noUpdate || noChange) {
                        file.gcs.state = 'skip';
                        file.gcs.etag = etag;
                        file.gcs.date = new Date(res.updated);
                        cb(err, file);
                    }
                    else {
                        file.gcs.state = res.etag ? 'update' : 'create';
                        _this.client.upload(file.gcs.path, err => {
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
    }
}
const create = (bucketName, storageOptions, cacheOptions) => {
    return new Publisher(bucketName, storageOptions, cacheOptions);
};
exports.create = create;
//# sourceMappingURL=index.js.map