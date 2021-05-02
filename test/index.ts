import Vinyl from 'vinyl';
import { Uploader } from '../src/index';
import { expect } from 'chai';
import internal from 'stream';
import dotenv from 'dotenv';
import eventStream from 'event-stream';
import { RequestError } from 'teeny-request';
import * as fs from 'fs';
import { FileState, PluginOptions } from '../src/types';
import { Storage } from '@google-cloud/storage';

dotenv.config();

const bucketName: string = process.env.BUCKET_NAME;
const cacheFolder: string = './test/cache';
const testFilePath: string = 'test/fixtures/hello.txt';
const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: testFilePath,
  contents: Buffer.from('hello')
});

describe('gulp-gcs-upload', () => {
  before(async () => {
    try {
      if (fs.existsSync(cacheFolder)) {
        // Clear all files under cache folder
        await fs.rmdirSync(cacheFolder, { recursive: true });
      }

      await Promise.all([
        // Create a folder for cache file
        fs.mkdirSync(cacheFolder),
        // Make sure no test cache file exist first for every full test
        removeTestFileFromBucket()
      ]);
    } catch (err) {
      console.error(err);
    }
  });

  after(async () => {
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

  it('should emit error when using invalid bucket', done => {
    const fakeBucketName = 'fake-bucket';
    const uploader: Uploader = new Uploader({
      bucketName: fakeBucketName,
      cacheFilePath: `./test/cache/.gcsupload-${fakeBucketName}`
    });
    const stream: internal.Transform = uploader.upload();

    stream.on('error', (err: RequestError) => {
      expect(err).to.be.ok;
      expect(err.code).to.eq(403);
      done();
    });

    stream.write(fakeFile);
    stream.end();
  });

  it('should create a new file on bucket – state: create)', done =>
    uploadTestCore('create', done));

  it('should not create or update cached file to bucket – state: cache)', done =>
    uploadTestCore('cache', done));

  it('should update existing file on bucket – state: update)', done => {
    // Remove cache file from previous test
    fs.unlinkSync(`./test/cache/.gcsupload-${bucketName}`);
    uploadTestCore('update', done);
  });

  it('should skip updating an existing file on bucket – state: skip)', done => {
    // Remove cache file from previous test
    fs.unlinkSync(`./test/cache/.gcsupload-${bucketName}`);

    uploadTestCore('skip', done, {
      bucketName,
      createOnly: true,
      cacheFilePath: `./test/cache/.gcsupload-${bucketName}`
    });
  });
});

function uploadTestCore(
  fileState: FileState,
  done: Mocha.Done,
  pluginOptions?: PluginOptions
): void {
  const uploader: Uploader = new Uploader(
    pluginOptions
      ? pluginOptions
      : {
          bucketName,
          cacheFilePath: `./test/cache/.gcsupload-${bucketName}`
        }
  );

  const stream: internal.Transform = uploader.upload();

  stream.pipe(
    eventStream.writeArray((err, files) => {
      expect(err).not.to.exist;
      expect(files).to.have.length(1);
      expect(files[0].gcs.state).to.eq(fileState);
      done(err);
    })
  );

  stream.write(fakeFile);
  stream.end();
}

function removeTestFileFromBucket(): void {
  const bucker = new Storage().bucket(process.env.BUCKET_NAME);

  if (bucker.file(testFilePath).exists()) {
    bucker.file(testFilePath).delete();
  }

  return;
}
