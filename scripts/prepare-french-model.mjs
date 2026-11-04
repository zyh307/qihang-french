// Optional build-time preparation of the standalone pinned model asset.
// An explicit local file avoids another download without relaxing verification.
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'native/model-manifest.json'),'utf8'));
export const modelFile=path.resolve(process.env.QIHANG_MODEL_FILE||path.join(root,'native/build/models',manifest.filename));
export async function verifyModel(file){
 const info=await fs.stat(file);if(info.size!==manifest.size)throw Error('法语模型大小不符，请选择固定版本的 '+manifest.filename);
 const sha=createHash('sha256');for await(const bytes of createReadStream(file))sha.update(bytes);
 if(sha.digest('hex')!==manifest.sha256)throw Error('法语模型 SHA-256 校验失败，不能用于发布。');
}
export async function prepareFrenchModel(){
 try{await verifyModel(modelFile);console.log('French model verified: '+modelFile);return modelFile;}
 catch(error){if(error.code!=='ENOENT'||process.env.QIHANG_MODEL_FILE)throw error;}
 await fs.mkdir(path.dirname(modelFile),{recursive:true});
 const urls=['https://github.com/zyh307/qihang-french/releases/download/v2.1.1-beta.1/'+manifest.filename,...manifest.sources.map(source=>source.url)];
 let last;
 for(const url of urls){
  const partial=modelFile+'.download';
  try{
   console.log('Downloading the standalone pinned French model…');
   const response=await fetch(url,{signal:AbortSignal.timeout(30*60*1000)});
   if(!response.ok||!response.body)throw Error('Model download returned HTTP '+response.status);
   if(response.headers.get('content-length')&&Number(response.headers.get('content-length'))!==manifest.size)throw Error('Incorrect download size');
   await pipeline(Readable.fromWeb(response.body),createWriteStream(partial));
   await verifyModel(partial);await fs.rename(partial,modelFile);return modelFile;
  }catch(error){last=error;await fs.rm(partial,{force:true});}
 }
 throw Error('独立模型文件准备失败：下载未完成。可设置 QIHANG_MODEL_FILE 指向已校验模型。'+last?.message);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareFrenchModel();
