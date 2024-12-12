import { dirname } from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

export function fastStringCompare(a: string, b: string) {
  const lenA = a.length;
  const lenB = b.length;
  const minLen = lenA < lenB ? lenA : lenB;

  for (let i = 0; i < minLen; ++i) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);

    if (ca > cb) return 1;
    if (ca < cb) return -1;
  }

  if (lenA === lenB) {
    return 0;
  }

  return lenA > lenB ? 1 : -1;
};

interface Write {
  (
    destination: string,
    input: NodeJS.TypedArray | string,
  ): Promise<unknown>
}

export function mkdirp(dir: string) {
  if (fs.existsSync(dir)) {
    return;
  }
  return fsp.mkdir(dir, { recursive: true });
}

export const writeFile: Write = async (destination: string, input, dir = dirname(destination)) => {
  const p = mkdirp(dir);
  if (p) {
    await p;
  }
  return fsp.writeFile(destination, input, { encoding: 'utf-8' });
};

export const removeFiles = async (files: string[]) => Promise.all(files.map((file) => fsp.rm(file, { force: true })));

export function domainWildCardToRegex(domain: string) {
  let result = '^';
  for (let i = 0, len = domain.length; i < len; i++) {
    switch (domain[i]) {
      case '.':
        result += String.raw`\.`;
        break;
      case '*':
        result += '[a-zA-Z0-9-_.]*?';
        break;
      case '?':
        result += '[a-zA-Z0-9-_.]';
        break;
      default:
        result += domain[i];
    }
  }
  result += '$';
  return result;
}

export function withBannerArray(title: string, description: string[] | readonly string[], date: Date, content: string[]) {
  return [
    '#########################################',
    `# ${title}`,
    `# Last Updated: ${date.toISOString()}`,
    `# Size: ${content.length}`,
    ...description.map(line => (line ? `# ${line}` : '#')),
    '#########################################',
    ...content,
    '################## EOF ##################'
  ];
};
