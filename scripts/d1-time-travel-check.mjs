/**
 * Read-only recovery precondition before running forward-only production
 * migrations. Cloudflare D1 Time Travel is automatically available on
 * production storage. Wrangler's --json command returns { bookmark }.
 *
 * The bookmark is deliberately NEVER logged, written to a repo, or sent to
 * an artifact. The deploy run records an RFC3339 UTC timestamp separately;
 * an explicitly authorized operator can derive a bookmark for that instant.
 * This script does not restore anything.
 */
import { pathToFileURL } from 'node:url';

export function validateTimeTravelCheckpoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('D1 Time Travel response must be an object');
  }
  const bookmark=value.bookmark;
  if (typeof bookmark !== 'string' || bookmark.length < 20
    || bookmark.length > 128 || !/^[0-9a-f-]+$/iu.test(bookmark)) {
    throw new Error('D1 Time Travel current bookmark is missing or malformed');
  }
  return true;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    let body='';
    for await(const chunk of process.stdin) {
      body += chunk;
      if(body.length>8192) throw new Error('Unexpectedly large D1 bookmark response');
    }
    validateTimeTravelCheckpoint(JSON.parse(body));
    console.log('D1 recovery gate READY: remote Time Travel bookmark is available; value withheld');
  } catch(error) {
    // Do not echo response text (possibly containing private resource info).
    console.error('D1 recovery gate BLOCKED:',error instanceof Error?error.message:'unknown error');
    process.exitCode=1;
  }
}
