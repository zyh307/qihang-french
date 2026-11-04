import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Zip,ZipDeflate} from 'fflate';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appName=JSON.parse(await fs.readFile(path.join(app,'src/manifest.json'),'utf8')).name;
const startName=`启动${appName}.bat`;
const output=path.join(app,'分享版'),web=path.join(output,'网页');
await fs.access(path.join(app,'dist/build/h5/index.html'));
const dictionaryAudioIndex=JSON.parse(await fs.readFile(path.join(app,'dist/build/h5/static/lexicon/audio/index.json'),'utf8'));
const dictionaryAudioFiles=new Set(Object.values(dictionaryAudioIndex.entries).map(clip=>clip.file));
await fs.mkdir(output,{recursive:true});
// Replace only the generated web resources; never copy browser profiles or backups.
if((await fs.realpath(output)).toLowerCase()!==output.toLowerCase())throw new Error('分享目录不能指向项目外部');
await fs.cp(path.join(app,'native/build/windows-host'),path.join(output,'口语运行'),{recursive:true});
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
await fs.cp(path.join(app,'dist/build/h5'),web,{recursive:true,filter:source=>!/[\\/]static[\\/]lexicon[\\/]audio[\\/][a-f0-9]{64}\.mp3$/.test(source)||dictionaryAudioFiles.has(path.basename(source))});
const start=await fs.readFile(path.join(app,'launcher/start.bat'),'utf8');
await fs.writeFile(path.join(output,startName),start.replace(/\r?\n/g,'\r\n'),'utf8');
await fs.copyFile(path.join(app,'SOURCES.md'),path.join(output,'SOURCES.md'));
for(const name of ['LICENSE','COPYRIGHT'])await fs.copyFile(path.join(app,name),path.join(output,name));
const guide=await fs.readFile(path.join(app,'docs/使用教程.md'),'utf8');
const plainGuide=guide.replace(/^#{1,3} /gm,'').replace(/^```.*$/gm,'').replace(/`/g,'').replace(/\*\*/g,'');
await fs.writeFile(path.join(output,'使用说明.txt'),'\uFEFF'+plainGuide.replace(/\r?\n/g,'\r\n'),'utf8');
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
async function addFile(relative){
 const entry=new ZipDeflate(appName+'/'+relative.replaceAll('\\','/'),{level:1});zipper.add(entry);count++;
 for await(const bytes of createReadStream(path.join(output,relative),{highWaterMark:256*1024})){
  if(streamError)throw streamError;entry.push(bytes,false);if(stream.writableNeedDrain)await once(stream,'drain');
 }
 entry.push(new Uint8Array(),true);
}
async function addWeb(directory='网页'){
  for(const entry of await fs.readdir(path.join(output,directory),{withFileTypes:true})){
    const relative=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw new Error('分享资源不能包含外部链接');
    if(entry.isDirectory())await addWeb(relative);else await addFile(relative);
  }
}
await addWeb();
await addWeb('口语运行');
for(const name of [startName,'使用说明.txt','使用教程.html','SOURCES.md','LICENSE','COPYRIGHT'])await addFile(name);
const completed=once(stream,'finish');zipper.end();await completed;if(streamError)throw streamError;
await fs.rename(archive+'.part',archive);
if((await fs.stat(archive)).size>=2*1024*1024*1024)throw Error('Windows 包超过 GitHub 单资产限制，请检查运行资源。');
console.log('分享版已生成：'+output);
console.log(`Windows 分享包已生成：${archive}（${count} 个文件，法语识别模型独立导入）`);
