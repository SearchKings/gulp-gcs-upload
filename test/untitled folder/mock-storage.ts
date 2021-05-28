class MockStorage {
  buckets: { [name: string]: MockBucket };

  constructor() {
    this.buckets = {};
  }

  bucket(name: string): MockBucket {
    return this.buckets[name] || (this.buckets[name] = new MockBucket(name));
  }
}

class MockBucket {
  name: string;
  files: { [path: string]: MockFile };

  constructor(name: string) {
    this.name = name;
    this.files = {};
  }

  file(path: string): MockFile {
    return this.files[path] || (this.files[path] = new MockFile(path));
  }
}

class MockFile {
  path: string;
  contents: Buffer;
  metadata: any;

  constructor(path: string) {
    this.path = path;
    this.contents = Buffer.alloc(0);
    this.metadata = {};
  }

  get(): any[] {
    return [this, this.metadata];
  }

  setMetadata(metadata: any): void {
    const customMetadata = { ...this.metadata.metadata, ...metadata.metadata };
    this.metadata = { ...this.metadata, ...metadata, metadata: customMetadata };
  }

  // createReadStream() {
  //   const streamBuffers = require('stream-buffers');
  //   const readable = new streamBuffers.ReadableStreamBuffer();
  //   readable.put(this.contents);
  //   readable.stop();
  //   return readable;
  // }

  // createWriteStream({ metadata }: Object) {
  //   this.setMetadata(metadata);
  //   const streamBuffers = require('stream-buffers');
  //   const writable = new streamBuffers.WritableStreamBuffer();
  //   writable.on('finish', () => {
  //     this.contents = writable.getContents();
  //   });
  //   return writable;
  // }

  delete() {
    return Promise.resolve();
  }
}

export { MockStorage, MockBucket, MockFile };
