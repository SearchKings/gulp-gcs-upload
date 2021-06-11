import * as fs from 'fs';
import internal from 'stream';
import { Uploader } from '../src';
import { FileState, PluginOptions } from '../src/types';
import eventStream from 'event-stream';
import Vinyl from 'vinyl';
import path from 'path';

const localCacheFile: string = path.resolve(
  process.cwd(),
  './test/cache/.gcsupload-test'
);

let pluginSettings: PluginOptions = {
  bucketName: 'test',
  cacheFilePath: localCacheFile
};

const fakeFile1: Vinyl.BufferFile = new Vinyl({
  path: path.resolve(process.cwd(), 'test/fixtures/hello.txt'),
  contents: Buffer.from('hello')
});

const fakeFile2: Vinyl.BufferFile = new Vinyl({
  path: path.resolve(process.cwd(), 'test/fixtures/gulp.png'),
  contents: Buffer.from('image')
});

const mockedFile = {
  getMetadata: jest.fn()
};
const mockedBucket = {
  file: jest.fn(() => mockedFile),
  upload: jest.fn().mockImplementation((path, options, callback) =>
    callback(null, {
      metadata: {
        md5Hash: '6t4TJUNDkcpEjYzvFwpOSg=='
      }
    })
  )
};
const mockedStorage = {
  bucket: jest.fn(() => mockedBucket)
};
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn(() => mockedStorage)
}));

describe('gulp-gcs-upload', () => {
  beforeAll(() => deleteLocalCacheFile());

  afterAll(() => jest.clearAllMocks());

  test('should emit error when missing bucket name', () =>
    expect(() => new Uploader({} as PluginOptions)).toThrow());

  test('should create a new file on the bucket – state: create)', done =>
    uploadTestCore('create', done));

  test('should not create or update cached file to the bucket – state: cache)', done =>
    uploadTestCore('cache', done));

  test('should update existing file on the bucket – state: update)', done => {
    // Delete local cache file from the previous test
    fs.unlinkSync(localCacheFile);
    uploadTestCore('update', done);
  });

  test('should skip updating an existing file on the bucket – state: skip)', done => {
    // Delete local cache file from the previous test
    fs.unlinkSync(localCacheFile);

    // `createOnly` test
    pluginSettings = { ...pluginSettings, createOnly: true };

    uploadTestCore('skip', done);
  });
});

function uploadTestCore(fileState: FileState, done: jest.DoneCallback): void {
  switch (fileState) {
    case 'create':
      mockedFile.getMetadata = jest
        .fn()
        .mockImplementation(callback => callback({ code: 403 }, {}));
      break;
    case 'cache':
    case 'update':
    case 'skip':
      mockedFile.getMetadata = jest
        .fn()
        .mockImplementation(callback =>
          callback(null, { md5Hash: '6t4TJUNDkcpEjYzvFwpOSg==' })
        );
      break;
    default:
      throw new Error(`Unknown file state: ${fileState}`);
  }

  const uploader: Uploader = new Uploader(pluginSettings);

  const stream: internal.Transform = uploader.upload();

  stream.write(fakeFile1);
  stream.write(fakeFile2);

  stream.pipe(
    eventStream.writeArray((err, files) => {
      expect(err).toBeNull();
      expect(files).toHaveLength(2);
      expect(files.map(file => file.gcs.state)).toEqual([fileState, fileState]);
      done();
    })
  );

  stream.end();
}

function deleteLocalCacheFile(): void {
  if (fs.existsSync(localCacheFile)) {
    fs.unlinkSync(localCacheFile);
  }
}
