import Vinyl from 'vinyl';
import { Uploader } from '../src/index';
import dotenv from 'dotenv';
import internal from 'node:stream';

dotenv.config();

describe('Upload', () => {
  const fakeFile: Vinyl.BufferFile = new Vinyl({
    path: 'test/fixtures/hello.txt',
    contents: Buffer.from('hello')
  });

  it('should upload successfully to the bucket', done => {
    const uploader: Uploader = new Uploader({
      bucketName: process.env.BUCKET_NAME
    });

    const upload: internal.Transform = uploader.upload();

    upload.write(fakeFile);

    upload.on('data', () => done()).on('error', done);
  });
});
