import * as fs from 'fs';
import internal from 'stream';
import { Uploader } from '../src';
import { FileState, PluginOptions } from '../src/types';
import eventStream from 'event-stream';
import Vinyl from 'vinyl';

const localCacheFile: string = './test/cache/.gcsupload-test';

let pluginSettings: PluginOptions = {
  bucketName: 'test',
  cacheFilePath: localCacheFile
};

const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: 'test/fixtures/hello.txt',
  contents: Buffer.from('hello')
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

  test('should create a new file on bucket – state: create)', done =>
    uploadTestCore('create', done));

  test('should not create or update cached file to bucket – state: cache)', done =>
    uploadTestCore('cache', done));

  test('should update existing file on bucket – state: update)', done => {
    // Delete local cache file from the previous test
    fs.unlinkSync(localCacheFile);
    uploadTestCore('update', done);
  });

  test('should skip updating an existing file on bucket – state: skip)', done => {
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

  stream.write(fakeFile);

  stream.pipe(
    eventStream.writeArray((err, files) => {
      expect(err).toBeNull();
      expect(files).toHaveLength(1);
      expect(files[0].gcs.state).toEqual(fileState);
      done(err);
    })
  );

  stream.end();
}

function deleteLocalCacheFile(): void {
  if (fs.existsSync(localCacheFile)) {
    fs.unlinkSync(localCacheFile);
  }
}
