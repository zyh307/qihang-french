import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Zip,ZipDeflate} from 'fflate';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {isPrivateAssetPath} from './private-assets.mjs';
import {windowsWorkshopRuntime} from './windows-workshop-runtime.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const oralPython=await windowsWorkshopRuntime(app);
const appName=JSON.parse(await fs.readFile(path.join(app,'src/manifest.json'),'utf8')).name;
const startName=`启动${appName}.bat`;
const output=path.join(app,'分享版'),web=path.join(output,'网页');
const desktop=path.join(app,'native/build/desktop'),desktopManifest=JSON.parse(await fs.readFile(path.join(desktop,'desktop-files.json'),'utf8'));
if(desktopManifest.version!==JSON.parse(await fs.readFile(path.join(app,'src/manifest.json'),'utf8')).versionName)throw Error('请先构建当前版本 EXE');
await fs.access(path.join(app,'dist/build/h5/index.html'));
const dictionaryAudioIndex=JSON.parse(await fs.readFile(path.join(app,'dist/build/h5/static/lexicon/audio/index.json'),'utf8'));
const dictionaryAudioFiles=new Set(Object.values(dictionaryAudioIndex.entries).map(clip=>clip.file));
await fs.mkdir(output,{recursive:true});
for(const file of desktopManifest.files){if(isPrivateAssetPath(file.name))continue;const target=path.join(output,file.name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(desktop,file.name),target);}
// Replace only the generated web resources; never copy browser profiles or backups.
if((await fs.realpath(output)).toLowerCase()!==output.toLowerCase())throw new Error('分享目录不能指向项目外部');
await fs.cp(path.join(app,'native/build/windows-host'),path.join(output,'口语运行'),{recursive:true,filter:source=>!isPrivateAssetPath(path.relative(app,source))});
// Model weights are a separate Release asset. Remove only our old generated
// bundle directory so rebuilding over an earlier share package cannot leak it.
const oldModels=path.join(output,'口语运行/models');
const modelDirectory=await fs.lstat(oldModels).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
if(modelDirectory){if(modelDirectory.isSymbolicLink()||!(await fs.realpath(oldModels)).toLowerCase().startsWith(output.toLowerCase()+path.sep))throw Error('模型目录不能指向分享目录外部');await fs.rm(oldModels,{recursive:true,force:true});}
const runtimeSource=JSON.parse(await fs.readFile(path.join(output,'口语运行/runtime-source.json'),'utf8'));
runtimeSource.modelIncluded=false;delete runtimeSource.modelPath;
await fs.writeFile(path.join(output,'口语运行/runtime-source.json'),JSON.stringify(runtimeSource,null,2));
await fs.rm(path.join(output,'server.ps1'),{force:true});
await fs.rm(path.join(output,'口语运行/extra-audio-manifest.json'),{force:true});
const previousWeb=await fs.lstat(web).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
if(path.dirname(web)!==output||previousWeb?.isSymbolicLink())throw new Error('网页资源路径无效');
await fs.rm(web,{recursive:true,force:true});
await fs.cp(path.join(app,'dist/build/h5'),web,{recursive:true,filter:source=>!isPrivateAssetPath(path.relative(app,source))&&(!/[\\/]static[\\/]lexicon[\\/]audio[\\/][a-f0-9]{64}\.mp3$/.test(source)||dictionaryAudioFiles.has(path.basename(source)))});
const start=await fs.readFile(path.join(app,'launcher/start.bat'),'utf8');
await fs.writeFile(path.join(output,startName),start.replace(/\r?\n/g,'\r\n'),'utf8');
await fs.copyFile(path.join(app,'SOURCES.md'),path.join(output,'SOURCES.md'));
for(const name of ['LICENSE','COPYRIGHT'])await fs.copyFile(path.join(app,name),path.join(output,name));
const guide=(await fs.readFile(path.join(app,'docs/快速开始.txt'),'utf8')).replaceAll('__VERSION__',JSON.parse(await fs.readFile(path.join(app,'src/manifest.json'),'utf8')).versionName);
await fs.writeFile(path.join(output,'使用说明.txt'),'\uFEFF'+guide.replace(/\r?\n/g,'\r\n'),'utf8');
await fs.copyFile(path.join(app,'src/static/使用教程.html'),path.join(output,'使用教程.html'));

const launch=`@echo off\r\nchcp 65001 >nul\r\nstart "" "%~dp0分享版\\${startName}"\r\n`;
await fs.writeFile(path.join(app,startName),launch,'utf8');
await fs.writeFile(path.join(app,'启动启航法语.bat'),launch,'utf8');
// Package an explicit allowlist, so unrelated files or exported learning backups
// accidentally placed alongside the program can never enter the share archive.
const archive=path.join(app,`${appName}_分享版.zip`),stream=createWriteStream(archive+'.part');
let streamError;stream.on('error',error=>{streamError=error;});
const zipper=new Zip((error,bytes,final)=>{if(error)throw error;stream.write(bytes);if(final)stream.end();});
let count=0;
async function addFile(relative, source=path.join(output,relative)){
 if(isPrivateAssetPath(relative)||isPrivateAssetPath(source))return;
 const entry=new ZipDeflate(appName+'/'+relative.replaceAll('\\','/'),{level:relative.endsWith('.cab')?0:1});zipper.add(entry);count++;
 for await(const bytes of createReadStream(source,{highWaterMark:256*1024})){
  if(streamError)throw streamError;entry.push(bytes,false);if(stream.writableNeedDrain)await once(stream,'drain');
 }
 entry.push(new Uint8Array(),true);
}
async function addWeb(directory='网页'){
  for(const entry of await fs.readdir(path.join(output,directory),{withFileTypes:true})){
    const relative=path.join(directory,entry.name);
    if(isPrivateAssetPath(relative))continue;
    if(entry.isSymbolicLink())throw new Error('分享资源不能包含外部链接');
    if(entry.isDirectory())await addWeb(relative);else await addFile(relative);
  }
}
await addWeb();
await addWeb('口语运行');
await addWeb('桌面运行');
for(const name of [appName+'.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','使用说明.txt','使用教程.html','SOURCES.md','LICENSE','COPYRIGHT'])await addFile(name);
const oralSource=path.join(app,'oral-assistant');
const oralRuntimeFiles=(await fs.readdir(oralSource,{withFileTypes:true}))
 .filter(entry=>entry.isFile()&&/\.py$/.test(entry.name)).map(entry=>entry.name);
const oralWorkspaceFiles=[
 ...oralRuntimeFiles,'README.md','DAILY_PRACTICE.md','LECTURE.md','UNIT_PRACTICE.md',
 'requirements.lock.txt','requirements-french.txt','requirements-french-gpu.txt','requirements-whisper-eval.lock.txt',
 '启动口语助手.cmd','启动口语助手.ps1','units/inspire1-u4.json',
 'scripts/prepare_model.py','scripts/prepare_fluency_demo.py','scripts/prepare_slot_demo.py','scripts/preview_daily_practice.py',
 'scripts/validate_daily_practice.py',
 '.desktop/desktop.html','.desktop/desktop.js','.desktop/desktop.css','.desktop/opening-comic.png',
 ...['index.html','app.js','capture.js','style.css','practice-audio-gate.js','bank.json'].map(name=>'web/'+name),
];
const workshop='桌面口语练习室';
async function stageWorkshop(relative, source) {
  const target = path.join(output, workshop, relative);
  await fs.mkdir(path.dirname(target), {recursive:true});
  if (!(await fs.realpath(path.dirname(target))).toLowerCase().startsWith(output.toLowerCase()+path.sep) ||
      (await fs.lstat(target).catch(()=>null))?.isSymbolicLink()) throw new Error('口语组件路径不能指向分享目录外部');
  await fs.copyFile(source,target);
  await addFile(workshop+'/'+relative);
}
for(const name of oralWorkspaceFiles)await stageWorkshop(name,path.join(oralSource,name));
async function addWorkshopRuntime(folder='') {
  for(const entry of await fs.readdir(path.join(oralPython,folder),{withFileTypes:true})) {
    if(entry.isSymbolicLink())throw new Error('口语运行环境不能包含外部链接');
    const name=path.join(folder,entry.name);
    if(entry.isDirectory()) {
      if(!['__pycache__','bin'].includes(entry.name))await addWorkshopRuntime(name);
    } else if(!/\.(pyc|pyo)$/i.test(name))await stageWorkshop(path.join('python',name),path.join(oralPython,name));
  }
}
await addWorkshopRuntime();
const completed=once(stream,'finish');zipper.end();await completed;if(streamError)throw streamError;
await fs.rename(archive+'.part',archive);
if((await fs.stat(archive)).size>=2*1024*1024*1024)throw Error('Windows 包超过 GitHub 单资产限制，请检查运行资源。');
console.log('分享版已生成：'+output);
console.log(`Windows 分享包已生成：${archive}（${count} 个文件，法语识别模型独立导入）`);
