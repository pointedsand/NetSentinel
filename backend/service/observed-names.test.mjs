import assert from 'node:assert/strict';
import test from 'node:test';
import { ObservedNames } from './observed-names.mjs';
test('DNS correlation respects question, client, source, CNAME TTL and event time', () => {
  const cache=new ObservedNames();
  cache.inspect({dnsQuestion:'a.test',destination:'client',timestampUs:100,dnsAnswers:[
    {type:5,owner:'a.test',value:'b.test',ttl:1},
    {type:28,owner:'b.test',value:'addr',ttl:20},
    {type:1,owner:'unrelated',value:'bad',ttl:50}]},'A');
  function lookup(client,address,time,iface='A') {
    const p={source:client,destination:address,timestampUs:time};
    cache.inspect(p,iface); return p.observedDns?.name;
  }
  assert.equal(lookup('client','addr',101),'a.test');
  for (const args of [['client','addr',99],['client','addr',1000100],['other','addr',101],
      ['client','addr',101,'B'],['client','bad',101]]) assert.equal(lookup(...args),undefined);
});
