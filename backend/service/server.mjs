import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Administrator } from './administrator.mjs';
import { Monitor } from './monitor.mjs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { isIP } from 'node:net';
import { ObservedNames } from './observed-names.mjs';
import { WebSocketServer, WebSocket } from 'ws';
import { Hostnames } from './resolver.mjs';
import { PacketHistory } from './history.mjs';

function filterArgs(filter = {}) {
  const keys = ['protocol','source_ip','destination_ip','source_port','destination_port'];
  if (!filter || typeof filter !== 'object' || Array.isArray(filter) ||
      Object.keys(filter).some(k => !keys.includes(k))) throw Error('invalid filter');
  return keys.map((key, i) => {
    const v = filter[key];
    if (v === undefined) return '-';
    const valid = i === 0 ? ['TCP','UDP','ICMP','OTHER'].includes(v)
      : i < 3 ? typeof v === 'string' && isIP(v)
      : Number.isInteger(v) && v >= 0 && v <= 65535;
    if (!valid) throw Error('invalid ' + key);
    return String(v);
  });
}

export function serve({ executable, mode, source, sources = [source], sourceLabels, monitor = new Monitor(), port = 8080, dns = false,
                        credentialFile, origin = 'http://localhost:5173' }) {
  if (!executable || !source || !['--interface','--replay'].includes(mode)) throw Error('invalid capture source');
  const history = new PacketHistory();
  let activeDns = dns, names, resolverSource;
  function resolver(source) {
    if (resolverSource !== source) { names?.close(); names = null; resolverSource = source; }
    if (activeDns && !names) names = new Hostnames({onResult(ip,name,key) {
      if (key !== ip) { monitor.applyPtr(source,ip,name,key); return; }
      history.applyPtr(source,ip,name);
      if (client?.readyState === WebSocket.OPEN && client.bufferedAmount < 512*1024)
        client.send(JSON.stringify({type:'ptr',source,ip,name}));
    }});
    return names;
  }
  monitor.resolveNeighbor = (source,ip,id) => resolver(source)?.get(ip,id+'|'+ip);
  let child, client;
  let selected = 0;
  const admin = new Administrator(credentialFile);
  const frontend = new URL(origin);
  if (origin !== 'netsentinel://desktop' && (!['127.0.0.1','localhost','[::1]'].includes(frontend.hostname) ||
      !['http:','https:'].includes(frontend.protocol) || frontend.origin !== origin))
    throw Error('Expected an exact loopback frontend origin.');
  const allowed = req => req.headers.origin === origin &&
    ['127.0.0.1','localhost'].some(host=>req.headers.host === host+':'+http.address()?.port);
  const http = createServer((req,res) => {
    res.writeHead(allowed(req) ? 426 : 403,{'Cache-Control':'no-store'});
    res.end();
  });
  const server = new WebSocketServer({server:http,maxPayload:4096,perMessageDeflate:false,
    verifyClient:info=>allowed(info.req)});
  http.listen(port,'127.0.0.1');
  let watchdog;
  function stop() {
    if (!child || watchdog) return;
    const proc = child;
    if (!proc.stdin.destroyed && !proc.stdin.writableEnded) proc.stdin.end('stop\n');
    watchdog = setTimeout(() => proc.kill(), 3000);
  }

  server.on('connection', socket => {
    if (client || child) { socket.close(1013, 'session busy'); return; }
    client = socket;
    let args = filterArgs();
    let historyMode = false;
    const send = data => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 512 * 1024) { socket.close(1013, 'slow client'); stop(); return; }
      socket.send(JSON.stringify(data));
    };
    socket.on('error', stop);
    let challenge;
    function revision(msg) {
      switch (msg.command) {
        case 'clear_packets': return JSON.stringify([history.next,history.stats.packetCount,Boolean(child)]);
        case 'clear_events': return monitor.detector.events[0]?.id ?? '';
        case 'active_dns': return activeDns;
        case 'monitor_rules': return JSON.stringify(monitor.detector.rules);
        case 'device_preference': {
          const d = monitor.inventory.devices.get(msg.id);
          return JSON.stringify([d?.label,d?.trusted]);
        }
      }
    }
    socket.on('close', () => { admin.lock(); client = undefined; stop(); });
    socket.on('message', async raw => {
      let msg;
      try {
        try { msg = JSON.parse(raw); } catch { throw Error('Invalid JSON command.'); }
        if (msg?.type !== 'control' || typeof msg.command !== 'string') throw Error('expected control');
        if (msg.command === 'admin_resume') {
          const pending = challenge;
          challenge = undefined;
          if (!pending || msg.challenge !== pending.id || pending.generation !== admin.generation || pending.until <= Date.now() ||
              pending.revision !== revision(pending.msg) || !admin.record || !admin.permits(msg.token))
            throw Error('Action expired or changed. Review it and try again.');
          msg = {...pending.msg,token:msg.token};
        } else if (msg.command.startsWith('admin_')) {
          const result = await admin.command(msg);
          send({...result,requestId:msg.requestId});
          return;
        }
        if (['monitor_rules','device_preference','active_dns','clear_packets','clear_events'].includes(msg.command) &&
            !admin.permits(msg.token)) {
          challenge = {id:randomUUID(),msg,revision:revision(msg),generation:admin.generation,until:Date.now()+5*60_000};
          send({type:'admin_required',challenge:challenge.id,requestId:msg.requestId});
          return;
        }
        if (msg.command === 'clear_events') {
          if (msg.newest !== (monitor.detector.events[0]?.id ?? '') || msg.total !== monitor.detector.events.length)
            throw Error('Security history changed. Review it before deleting.');
          if (monitor.store?.error) throw Error(monitor.store.error);
          monitor.detector.events = [];
          monitor.changed();
          await monitor.store?.flush();
          if (monitor.store?.error) throw Error(monitor.store.error);
          send(monitor.view()); return;
        }
        if (['monitor','device_preference','monitor_rules','ack_event'].includes(msg.command)) { send(monitor.command(msg)); return; }
        if (msg.command === 'active_dns' && typeof msg.enabled === 'boolean') {
          activeDns=msg.enabled;
          if (!activeDns) { names?.close(); names=null; }
          else if (monitor.context && !monitor.context.replay) {
            for (const [ip,d] of monitor.bindings) monitor.resolveNeighbor(d.source,ip,d.id);
          }
          send({type:'dns_setting',enabled:activeDns}); return;
        }
        if (msg.command === 'history' && !child) {
          historyMode = true;
          // Acknowledge each page before sending the next one to bound WebSocket buffering.
          const offset = msg.offset ?? 0;
          if (!Number.isSafeInteger(offset) || offset < 0) throw Error('invalid history offset');
          const packets = history.rows.slice(offset,offset+128);
          send({...history.message(packets),offset,historyPage:true,
            nextOffset:offset+packets.length < history.rows.length ? offset+packets.length : null});
          return;
        }
        if (msg.command === 'clear_packets' && !child) {
          names?.close(); names=null; history.clear();
          send({...history.message([]),historyPage:true,offset:0,nextOffset:null}); return;
        }
        if (msg.command === 'list_sources') {
          send({type:'sources', mode, sources, sourceLabels, selected,activeDns}); return;
        }
        if (msg.command === 'select_source' && !child) {
          if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= sources.length)
            throw Error('invalid source');
          selected = msg.index;
          send({type:'sources', mode, sources, sourceLabels, selected}); return;
        }
        if (msg.command === 'stop_capture') { stop(); return; }
        if (msg.command === 'set_filter' && !child) { args = filterArgs(msg.filter); return; }
        if (msg.command !== 'start_capture' || child) throw Error('invalid command or session state');
        history.begin();
        monitor.begin(sources[selected],mode === '--replay');
        let final;
        let diagnostic = '';
        const env = {...process.env,NETSENTINEL_HISTORY:"1"};
        if (historyMode) env.NETSENTINEL_DIAGNOSTICS = '1';
        const proc = spawn(executable, [mode, sources[selected], ...args], { env, stdio: ['pipe','pipe','pipe'], windowsHide: true });
        child = proc;
        proc.stderr.setEncoding('utf8');
        proc.stderr.on('data', text => {
          diagnostic = (diagnostic + text).slice(-1024);
          process.stderr.write(text);
        });
        proc.stdin.on('error', () => {});
        const observed = new ObservedNames();
        createInterface({input: proc.stdout}).on('line', line => {
          try {
            const batch = JSON.parse(line);
            const lookup = resolver(sources[selected]);
            for (const p of batch.packets) {
              observed.inspect(p,sources[selected]);
              p.sourceHostname = lookup?.get(p.source);
              p.destinationHostname = lookup?.get(p.destination);
              if (monitor.context) p.networkScope = monitor.context.scope;
              monitor.packet(p);
            }
            const cumulative = history.append(batch,sources[selected]);
            monitor.detector.rate(monitor.context,cumulative,Date.now());
            const outgoing = historyMode ? cumulative : {...batch,packets:batch.packets.filter(p=>p.visible)};
            if (batch.captureState === 'PAUSED') final = outgoing;
            else send(outgoing);
          } catch { stop(); send({type:'error', message:'invalid capture output'}); }
        });
        proc.on('error', error => { diagnostic = 'Cannot launch capture: ' + error.message; });
        proc.on('close', code => {
          clearTimeout(watchdog);
          watchdog = undefined;
          child = undefined;
          monitor.stop();
          if (code === 0 && final && !final.failed) {
            send(final);
            return;
          }
          const message = diagnostic.trim().split(/\r?\n/).at(-1) || 'Capture worker stopped unexpectedly';
          history.stats = {...history.stats, captureState:'PAUSED', failed:true, failureMessage:message};
          send({...(final ?? history.message([])), captureState:'PAUSED', failed:true, failureMessage:message});
          send({type:'error', message});
        });
      } catch (e) {
        const credentialRequest = typeof msg?.command === 'string' && msg.command.startsWith('admin_') && msg.command !== 'admin_resume';
        send({type:credentialRequest ? 'admin_error' : 'error',requestId:msg?.requestId,message:e.message});
      }
    });
  });
  return { server, async close() {
    admin.lock();
    const stopped = child && once(child,'close').catch(() => {});
    monitor.stop();
    activeDns = false;
    names?.close();
    names = null;
    stop();
    client?.terminate();
    server.close();
    http.close();
    await stopped;
    await monitor.store?.flush();
  } };
}
