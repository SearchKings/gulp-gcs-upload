export function getMockFile() {
  const name: string = 'hello.txt';
  const size: number = 1024;
  const mimeType: string = 'plain/txt';

  const blob = new Blob(['a'.repeat(size)], { type: mimeType });
  (blob as any).lastModified = new Date();
  return new File([blob], name);
}
