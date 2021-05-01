import Vinyl from 'vinyl';
import { Uploader } from '../src/index';
import { expect } from 'chai';
import internal from 'stream';
import dotenv from 'dotenv';
import eventStream from 'event-stream';
import { RequestError } from 'teeny-request';
import * as fs from 'fs';

dotenv.config();

const cacheFolder: string = './test/cache';
const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: 'test/fixtures/hello.txt',
  contents: Buffer.from('hello')
});

// Clear and create folder for cache file
if (fs.existsSync(cacheFolder)) {
  fs.rmdirSync(cacheFolder, { recursive: true });
}

fs.mkdirSync(cacheFolder);

// describe('gulp-gcs-upload', () => {
//   it('should emit error when using invalid bucket', done => {
//     const bucketName: string = 'fake-bucket';
//     const uploader: Uploader = new Uploader({
//       bucketName,
//       cacheFilePath: `./test/cache/.gcsupload-${bucketName}`
//     });
//     const stream: internal.Transform = uploader.upload();

//     stream.on('error', (err: RequestError) => {
//       expect(err).to.be.ok;
//       expect(err.code).to.eq(403);
//       done();
//     });

//     stream.write(fakeFile);
//     stream.end();
//   });

//   it('should update existing file on bucket – state: update)', done => {
//     const bucketName: string = process.env.BUCKET_NAME;
//     const uploader: Uploader = new Uploader({
//       bucketName,
//       cacheFilePath: `./test/cache/.gcsupload-${bucketName}`
//     });

//     const stream: internal.Transform = uploader.upload();

//     stream.pipe(
//       eventStream.writeArray((err, files) => {
//         expect(err).not.to.exist;
//         expect(files).to.have.length(1);
//         expect(files[0].gcs.state).to.eq('update');
//         done(err);
//       })
//     );

//     stream.write(fakeFile);
//     stream.end();
//   });
// });
