/**
 * Validate the read-only Cloudflare D1 --json query result without ever
 * printing private database values, even when a malformed response arrives.
 * Fail the GitHub deploy BEFORE updating production Worker code.
 */
import { pathToFileURL } from 'node:url';

export function checkTechnologyD1Readiness(value) {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length !== 1 || !entries[0] || entries[0].success !== true
    || !Array.isArray(entries[0].results) || entries[0].results.length !== 1) {
    throw new Error('D1 read-only readiness query returned no valid aggregate row');
  }
  const result = entries[0].results[0];
  if (!result || typeof result !== 'object') throw new Error('Invalid D1 aggregate shape');
  const expected = [
    ['authorized_publishers',4],
    ['authorized_admins',1],
    ['agent_receipts_table',1],
    ['admin_receipts_table',1],
  ];
  for (const [field, count] of expected) {
    if (result[field] !== count) {
      // Never echo results; they may contain sensitive D1 metadata if CLI
      // payloads change unexpectedly.
      throw new Error('Haber 2.0 release gate failed: '+field+' is not '+count);
    }
  }
  if (!Number.isSafeInteger(result.historical_rows) || result.historical_rows < 580) {
    throw new Error('Haber 2.0 historical archive count below the 580-row baseline');
  }
  return { authorizedPublishers:4, authorizedAdmins:1, historicalRows:result.historical_rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let body='';
  try {
    for await (const chunk of process.stdin) {
      body += chunk;
      if (body.length > 128_000) throw new Error('D1 output exceeded expected JSON size');
    }
    const outcome=checkTechnologyD1Readiness(JSON.parse(body));
    console.log('Haber 2.0 D1 release READY: '+outcome.authorizedPublishers+
      ' agents, '+outcome.authorizedAdmins+
      ' administrator, '+outcome.historicalRows+' historical articles');
  } catch (error) {
    console.error('Haber 2.0 D1 release BLOCKED: '+error.message);
    process.exitCode=1;
  }
}
