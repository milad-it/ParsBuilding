const path = require('node:path');
const root = path.resolve(__dirname, '../../../');
const { sanitizeXss, stripHtmlTags, sanitizePrototype } = require(path.join(root, 'server/dist/utils/sanitizer'));
const { normalizePhone, validatePasswordComplexity, signAccessToken, verifyAccessToken } = require(path.join(root, 'server/dist/services/authService'));
const { computeDelta } = require(path.join(root, 'server/dist/utils/delta'));
const { RealtimeService } = require(path.join(root, 'server/dist/services/realtimeService'));

console.log('--- STARTING ADVERSARIAL STRESS TEST ---');

// 1. Sanitizer Tests
const xssPayloads = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=http://evil.com/xss.js></SCRIPT>',
  '<img src=x onerror="alert(1)">',
  '<svg/onload=alert(1)>',
  'javascript:alert(1)',
  '<a href="javascript:alert(1)">click</a>'
];

for (const p of xssPayloads) {
  const sanitized = sanitizeXss(p);
  const dangerous = sanitized.includes('<script>') || sanitized.includes('javascript:') || sanitized.includes('onerror=');
  console.log(`Payload: ${p} -> Sanitized: ${sanitized} (Dangerous: ${dangerous})`);
}

// Persian Unicode & ZWNJ
const persianComplex = 'می‌خواهم شارژ واحد ۱۲۳-ب را بپردازم؛ مبلغ: ۱۲٬۳۴۵٬۶۷۸ ریال! (\u200C)';
const sanitizedPersian = sanitizeXss(persianComplex);
console.log('Persian ZWNJ preservation:', sanitizedPersian === persianComplex);

// Prototype pollution
const polluted = JSON.parse('{"__proto__": {"admin": true}, "constructor": {"prototype": {"hacked": true}}, "safe": 1}');
const cleaned = sanitizePrototype(polluted);
console.log('Prototype clean:', cleaned.admin === undefined, ({}).admin === undefined, ({}).hacked === undefined);

// 2. Auth & Phone Normalization
console.log('Phone Arabic digits:', normalizePhone('٠٩١٢٣٤٥٦٧٨٩') === '09123456789');
console.log('Phone Persian spaces:', normalizePhone('+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹') === '09123456789');
console.log('Phone 0098 prefix:', normalizePhone('00989123456789') === '09123456789');

// Password complexity
console.log('Password valid:', validatePasswordComplexity('StrongP@ssw0rd123').valid);
console.log('Password missing upper:', validatePasswordComplexity('strongp@ssw0rd123').valid === false);
console.log('Password missing lower:', validatePasswordComplexity('STRONGP@SSW0RD123').valid === false);
console.log('Password missing number:', validatePasswordComplexity('StrongP@ssword!').valid === false);
console.log('Password missing symbol:', validatePasswordComplexity('StrongPassword123').valid === false);

// 3. JWT Tampering & Verification
const token = signAccessToken({
  sub: 'user-adversary',
  phone: '09120000000',
  fullName: 'Adversary',
  role: 'RESIDENT',
  complexId: 'cpx-victim',
  permissions: [],
  unitIds: ['unit-1']
}, 60);

const parts = token.split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
payload.role = 'SUPER_ADMIN'; // Privilege escalation attempt
const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const forgedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

let caught = false;
try {
  verifyAccessToken(forgedToken);
} catch (e) {
  caught = true;
}
console.log('JWT signature forgery rejected:', caught);

// 4. Realtime Gateway Room Access Control
const rt = RealtimeService.getInstance();
const residentUser = {
  userId: 'res-1',
  complexId: 'cpx-1',
  role: 'RESIDENT',
  unitIds: ['unit-101']
};

console.log('Resident own complex access:', rt.canSubscribe(residentUser, 'complex:cpx-1') === true);
console.log('Resident other complex rejection:', rt.canSubscribe(residentUser, 'complex:cpx-2') === false);
console.log('Resident own unit access:', rt.canSubscribe(residentUser, 'unit:unit-101') === true);
console.log('Resident other unit rejection:', rt.canSubscribe(residentUser, 'unit:unit-102') === false);
console.log('Resident cross-tenant unit attempt:', rt.canSubscribe(residentUser, 'unit:unit-cpx2-999') === false);

// Manager cross-unit in complex
const managerUser = {
  userId: 'mgr-1',
  complexId: 'cpx-1',
  role: 'COMPLEX_MANAGER',
  unitIds: []
};
console.log('Manager unit access in own complex:', rt.canSubscribe(managerUser, 'unit:unit-102') === true);

console.log('--- ADVERSARIAL STRESS TEST FINISHED ---');
