import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tools=path.join(root,'.native-tools'),out=path.join(root,'native/build/windows-host'),classes=path.join(root,'native/build/classes');
await fs.mkdir(out,{recursive:true});if(path.relative(root,classes)!==path.join('native','build','classes'))throw Error('Invalid build directory');await fs.rm(classes,{recursive:true,force:true});await fs.mkdir(classes,{recursive:true});
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,windowsHide:true,stdio:'inherit'});if(r.error||r.status)throw r.error||Error(cmd+' failed: '+r.status);}
async function sources(dir){const all=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isDirectory())all.push(...await sources(path.join(dir,e.name)));else if(e.name.endsWith('.java'))all.push(path.join(dir,e.name));}return all;}
run('D:/bin/javac.exe',['-source','17','-target','17','-Xlint:-options','-encoding','UTF-8','-cp',path.join(tools,'json.jar'),'-d',classes,...await sources(path.join(root,'native/common')),...await sources(path.join(root,'native/windows'))]);
run('D:/bin/jar.exe',['cf',path.join(out,'qihang-oral.jar'),'-C',classes,'.']);
await fs.copyFile(path.join(tools,'json.jar'),path.join(out,'json.jar'));
const asset=JSON.parse(await fs.readFile(path.join(tools,'jre-assets.json'),'utf8'))[0];
const archive=await fs.readFile(path.join(tools,'temurin-jre.zip'));if(createHash('sha256').update(archive).digest('hex')!==asset.binary.package.checksum)throw Error('JRE 校验失败');
const jreDir=(await fs.readdir(path.join(tools,'jre'))).find(n=>n.startsWith('jdk-'));if(!jreDir)throw Error('JRE 未解压');await fs.cp(path.join(tools,'jre',jreDir),path.join(out,'runtime'),{recursive:true});
await fs.mkdir(path.join(out,'bin'),{recursive:true});await fs.copyFile(path.join(root,'native/build/windows/qihang_speech.dll'),path.join(out,'bin/qihang_speech.dll'));
const whisperBin=process.env.QIHANG_WHISPER_BIN||path.join(tools,'whisper-win/Release');
for(const name of ['whisper.dll','ggml.dll','ggml-base.dll','ggml-cpu.dll'])await fs.copyFile(path.join(whisperBin,name),path.join(out,'bin',name));
// Keep optional acceleration plugins with the pinned 1.8.3 runtime. Without a
// supported GPU the same model continues on CPU; no weights are converted.
for(const name of ['ggml-blas.dll','libopenblas.dll','ggml-cuda.dll','cublas64_12.dll','cublasLt64_12.dll','cudart64_12.dll','nvrtc64_120_0.dll','nvrtc-builtins64_124.dll']){
 const source=path.join(whisperBin,name);if(await fs.access(source).then(()=>true,()=>false))await fs.copyFile(source,path.join(out,'bin',name));
}
for(const name of ['libwinpthread-1.dll'])await fs.copyFile(path.join('D:/mingw64/bin',name),path.join(out,'bin',name));
for(const name of ['msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll']){try{await fs.copyFile(path.join(out,'runtime/bin',name),path.join(out,'bin',name));}catch(error){if(error.code!=='ENOENT')throw error;}}
const openmp=path.join(tools,'vcredist-cabs/1/expanded-a12/vcomp140.dll_amd64');
const openmpBytes=await fs.readFile(openmp),openmpSha=createHash('sha256').update(openmpBytes).digest('hex');
if(openmpSha!=='55aba23cdcd6484fbb06f4155b8ca75adfce7a881f10afd0c49457165e677164')throw Error('OpenMP 运行库校验失败');
await fs.copyFile(openmp,path.join(out,'bin/vcomp140.dll'));
for(const name of ['model-manifest.json','evaluation-schema.json'])await fs.copyFile(path.join(root,'native',name),path.join(out,name));
await fs.cp(path.join(root,'native/licenses'),path.join(out,'licenses'),{recursive:true});
await fs.writeFile(path.join(out,'runtime-source.json'),JSON.stringify({jre:asset.release_name,source:asset.binary.package.link,sha256:asset.binary.package.checksum,whisper:'v1.8.3',opus:'1.5.2',openmp:{version:'14.44.35211.0',source:'https://aka.ms/vs/17/release/vc_redist.x64.exe',installerSha256:'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b',dllSha256:openmpSha},modelIncluded:false},null,2));
console.log('Windows 本地运行包已生成');
