import path from 'path';
import { DOMAINS, PROCESS_NAMES } from '../Source/non_ip/cloudmounter';
import { SHARED_DESCRIPTION } from './lib/constants';
import { createRuleset } from './lib/create-file';
import { task } from './trace';

const outputSurgeDir = path.resolve(__dirname, '../List');
const outputClashDir = path.resolve(__dirname, '../Clash');

export const buildCloudMounterRules = task(require.main === module, __filename)(async (span) => {
  // AND,((SRC-IP,192.168.1.110), (DOMAIN, example.com))

  const results = DOMAINS.flatMap(domain => {
    return PROCESS_NAMES.map(process => `AND,((${domain}),(PROCESS-NAME,${process}))`);
  });

  const description = SHARED_DESCRIPTION;

  return createRuleset(
    span,
    'Sukka\'s Ruleset - CloudMounter / RaiDrive',
    description,
    new Date(),
    results,
    'ruleset',
    path.resolve(outputSurgeDir, 'non_ip', 'cloudmounter.conf'),
    path.resolve(outputClashDir, 'non_ip', 'cloudmounter.txt')
  );
});
