import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BlockList, isIP } from 'node:net';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const options = { timeout: 12000, maxBuffer: 1024*1024, windowsHide: true };
const windowsQuery = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$adapter = Get-NetAdapter -IncludeHidden | Where-Object { $_.InterfaceGuid -eq $env:NETSENTINEL_ADAPTER_GUID } | Select-Object -First 1
if (!$adapter) { throw 'Adapter metadata unavailable' }
$i = $adapter.ifIndex
$routes = @(Get-NetRoute -InterfaceIndex $i)
$profile = Get-NetConnectionProfile -InterfaceIndex $i -ErrorAction SilentlyContinue | Select-Object -First 1
@{
  interfaceName = [string]$adapter.Name
  profile = [string]$profile.Name
  prefixes = @($routes | Where-Object { $_.NextHop -in '0.0.0.0','::' -and $_.DestinationPrefix -notmatch '/(32|128|0)$' } | ForEach-Object DestinationPrefix)
  gateways = @($routes | Where-Object { $_.DestinationPrefix -in '0.0.0.0/0','::/0' } | ForEach-Object NextHop)
  neighbors = @(Get-NetNeighbor -InterfaceIndex $i | Where-Object { $_.State -in 'Reachable','Stale','Delay','Probe','Permanent' } | Select-Object -First 512 | ForEach-Object { @{ ip=$_.IPAddress; mac=$_.LinkLayerAddress } })
} | ConvertTo-Json -Depth 4 -Compress`;

export async function readNeighbors(source,signal) {
  if (process.platform === 'win32') {
    const guid = source.match(/^\\Device\\NPF_(\{[a-f0-9-]{36}\})$/i)?.[1];
    if (!guid) throw Error('No Windows adapter GUID for this capture source.');
    const result = await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',windowsQuery],
      {...options,signal,env:{...process.env, NETSENTINEL_ADAPTER_GUID:guid}});
    return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  }
  if (process.platform !== 'linux') throw Error('Neighbor inventory is unavailable on this platform.');
  const query = async args => JSON.parse((await run('ip',['-j',...args,'dev',source],{...options,signal})).stdout);
  const [v4,v6,neighbors] = await Promise.all([query(['-4','route','show']),query(['-6','route','show']),query(['neigh','show'])]);
  const routes = [...v4,...v6];
  return {interfaceName:source, prefixes:routes.filter(r=>!r.gateway && r.dst?.includes('/')).map(r=>r.dst),
    gateways:routes.filter(r=>r.dst === 'default' && r.gateway).map(r=>r.gateway),
    neighbors:neighbors.filter(n=>n.lladdr && !n.state?.some(s=>['FAILED','INCOMPLETE','NOARP'].includes(s)))
      .map(n=>({ip:n.dst,mac:n.lladdr}))};
}

export function networkContext(source, data, replay = false) {
  const prefixes = [...new Set(data.prefixes)].sort();
  const gateways = [...new Set(data.gateways)].sort();
  const scope = createHash('sha256').update(JSON.stringify([source,data.profile || '',prefixes,gateways])).digest('hex').slice(0,24);
  const ranges = new BlockList();
  const broadcasts = new Set();
  for (const prefix of prefixes) {
    const [ip,bits] = prefix.split('/');
    if (isIP(ip) === 4 && Number(bits) > 0 && Number(bits) < 31) {
      const value = ip.split('.').reduce((n,s)=>n*256+Number(s),0);
      const block = 2**(32-Number(bits));
      const end = Math.floor(value/block)*block + block-1;
      broadcasts.add([24,16,8,0].map(shift=>(end>>>shift)&255).join('.'));
    }
    if (isIP(ip) && Number(bits) > 0) ranges.addSubnet(ip, Number(bits), isIP(ip) === 6 ? 'ipv6' : 'ipv4');
  }
  return { scope, source, interfaceName:data.interfaceName, gateways, prefixes, replay, local(ip) {
    const family = isIP(ip);
    if (!family || broadcasts.has(ip) || ['0.0.0.0','255.255.255.255','::','::1'].includes(ip) || /^ff/i.test(ip)) return false;
    if (family === 4 && (+ip.split('.')[0] >= 224 || ip.startsWith('127.'))) return false;
    return replay || ranges.check(ip, family === 6 ? 'ipv6' : 'ipv4') || gateways.includes(ip);
  }};
}
