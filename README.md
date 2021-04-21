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

  const bucketName: string = 'cdn';
  const publisher: Publisher = new Publisher(
    {
      bucketName,
      uploadBase: 'dist'
    },
    {
      keyFilename: 'GCS-credentials'
    }
  );

  return gulp
    .src(`dist/**`)
    .pipe(publisher.publish())
    .pipe(publisher.cache())
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