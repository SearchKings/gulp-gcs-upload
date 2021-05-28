import internal from 'stream';
import { Uploader } from '../src';
import { FileState, PluginOptions } from '../src/types';
import eventStream from 'event-stream';
import Vinyl from 'vinyl';

const fakeFile: Vinyl.BufferFile = new Vinyl({
  path: 'test/fixtures/hello.txt',
  contents: Buffer.from('hello')
});

const mockedFile = {
  upload: jest.fn().mockReturnValue({
    metadata: {
      md5Hash: '6t4TJUNDkcpEjYzvFwpOSg=='
    }
  }),
  getMetadata: jest.fn()
};
const mockedBucket = {
  file: jest.fn(() => mockedFile)
};
const mockedStorage = {
  bucket: jest.fn(() => mockedBucket)
};
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn(() => mockedStorage)
}));

afterEach(() => jest.clearAllMocks());

describe('gulp-gcs-upload', () => {
  test('should emit error when missing bucket name', () =>
    expect(() => new Uploader({} as PluginOptions)).toThrow());

  test('should create a new file on bucket – state: create)', done =>
    uploadTestCore('create', done));

  // test('should create a new file on bucket – state: create)', done => {
  //   mockedFile.getMetadata = jest
  //     .fn()
  //     .mockReturnValue({ error: { code: 403 }, metadata: {} });

  //   // jest.fn(() =>
  //   // Promise.resolve({
  //   //   json: () => Promise.resolve({ error: { code: 403 }, metadata: {} })
  //   // })

  //   // mockedFile.getMetadata = jest
  //   // .fn()
  //   // .mockResolvedValueOnce({ error: { code: 403 }, metadata: {} })

  //   // const uploader: Uploader = new Uploader({
  //   //   bucketName: 'test',
  //   //   cacheFilePath: './test/cache/.gcsupload-test'
  //   // });
  //   // const stream: internal.Transform = uploader.upload();

  //   // expect(mockedFile.getMetadata).toBe({ error: { code: 403 }, metadata: {} });

  //   // stream.pipe(
  //   //   eventStream.writeArray((err, files) => {
  //   //     console.log(files);

  //   //     expect(err).toBeNull();
  //   //     expect(files).toHaveLength(1);
  //   //     expect(files[0].gcs.state).toEqual('create');
  //   //     done(err);
  //   //   })
  //   // );
  //   // stream.write(
  //   //   new Vinyl({
  //   //     path: 'test/fixtures/hello.txt',
  //   //     contents: Buffer.from('hello')
  //   //   })
  //   // );
  //   // stream.end();
  // });
});

function uploadTestCore(fileState: FileState, done: jest.DoneCallback) {
  mockedFile.getMetadata = jest
    .fn()
    .mockReturnValue({ error: { code: 403 }, metadata: {} });

  const uploader: Uploader = new Uploader({
    bucketName: 'test',
    cacheFilePath: './test/cache/.gcsupload-test'
  });

  const stream: internal.Transform = uploader.upload();

  stream.pipe(
    eventStream.writeArray((err, files) => {
      console.log('err', err);
      console.log('files', files);

      expect(err).toBeNull();
      expect(files).toHaveLength(1);
      expect(files[0].gcs.state).toEqual(fileState);
      done(err);
    })
  );

  stream.write(fakeFile);
  stream.end();
}
