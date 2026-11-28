import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

if (process.platform !== 'win32' || process.arch !== 'x64' || !process.env.NPCAP_SDK_ROOT) {
  throw Error('Build on Windows x64 with MSYS2 UCRT64 on PATH and NPCAP_SDK_ROOT set.');
}
const run = (file, args) => execFileSync(file, args, { stdio: 'inherit' });
const build = 'backend/build/desktop-native';
const out = 'backend/build/desktop-resources';
run('cmake', ['-S', 'backend', '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_TESTING=OFF', '-DBUILD_CAPTURE_APP=ON', '-DCMAKE_CXX_COMPILER=g++',
  '-DCMAKE_EXE_LINKER_FLAGS=-static -s', '-DNPCAP_SDK_ROOT=' + process.env.NPCAP_SDK_ROOT]);
run('cmake', ['--build', build, '--target', 'netsentinel']);
const worker = join(build, 'netsentinel.exe');
const imports = execFileSync('objdump', ['-p', worker], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const dlls = Array.from(imports.matchAll(/DLL Name:\s*(\S+)/gi), match => match[1].toLowerCase());
if (!dlls.includes('wpcap.dll') || dlls.some(dll =>
  !/^(?:wpcap|kernel32|ws2_32|msvcrt|ucrtbase|advapi32|mswsock|api-ms-win-[\w-]+)\.dll$/.test(dll))) {
  throw Error('Review native runtime imports before packaging: ' + dlls.join(', '));
}
console.log('Native imports:', dlls.join(', '));
await mkdir(out, { recursive: true });
await cp(worker, join(out, 'netsentinel.exe'));
const temp = await mkdtemp(join(tmpdir(), 'netsentinel-demo-'));
try {
  const fixture = join(temp, 'demo.pcap');
  run(process.execPath, ['backend/service/security-demo.mjs', fixture]);
  await cp(fixture, join(out, 'demo.pcap'));
} finally {
  await rm(temp, { recursive: true, force: true });
}
const notices = join(out, 'notices');
await mkdir(notices, { recursive: true });
const compiler = execFileSync('where.exe', ['g++'], { encoding: 'utf8' }).split(/\r?\n/)[0];
const licenses = resolve(dirname(compiler), '../share/licenses');
for (const name of ['gcc', 'crt', 'libwinpthread']) {
  const folder = join(licenses, name);
  for (const file of await readdir(folder)) {
    if (file.startsWith('COPYING')) await cp(join(folder, file), join(notices, name + '-' + file + '.txt'));
  }
}
for (const name of ['react', 'react-dom', 'scheduler']) {
  await cp(join('frontend/node_modules', name, 'LICENSE'), join(notices, name + '.txt'));
}
await cp('node_modules/ws/LICENSE', join(notices, 'ws.txt'));
