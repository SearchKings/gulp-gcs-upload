import Vinyl from 'vinyl';
import { Uploader } from '../src/index';
import { expect } from 'chai';
import internal from 'stream';
import { RequestError } from 'teeny-request';

const bucketName: string = 'fake-bucket';
const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: 'test/fixtures/hello.txt',
  contents: Buffer.from('hello')
});

const uploader: Uploader = new Uploader({
  bucketName,
  cacheFilePath: `./test/cache/.gcsupload-${bucketName}`
});

describe('gulp-gcs-upload', () => {
  it('should emit error when using invalid bucket', done => {
    const stream: internal.Transform = uploader.upload();

    stream.on('error', (err: RequestError) => {
      expect(err).to.be.ok;
      expect(err.code).to.eq(403);
      done();
    });

    stream.write(fakeFile);
    stream.end();
  });
});
