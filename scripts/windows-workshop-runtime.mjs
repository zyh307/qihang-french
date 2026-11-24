import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const version = '3.13.14';
const filename = `python-${version}-embed-amd64.zip`;
const sha256 = '90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907';

function run(file, args) {
  const result = spawnSync(file, args, {stdio:'inherit', windowsHide:true});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Cannot build Windows oral runtime (${file})`);
}

export async function windowsWorkshopRuntime(root) {
  const cache = path.join(root, '.native-tools', 'oral-workshop');
  const mainLock = await fs.readFile(path.join(root, 'oral-assistant', 'requirements.lock.txt'), 'utf8');
  const asrLock = await fs.readFile(path.join(root, 'oral-assistant', 'requirements-whisper-eval.lock.txt'), 'utf8');
  // The recognizer lock also pins the PyAV and NumPy versions used for recording.
  const requirements = new Map();
  for (const line of (mainLock + '\n' + asrLock).split(/\r?\n/)) {
    if (line.includes('==')) requirements.set(line.split('==')[0].toLowerCase(), line);
  }
  const lock = [...requirements.values()].join('\n') + '\n';
  const key = createHash('sha256').update(sha256).update(lock).digest('hex').slice(0, 16);
  const runtime = path.join(cache, key), marker = path.join(runtime, 'runtime-source.json');
  if (await fs.access(marker).then(()=>true,()=>false)) return runtime;
  await fs.mkdir(runtime, {recursive:true});
  const archive = path.join(cache, filename);
  const source = `https://www.python.org/ftp/python/${version}/${filename}`;
  async function verified() {
    const bytes = await fs.readFile(archive).catch(()=>null);
    return bytes && createHash('sha256').update(bytes).digest('hex') === sha256;
  }
  if (!await verified()) run('curl.exe', ['-fLsS', '--retry', '2', source, '-o', archive]);
  if (!await verified()) throw new Error('Windows 口语运行环境校验失败');
  run('python', ['-m','zipfile','-e',archive,runtime]);
  const lockPath = path.join(runtime,'requirements-desktop.lock.txt');
  await fs.writeFile(lockPath, lock);
  run('python', ['-m','pip','install','--disable-pip-version-check','--only-binary=:all:',
    '--no-deps','--no-compile','--upgrade','--platform','win_amd64','--implementation','cp','--python-version','3.13',
    '--target',path.join(runtime,'site-packages'),'-r',lockPath]);
  await fs.writeFile(path.join(runtime,'python313._pth'),'python313.zip\n.\nsite-packages\n..\n');
  run(path.join(runtime,'python.exe'), ['-B','-c','import aiohttp, av, numpy, faster_whisper, ctranslate2']);
  await fs.writeFile(marker, JSON.stringify({version, source, sha256}, null, 2)+'\n');
  return runtime;
}
