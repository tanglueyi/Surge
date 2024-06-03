import type { BunFile } from 'bun';
import { fetchWithRetry, defaultRequestInit } from './fetch-retry';

import { TextLineStream } from './text-line-transform-stream';
import { PolyfillTextDecoderStream } from './text-decoder-stream';
import { processLine } from './process-line';

// const enableTextLineStream = !!process.env.ENABLE_TEXT_LINE_STREAM;

// const decoder = new TextDecoder('utf-8');
// async function *createTextLineAsyncIterableFromStreamSource(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
//   let buf = '';

//   const reader = stream.getReader();

//   while (true) {
//     const res = await reader.read();
//     if (res.done) {
//       break;
//     }
//     const chunkStr = decoder.decode(res.value).replaceAll('\r\n', '\n');
//     for (let i = 0, len = chunkStr.length; i < len; i++) {
//       const char = chunkStr[i];
//       if (char === '\n') {
//         yield buf;
//         buf = '';
//       } else {
//         buf += char;
//       }
//     }
//   }

//   if (buf) {
//     yield buf;
//   }
// }

const getBunBlob = (file: string | URL | BunFile) => {
  if (typeof file === 'string') {
    return Bun.file(file);
  } if (!('writer' in file)) {
    return Bun.file(file);
  }
  return file;
};

export const readFileByLine: ((file: string | URL | BunFile) => AsyncIterable<string>) = (file: string | URL | BunFile) => getBunBlob(file)
  .stream()
  .pipeThrough(new PolyfillTextDecoderStream())
  .pipeThrough(new TextLineStream());

const ensureResponseBody = (resp: Response) => {
  if (!resp.body) {
    throw new Error('Failed to fetch remote text');
  }
  if (resp.bodyUsed) {
    throw new Error('Body has already been consumed.');
  }
  return resp.body;
};

export const createReadlineInterfaceFromResponse: ((resp: Response) => AsyncIterable<string>) = (resp) => ensureResponseBody(resp)
  .pipeThrough(new PolyfillTextDecoderStream())
  .pipeThrough(new TextLineStream());

export const fetchRemoteTextByLine = (url: string | URL) => fetchWithRetry(url, defaultRequestInit).then(createReadlineInterfaceFromResponse);

export const readFileIntoProcessedArray = (file: string | URL | BunFile) => getBunBlob(file)
  .text()
  .then(
    content => content.split('\n').filter(processLine)
  );
