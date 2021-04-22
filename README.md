# Searchkings Gulp GCS Upload

Upload files to Google Cloud Storage with Gulp

**To generate GCS credentials:**

```shell
$ gcloud auth application-default login --project <PROJECT_ID>
```

## Install

```shell
npm install @searchkings/gulp-gcs-upload
```

## Usage Example

```ts
import { Publisher } from '@searchkings/gulp-gcs-upload';

const bucketName: string = 'cdn-bucket';
const publisher: Publisher = new Publisher(
  {
    bucketName,
    cacheFilePath: path.resolve(homedir(), `.gcspublish-${bucketName}`),
    createOnly: true,
    uploadConcurrency: 20
  },
  {
    // To generate credentials: `gcloud auth application-default login --project <PROJECT_ID>`
    keyFilename: resolve(
      homedir(),
      '.config/gcloud/application_default_credentials.json'
    )
  }
);

return gulp
  .src(`${GLOBALS.CDN_COMMON_PATH}/**`)
  .pipe(publisher.publish())
  .pipe(publisher.report());
```

## API

### Publisher

**constructor(pluginOptions: PluginOptions, storageOptions: [StorageOptions](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions))**

Create a new uploader with a set of plugin options and storage options. **Note:** you must specify your preferred authentication method inside of the storage options.

```ts
interface PluginOptions {
  // Name of the bucket you wish to upload files to
  bucketName: string;

  // Local directory and file to store a cache of previously-uploaded files
  cacheFilePath?: string;

  // Whether a file can be updated if it already exists. Default: false
  createOnly?: boolean;

  // Number of simultaneous file uploads. Default: 1
  uploadConcurrency?: number;
}
```

**.publish(uploadOptions?: [UploadOptions](https://googleapis.dev/nodejs/storage/latest/global.html#UploadOptions))**

Uploads your stream of files to the GCS bucket with optional upload options you define.

**.report(reportOptions?: ReportOptions)**

Outputs a report with the state of each file that passed through the `.publish()` stream.

```ts
type FileState = 'cache' | 'skip' | 'update' | 'create';

interface ReportOptions {
  // List of states you wish to see included in the output
  states?: FileState[];
}
```

## Development

```shell
$ npm install
$ npm start
```
