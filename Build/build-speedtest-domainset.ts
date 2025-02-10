import path from 'node:path';

import tldts from 'tldts-experimental';
import { task } from './trace';
import { SHARED_DESCRIPTION } from './constants/description';
import { readFileIntoProcessedArray } from './lib/fetch-text-by-line';

import { DomainsetOutput } from './lib/rules/domainset';
import { OUTPUT_SURGE_DIR, SOURCE_DIR } from './constants/dir';
import { $$fetch } from './lib/fetch-retry';

interface SpeedTestServer {
  url: string,
  lat: string,
  lon: string,
  distance: number,
  name: string,
  country: string,
  cc: string,
  sponsor: string,
  id: string,
  preferred: number,
  https_functional: number,
  host: string
}

const getSpeedtestHostsGroupsPromise = $$fetch('https://speedtest-net-servers.cdn.skk.moe/servers.json')
  .then(res => res.json() as Promise<SpeedTestServer[]>)
  .then((data) => data.reduce<string[]>((prev, cur) => {
    let hn: string | null = null;
    if (cur.host) {
      hn = tldts.getHostname(cur.host, { detectIp: false, validateHostname: true });
      if (hn) {
        prev.push(hn);
      }
    }
    if (cur.url) {
      hn = tldts.getHostname(cur.url, { detectIp: false, validateHostname: true });
      if (hn) {
        prev.push(hn);
      }
    }
    return prev;
  }, []));

export const buildSpeedtestDomainSet = task(require.main === module, __filename)(
  async (span) => new DomainsetOutput(span, 'speedtest')
    .withTitle('Sukka\'s Ruleset - Speedtest Domains')
    .withDescription([
      ...SHARED_DESCRIPTION,
      '',
      'This file contains common speedtest endpoints.'
    ])
    .addFromDomainset(readFileIntoProcessedArray(path.resolve(SOURCE_DIR, 'domainset/speedtest.conf')))
    .addFromDomainset(readFileIntoProcessedArray(path.resolve(OUTPUT_SURGE_DIR, 'domainset/speedtest.conf')))
    .bulkAddDomain(await span.traceChildPromise('get speedtest hosts groups', getSpeedtestHostsGroupsPromise))
    .write()
);
