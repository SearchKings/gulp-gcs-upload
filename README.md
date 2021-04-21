# Searchkings Gulp GCS Upload

> Upload files to Google Cloud Storage with Gulp

>  To generate GCS credentials: `gcloud auth application-default login --project <PROJECT_ID>`

## Install

```shell
npm install --save @searchkings/gulp-gcs-upload
```

## How to use

```ts
import { Publisher } from '@searchkings/gulp-gcs-upload';
import concurrentTransform from 'concurrent-transform';

  const bucketName: string = 'cdn';
  const publisher: Publisher = new Publisher(
    {
      bucketName,
      cacheFile: (default: '.gcspublish-"bucketName"')
    },
    {
      keyFilename: 'GCS-credentials'
    }
  );

  return gulp
    .src(`dist/**`)
    .pipe(publisher.publish())
    .pipe(concurrentTransform(publisher.publish(), 20))
    .pipe(publisher.report());
};

```

## Development

```shell
npm install
```

```shell
npm start
```

### Test

In the current plugin project, run
```shell
npm link
```

In the developing project, run
```shell
npm link @searchkings/gulp-gcs-upload
```
