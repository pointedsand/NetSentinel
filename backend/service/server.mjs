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

export function serve({ executable, mode, source, sources = [source], port = 8080, dns = false,
                        origin = 'http://localhost:5173' }) {
  if (!executable || !source || !['--interface','--replay'].includes(mode)) throw Error('invalid capture source');
  const history = new PacketHistory();
  let activeDns = dns, names, resolverSource;
  function resolver(source) {
    if (resolverSource !== source) { names?.close(); names = null; resolverSource = source; }
    if (activeDns && !names) names = new Hostnames({onResult(ip,name) {
      history.applyPtr(source,ip,name);
      if (client?.readyState === WebSocket.OPEN && client.bufferedAmount < 512*1024)
        client.send(JSON.stringify({type:'ptr',source,ip,name}));
    }});
    return names;
  }
  let child, client;
  const server = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: 4096,
    perMessageDeflate: false, verifyClient: info => !info.origin || info.origin === origin });
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
    let selected = 0;
    let historyMode = false;
    const send = data => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 512 * 1024) { socket.close(1013, 'slow client'); stop(); return; }
      socket.send(JSON.stringify(data));
    };
    socket.on('error', stop);
    socket.on('close', () => { client = undefined; stop(); });
    socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type !== 'control') throw Error('expected control');
        if (msg.command === 'active_dns' && typeof msg.enabled === 'boolean') {
          activeDns=msg.enabled;
          if (!activeDns) { names?.close(); names=null; }
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
          send({type:'sources', mode, sources, selected,activeDns}); return;
        }
        if (msg.command === 'select_source' && !child) {
          if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= sources.length)
            throw Error('invalid source');
          selected = msg.index;
          send({type:'sources', mode, sources, selected}); return;
        }
        if (msg.command === 'stop_capture') { stop(); return; }
        if (msg.command === 'set_filter' && !child) { args = filterArgs(msg.filter); return; }
        if (msg.command !== 'start_capture' || child) throw Error('invalid command or session state');
        history.begin();
        let final;
        const env = {...process.env,NETSENTINEL_HISTORY:"1"};
        if (historyMode) env.NETSENTINEL_DIAGNOSTICS = '1';
        const proc = spawn(executable, [mode, sources[selected], ...args], { env, stdio: ['pipe','pipe','inherit'], windowsHide: true });
        child = proc;
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
            }
            const cumulative = history.append(batch,sources[selected]);
            const outgoing = historyMode ? cumulative : {...batch,packets:batch.packets.filter(p=>p.visible)};
            if (batch.captureState === 'PAUSED') final = outgoing;
            else send(outgoing);
          } catch { stop(); send({type:'error', message:'invalid capture output'}); }
        });
        proc.on('error', () => send({type:'error', message:'cannot launch capture'}));
        proc.on('close', code => {
          clearTimeout(watchdog);
          watchdog = undefined;
          child = undefined;
          if (final) send(final);

          if (code !== 0) send({type:'error', message:'capture failed'});
        });
      } catch (e) { send({type:'error', message:e.message}); }
    });
  });
  return { server, close() { activeDns=false; names?.close(); names=null; stop(); client?.terminate(); server.close(); } };
}
