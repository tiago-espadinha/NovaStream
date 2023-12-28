import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryCounters } from '../db/attempts.js';
import { clientIp, createPasswordAttempts, ipBlock } from './passwordAttempts.js';

const make = (counters = createMemoryCounters()) =>
  createPasswordAttempts({ counters, accountMax: 2, ipMax: 3, windowSeconds: 60 });

const ada = { email: 'Ada@Example.com', ip: '1.1.1.1' };

test('admits an account up to its maximum attempts, whatever the email case', async () => {
  const attempts = make();
  assert.equal(await attempts.admit(ada), 0);
  assert.equal(await attempts.admit({ ...ada, email: 'ada@example.com' }), 0);
  assert.equal(await attempts.admit({ ...ada, ip: '2.2.2.2' }), 60);
});

test('parallel attempts are counted before any of them is admitted', async () => {
  const attempts = make();
  const waits = await Promise.all(Array.from({ length: 6 }, () => attempts.admit(ada)));
  assert.equal(waits.filter((wait) => wait === 0).length, 2);
});

test('admits an IP up to its maximum attempts across accounts', async () => {
  const attempts = make();
  for (const email of ['a@x.com', 'b@x.com', 'c@x.com']) assert.equal(await attempts.admit({ email, ip: '1.1.1.1' }), 0);
  assert.equal(await attempts.admit({ email: 'd@x.com', ip: '1.1.1.1' }), 60);
  assert.equal(await attempts.admit({ email: 'd@x.com', ip: '2.2.2.2' }), 0);
});

test('a success clears the account count and takes only itself off the IP count', async () => {
  const attempts = make();
  await attempts.admit({ email: 'b@x.com', ip: ada.ip });
  await attempts.admit(ada);
  await attempts.admit(ada);
  await attempts.succeeded(ada);
  assert.equal(await attempts.admit({ ...ada, ip: '2.2.2.2' }), 0);
  assert.equal(await attempts.admit({ email: 'c@x.com', ip: ada.ip }), 0);
  assert.equal(await attempts.admit({ email: 'c@x.com', ip: ada.ip }), 60);
});

test('lets attempts through when the counters are unreachable', async (t) => {
  t.mock.method(console, 'error', () => {});
  const down = async () => {
    throw new Error('Redis /multi-exec failed: 503');
  };
  const attempts = make({ hit: down, undo: down, clear: down });
  assert.equal(await attempts.admit(ada), 0);
  await attempts.succeeded(ada);
  assert.equal(console.error.mock.callCount(), 2);
});

test('trusts x-forwarded-for only on Vercel', () => {
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(req, { VERCEL: '1' }), '9.9.9.9');
  assert.equal(clientIp(req, {}), '127.0.0.1');
  assert.equal(clientIp({ headers: {}, socket: req.socket }, { VERCEL: '1' }), '127.0.0.1');
});

test('counts every address in an IPv6 /64 as one IP, and separate /64s apart', async () => {
  const attempts = make();
  const sameBlock = ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:db8:1:2:abcd::5'];
  for (const [i, ip] of sameBlock.entries()) assert.equal(await attempts.admit({ email: `${i}@x.com`, ip }), 0);
  assert.equal(await attempts.admit({ email: 'd@x.com', ip: '2001:db8:1:2::9' }), 60);
  assert.equal(await attempts.admit({ email: 'e@x.com', ip: '2001:db8:1:3::1' }), 0);
});

test('a success takes its attempt back off the shared /64 count', async () => {
  const attempts = make();
  await attempts.admit({ email: 'a@x.com', ip: '2001:db8::1' });
  await attempts.admit({ email: 'b@x.com', ip: '2001:db8::2' });
  await attempts.admit({ ...ada, ip: '2001:db8::3' });
  await attempts.succeeded({ ...ada, ip: '2001:db8::3' });
  assert.equal(await attempts.admit({ email: 'c@x.com', ip: '2001:db8::4' }), 0);
  assert.equal(await attempts.admit({ email: 'd@x.com', ip: '2001:db8::5' }), 60);
});

test('keys any spelling of an IPv6 address by its /64', () => {
  const same = [
    ['2001:db8::1', '2001:0DB8:0000:0000:0000:0000:0000:0001'],
    ['2001:db8:0:0::1', '2001:db8::ffff'],
    ['2001::1', '2001:0:0:0:1::'],
    ['fe80::1%eth0', 'fe80::1%2'],
    ['fe80::1%eth0', 'fe80::abcd'],
    ['64:ff9b::1.2.3.4', '64:ff9b::5.6.7.8'],
  ];
  for (const [a, b] of same) assert.equal(ipBlock(a), ipBlock(b), `${a} vs ${b}`);
  assert.notEqual(ipBlock('2001:db8:1:2::1'), ipBlock('2001:db8:1:3::1'));
  assert.notEqual(ipBlock('2001::1'), ipBlock('2001:0:0:1::1'));
});

test('keys IPv4 and IPv4-mapped addresses by the full IPv4 address', () => {
  assert.equal(ipBlock('1.1.1.1'), '1.1.1.1');
  for (const mapped of ['::ffff:1.2.3.4', '::FFFF:1.2.3.4', '::ffff:102:304', '0:0:0:0:0:ffff:1.2.3.4']) {
    assert.equal(ipBlock(mapped), '1.2.3.4', mapped);
  }
  assert.notEqual(ipBlock('::ffff:1.2.3.4'), ipBlock('::ffff:1.2.3.5'));
  assert.notEqual(ipBlock('::ffff:0:1.2.3.4'), '1.2.3.4');
  assert.notEqual(ipBlock('64:ff9b::1.2.3.4'), '1.2.3.4');
});

test('keeps anything that is not an IP address as it is', () => {
  for (const odd of ['unknown', '', 'garbage', '1.2.3', '999.1.1.1', ':::', '1::2::3', '12345::1', 'gggg::1', '1:2:3:4:5:6:7:8:9', '%']) {
    assert.equal(ipBlock(odd), odd);
  }
  assert.equal(clientIp({ headers: {}, socket: {} }, {}), 'unknown');
});
