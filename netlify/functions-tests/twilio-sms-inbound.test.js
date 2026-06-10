'use strict';

const assert = require('assert');
const path = require('node:path');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.TWILIO_AUTH_TOKEN = 'stub-auth-token';
process.env.TWILIO_SIGNATURE_REQUIRED = 'false';

let lastUpdate = null;
let lastInsertTable = null;
let lastInsertRow = null;

function makeStub() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    update: (row) => { lastUpdate = row; return chain; },
    insert: (row) => { lastInsertRow = row; return Promise.resolve({ data: null, error: null }); },
    then: (r) => Promise.resolve({ data: [{ id: 'p1', phone: '+15551234567' }], error: null }).then(r)
  };
  return {
    from: (t) => {
      if (t === 'sms_opt_out_log') {
        lastInsertTable = t;
        return { insert: (row) => { lastInsertRow = row; return Promise.resolve({ data: null, error: null }); } };
      }
      return chain;
    }
  };
}

const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: { createClient: () => makeStub() } };
}

const fn = require('../functions/twilio-sms-inbound');

(async () => {
  let pass = 0, fail = 0;
  function ok(name, cond) {
    if (cond) { console.log('  ok ', name); pass++; }
    else { console.error('  FAIL', name); fail++; }
  }

  const stop = await fn.handler({
    httpMethod: 'POST',
    headers: {},
    body: 'From=%2B15551234567&Body=STOP&MessageSid=SM1'
  });
  ok('STOP returns TwiML 200', stop.statusCode === 200 && /unsubscribed/i.test(stop.body));
  ok('STOP body sets Content-Type text/xml', /text\/xml/.test(stop.headers['Content-Type']));
  ok('STOP keyword recognized', fn.STOP_KEYWORDS.has('STOP') && fn.STOP_KEYWORDS.has('UNSUBSCRIBE'));

  const start = await fn.handler({
    httpMethod: 'POST',
    headers: {},
    body: 'From=%2B15551234567&Body=START'
  });
  ok('START returns resubscribe message', start.statusCode === 200 && /resubscribed/i.test(start.body));

  const help = await fn.handler({
    httpMethod: 'POST',
    headers: {},
    body: 'From=%2B15551234567&Body=HELP'
  });
  ok('HELP returns info message', help.statusCode === 200 && /STOP to unsubscribe/i.test(help.body));

  const unknown = await fn.handler({
    httpMethod: 'POST',
    headers: {},
    body: 'From=%2B15551234567&Body=Hello+there'
  });
  ok('Unknown keyword returns empty TwiML', unknown.statusCode === 200 && /<Response\s*\/>/.test(unknown.body));

  ok('GET is rejected', (await fn.handler({ httpMethod: 'GET', headers: {}, body: '' })).statusCode === 405);

  ok('normalizeKeyword strips punctuation/whitespace', fn._test.normalizeKeyword('  stop! ') === 'STOP');
  ok('normalizePhone E.164', fn._test.normalizePhone('555-123-4567') === '+15551234567');

  // Signature validation positive + negative
  const crypto = require('node:crypto');
  const url = 'https://example.test/api/twilio/sms-inbound';
  const params = { From: '+15551234567', Body: 'STOP', MessageSid: 'SM1' };
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const goodSig = crypto.createHmac('sha1', 'stub-auth-token').update(Buffer.from(data, 'utf-8')).digest('base64');
  ok('valid signature accepted', fn._test.validateTwilioSignature('stub-auth-token', goodSig, url, params));
  ok('bad signature rejected',  !fn._test.validateTwilioSignature('stub-auth-token', 'WRONG', url, params));

  // Hard signature mode rejects without header
  process.env.TWILIO_SIGNATURE_REQUIRED = '';
  delete require.cache[require.resolve('../functions/twilio-sms-inbound')];
  const fn2 = require('../functions/twilio-sms-inbound');
  const noSig = await fn2.handler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.test' },
    body: 'From=%2B15551234567&Body=STOP',
    rawPath: '/api/twilio/sms-inbound'
  });
  ok('signature-required mode rejects missing header', noSig.statusCode === 403);
  process.env.TWILIO_SIGNATURE_REQUIRED = 'false';

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
