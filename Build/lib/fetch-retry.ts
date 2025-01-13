import picocolors from 'picocolors';
import undici, {
  interceptors,
  Agent,
  setGlobalDispatcher
} from 'undici';

import type {
  Dispatcher,
  Response,
  RequestInit
} from 'undici';
import { BetterSqlite3CacheStore } from 'undici-cache-store-better-sqlite3';

export type UndiciResponseData<T = unknown> = Dispatcher.ResponseData<T>;

import { inspect } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { CACHE_DIR } from '../constants/dir';

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const agent = new Agent({ allowH2: true });

setGlobalDispatcher(agent.compose(
  interceptors.retry({
    maxRetries: 5,
    minTimeout: 500, // The initial retry delay in milliseconds
    maxTimeout: 10 * 1000, // The maximum retry delay in milliseconds

    // TODO: this part of code is only for allow more errors to be retried by default
    // This should be removed once https://github.com/nodejs/undici/issues/3728 is implemented
    retry(err, { state, opts }, cb) {
      const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : null;
      const errorCode = 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      const headers = ('headers' in err && typeof err.headers === 'object') ? err.headers : undefined;

      const { counter } = state;

      // Any code that is not a Undici's originated and allowed to retry
      if (
        errorCode === 'ERR_UNESCAPED_CHARACTERS'
        || err.message === 'Request path contains unescaped characters'
        || err.name === 'AbortError'
      ) {
        return cb(err);
      }

      // if (errorCode === 'UND_ERR_REQ_RETRY') {
      //   return cb(err);
      // }

      const { method, retryOptions = {} } = opts;

      const {
        maxRetries = 5,
        minTimeout = 500,
        maxTimeout = 10 * 1000,
        timeoutFactor = 2,
        methods = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']
      } = retryOptions;

      // If we reached the max number of retries
      if (counter > maxRetries) {
        return cb(err);
      }

      // If a set of method are provided and the current method is not in the list
      if (Array.isArray(methods) && !methods.includes(method)) {
        return cb(err);
      }

      // bail out if the status code matches one of the following
      if (
        statusCode != null
        && (
          statusCode === 401 // Unauthorized, should check credentials instead of retrying
          || statusCode === 403 // Forbidden, should check permissions instead of retrying
          || statusCode === 404 // Not Found, should check URL instead of retrying
          || statusCode === 405 // Method Not Allowed, should check method instead of retrying
        )
      ) {
        return cb(err);
      }

      const retryAfterHeader = (headers as Record<string, string> | null | undefined)?.['retry-after'];
      let retryAfter = -1;
      if (retryAfterHeader) {
        retryAfter = Number(retryAfterHeader);
        retryAfter = Number.isNaN(retryAfter)
          ? calculateRetryAfterHeader(retryAfterHeader)
          : retryAfter * 1e3; // Retry-After is in seconds
      }

      const retryTimeout
        = retryAfter > 0
          ? Math.min(retryAfter, maxTimeout)
          : Math.min(minTimeout * (timeoutFactor ** (counter - 1)), maxTimeout);

      console.log('[fetch retry]', 'schedule retry', { statusCode, retryTimeout, errorCode, url: opts.origin });
      // eslint-disable-next-line sukka/prefer-timer-id -- won't leak
      setTimeout(() => cb(null), retryTimeout);
    }
    // errorCodes: ['UND_ERR_HEADERS_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETDOWN', 'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH', 'EPIPE', 'ETIMEDOUT']
  }),
  interceptors.redirect({
    maxRedirections: 5
  }),
  interceptors.cache({
    store: new BetterSqlite3CacheStore({
      location: path.join(CACHE_DIR, 'undici-better-sqlite3-cache-store.db'),
      maxEntrySize: 1024 * 1024 * 100 // 100 MiB
    })
  })
));

function calculateRetryAfterHeader(retryAfter: string) {
  const current = Date.now();
  return new Date(retryAfter).getTime() - current;
}

export class ResponseError<T extends UndiciResponseData | Response> extends Error {
  readonly code: number;
  readonly statusCode: number;

  constructor(public readonly res: T, public readonly url: string, ...args: any[]) {
    const statusCode = 'statusCode' in res ? res.statusCode : res.status;
    super('HTTP ' + statusCode + ' ' + args.map(_ => inspect(_)).join(' '));

    if ('captureStackTrace' in Error) {
      Error.captureStackTrace(this, ResponseError);
    }

    // eslint-disable-next-line sukka/unicorn/custom-error-definition -- deliberatly use previous name
    this.name = this.constructor.name;
    this.res = res;
    this.code = statusCode;
    this.statusCode = statusCode;
  }
}

export const defaultRequestInit = {
  headers: {
    'User-Agent': 'curl/8.9.1 (https://github.com/SukkaW/Surge)'
  }
};

export async function $$fetch(url: string, init?: RequestInit) {
  try {
    const res = await undici.fetch(url, init);
    if (res.status >= 400) {
      throw new ResponseError(res, url);
    }

    if (!(res.status >= 200 && res.status <= 299) && res.status !== 304) {
      throw new ResponseError(res, url);
    }

    return res;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'name' in err) {
      if ((
        err.name === 'AbortError'
        || ('digest' in err && err.digest === 'AbortError')
      )) {
        console.log(picocolors.gray('[fetch abort]'), url);
      }
    } else {
      console.log(picocolors.gray('[fetch fail]'), url, { name: (err as any).name }, err);
    }

    throw err;
  }
}

/** @deprecated -- undici.requests doesn't support gzip/br/deflate, and has difficulty w/ undidi cache */
export async function requestWithLog(url: string, opt?: Parameters<typeof undici.request>[1]) {
  try {
    const res = await undici.request(url, opt);
    if (res.statusCode >= 400) {
      throw new ResponseError(res, url);
    }

    if (!(res.statusCode >= 200 && res.statusCode <= 299) && res.statusCode !== 304) {
      throw new ResponseError(res, url);
    }

    return res;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'name' in err) {
      if ((
        err.name === 'AbortError'
        || ('digest' in err && err.digest === 'AbortError')
      )) {
        console.log(picocolors.gray('[fetch abort]'), url);
      }
    } else {
      console.log(picocolors.gray('[fetch fail]'), url, { name: (err as any).name }, err);
    }

    throw err;
  }
}
