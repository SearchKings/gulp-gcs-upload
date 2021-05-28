import * as fs from 'fs';
import dotenv from 'dotenv';
import eventStream from 'event-stream';
import internal from 'stream';
import Vinyl from 'vinyl';
import { RequestError } from 'teeny-request';
import { Bucket, Storage } from '@google-cloud/storage';
import { Uploader } from '../../src/index';

import { FileState, PluginOptions } from '../../src/types';

dotenv.config();

const bucketName: string = process.env.BUCKET_NAME;
const cacheFolder: string = './test/cache';
const testFilePath: string = 'test/fixtures/hello.txt';
const cacheFilePath: string = `${cacheFolder}/.gcsupload-${bucketName}`;
const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: testFilePath,
  contents: Buffer.from('hello')
});

let pluginSettings: PluginOptions = {
  bucketName,
  cacheFilePath
};

beforeAll(async () => {
  try {
    if (fs.existsSync(cacheFolder)) {
      // Clear all files under cache folder
      await fs.rmdirSync(cacheFolder, { recursive: true });
    }

    await Promise.all([
      // Create a folder for cache file
      fs.mkdirSync(cacheFolder),
      // Make sure no test cache file exist on bucket for every full test
      removeTestFileFromBucket()
    ]);
  } catch (err) {
    console.error(err);
  }
});

afterAll(async () => {
  try {
    // Clean up after all tests
    await Promise.all([
      fs.rmdirSync(cacheFolder, { recursive: true }),
      removeTestFileFromBucket()
    ]);
  } catch (err) {
    console.error(err);
  }
});

describe('gulp-gcs-upload', () => {
  test('should emit error when using invalid bucket', done => {
    const fakeBucketName = 'fake-bucket';
    const uploader: Uploader = new Uploader({
      bucketName: fakeBucketName,
      cacheFilePath: `./test/cache/.gcsupload-${fakeBucketName}`
    });
    const stream: internal.Transform = uploader.upload();
    stream.on('error', (err: RequestError) => {
      expect(err).toBeTruthy();
      expect(err.code).toEqual(403);
      done();
    });
    stream.write(fakeFile);
    stream.end();
  });

  test('should create a new file on bucket – state: create)', done =>
    uploadTestCore('create', done));

  test('should not create or update cached file to bucket – state: cache)', done =>
    uploadTestCore('cache', done));

  test('should update existing file on bucket – state: update)', done => {
    // Remove cache file from previous test
    fs.unlinkSync(cacheFilePath);
    uploadTestCore('update', done);
  });

  test('should skip updating an existing file on bucket – state: skip)', done => {
    // Remove cache file from previous test
    fs.unlinkSync(cacheFilePath);

    // `createOnly` test
    pluginSettings = { ...pluginSettings, createOnly: true };

    uploadTestCore('skip', done);
  });
});

function uploadTestCore(fileState: FileState, done: jest.DoneCallback): void {
  const uploader: Uploader = new Uploader(pluginSettings);

  const stream: internal.Transform = uploader.upload();

  stream.pipe(
    eventStream.writeArray((err, files) => {
      expect(err).toBeNull();
      expect(files).toHaveLength(1);
      expect(files[0].gcs.state).toEqual(fileState);
      done(err);
    })
  );

  stream.write(fakeFile);
  stream.end();
}

function removeTestFileFromBucket(): void {
  const bucker: Bucket = new Storage().bucket(process.env.BUCKET_NAME);

  if (bucker.file(testFilePath).exists()) {
    bucker.file(testFilePath).delete();
  }

  return;
}
