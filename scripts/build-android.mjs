import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {unzipSync,zipSync} from 'fflate';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(root,'../../..');
const sdk=process.env.QIHANG_ANDROID_TOOLS||path.join(workspace,'法语变位器3.0/.android-tools');
const tools=path.join(sdk,'build-tools/android-15');
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'D:/bin';
const build=path.join(root,'android/build'),signing=path.join(root,'android/signing');
const output=path.join(root,'安卓安装包');
let version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
let appName=JSON.parse(fs.readFileSync(path.join(root,'src/manifest.json'),'utf8')).name;
let androidManifest=fs.readFileSync(path.join(root,'android/AndroidManifest.xml'),'utf8');
const repairArgument=process.argv.find(a=>a.startsWith('--repair-existing='));
const repairFile=repairArgument?path.resolve(root,repairArgument.slice('--repair-existing='.length)):null;
const refreshRepairWeb=process.argv.includes('--repair-current-web');
const revisionArgument=process.argv.find(a=>a.startsWith('--repair-revision='));
const repairRevision=refreshRepairWeb?Number(revisionArgument?.slice('--repair-revision='.length)||2):1;
if(!Number.isInteger(repairRevision)||repairRevision<1||repairRevision>99)throw new Error('修复版本号无效');
if(refreshRepairWeb&&!repairFile)throw new Error('更新修复版页面需要指定原安装包');
const sourceManifest=JSON.parse(fs.readFileSync(path.join(root,'src/manifest.json'),'utf8'));
let repairAssets=null;
if(repairFile){
  // Keep a hotfix independent of unfinished UI/name changes in the checkout.
  const inspect=spawnSync(path.join(tools,'aapt2.exe'),['dump','badging',repairFile],{windowsHide:true,encoding:'utf8'});
  if(inspect.status!==0)throw new Error('无法读取原安装包');
  const originalPackage=inspect.stdout.match(/^package: name='([^']+)'/m)?.[1];
  const originalCode=Number(inspect.stdout.match(/versionCode='(\d+)'/)?.[1]);
  const originalVersion=inspect.stdout.match(/versionName='([^']+)'/)?.[1];
  if(originalPackage!=='cn.qihang.francais'||originalCode!==20100||originalVersion!=='2.1.0')throw new Error('修复入口仅用于已交付的 2.1.0 安装包');
  const originalBytes=fs.readFileSync(repairFile);
  if(createHash('sha256').update(originalBytes).digest('hex')!=='c23b3be0204cf38f608c92e140e9e0ae64923457bda484c3f3bb25234771bc75')throw new Error('原安装包与交付校验值不符');
  repairAssets=unzipSync(originalBytes);version='2.1.0.'+repairRevision;appName='启航法语';
  androidManifest=androidManifest.replace(/\bpackage="[^"]+"/,'package="'+originalPackage+'"').replace(/android:versionCode="[^"]+"/,'android:versionCode="'+(originalCode+repairRevision)+'"').replace(/android:versionName="[^"]+"/,'android:versionName="'+version+'"').replace(/android:label="[^"]+"/,'android:label="'+appName+'"').replace(/android:authorities="[^"]+"/,'android:authorities="'+originalPackage+'.share"');
}
const packageId=androidManifest.match(/\bpackage="([^"]+)"/)[1];
const versionCode=androidManifest.match(/android:versionCode="([^"]+)"/)[1];
if(packageId!=='cn.qihang.francais'||!androidManifest.includes('android:authorities="'+packageId+'.share"'))throw new Error('包名或分享标识不正确');
const env={...process.env,npm_config_cache:path.join(workspace,'.npm-cache(打包工具)')};
function run(program,args,extra={}){
  const result=spawnSync(program,args,{cwd:root,env,windowsHide:true,stdio:'inherit',...extra});
  if(result.error)throw result.error;if(result.status!==0)throw new Error(`${path.basename(program)} failed: ${result.status}`);
}
for(const file of [path.join(tools,'aapt2.exe'),path.join(tools,'zipalign.exe'),path.join(sdk,'platform/android-35/android.jar'),path.join(java,'javac.exe')])if(!fs.existsSync(file))throw new Error('缺少现有打包工具：'+file);
// Only the disposable build directory is removed; retain the app's signing key.
if(path.dirname(build)!==path.join(root,'android'))throw new Error('Unexpected build path');
fs.rmSync(build,{recursive:true,force:true});
for(const dir of [build,path.join(build,'classes'),path.join(build,'dex'),signing,output])fs.mkdirSync(dir,{recursive:true});
if(!repairAssets&&!process.argv.includes('--skip-web'))run(process.execPath,['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js','build']);
fs.copyFileSync(path.join(sdk,'platform/android-35/android.jar'),path.join(build,'android.jar'));
run(path.join(tools,'aapt2.exe'),['compile','--dir','android/res','-o','android/build/resources.zip']);
fs.writeFileSync(path.join(build,'AndroidManifest.xml'),androidManifest);
run(path.join(tools,'aapt2.exe'),['link','-I','android/build/android.jar','--manifest','android/build/AndroidManifest.xml','-o','android/build/resources.apk','android/build/resources.zip']);
const sources=[];function collect(dir,extension,result){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())collect(name,extension,result);else if(name.endsWith(extension))result.push(path.relative(root,name));}}
collect(path.join(root,'android/src'),'.java',sources);
collect(path.join(root,'native/common'),'.java',sources);
run(path.join(java,'javac.exe'),['-source','8','-target','8','-Xlint:-options','-encoding','UTF-8','-bootclasspath','android/build/android.jar'+path.delimiter+path.join(tools,'core-lambda-stubs.jar'),'-d','android/build/classes',...sources]);
const classes=[];collect(path.join(build,'classes'),'.class',classes);
run(path.join(java,'java.exe'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib','android/build/android.jar','--output','android/build/dex',...classes]);
const contents=unzipSync(fs.readFileSync(path.join(build,'resources.apk')));
// Write web assets with UTF-8 ZIP names: Windows aapt2 cannot open Chinese filenames.
const web=path.join(root,'dist/build/h5');
const dictionaryAudioIndex=JSON.parse(fs.readFileSync(path.join(web,'static/lexicon/audio/index.json'),'utf8'));
const dictionaryAudioFiles=new Set(Object.values(dictionaryAudioIndex.entries).map(clip=>clip.file));
function addAssets(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('网页资源不能包含外部链接');if(entry.isDirectory())addAssets(file);else{
 const relative=path.relative(web,file).replaceAll('\\','/');if(/^static\/lexicon\/audio\/[a-f0-9]{64}\.mp3$/.test(relative)&&!dictionaryAudioFiles.has(path.basename(relative)))continue;if(refreshRepairWeb&&relative.startsWith('static/'))continue;
 let bytes=fs.readFileSync(file);
 if(refreshRepairWeb&&/\.(?:js|html|json|css)$/.test(relative)){
  const text=bytes.toString('utf8').replaceAll(sourceManifest.name,appName).replaceAll('versionName:"'+sourceManifest.versionName+'"','versionName:"'+version+'"').replaceAll('"versionName":"'+sourceManifest.versionName+'"','"versionName":"'+version+'"').replaceAll('versionCode:"'+sourceManifest.versionCode+'"','versionCode:"'+versionCode+'"').replaceAll('"versionCode":"'+sourceManifest.versionCode+'"','"versionCode":"'+versionCode+'"');
  bytes=Buffer.from(text);
 }
 contents['assets/'+relative]=bytes;
}}}
if(repairAssets){for(const [name,bytes] of Object.entries(repairAssets))if(name.startsWith('assets/')||name.startsWith('lib/'))contents[name]=bytes;}
else{
addAssets(web);
for(const name of ['model-manifest.json','evaluation-schema.json'])contents['assets/native/'+name]=fs.readFileSync(path.join(root,'native',name));
const nativeLibrary=path.join(root,'android/jniLibs/arm64-v8a/libqihang_speech.so');
if(!fs.existsSync(nativeLibrary))throw new Error('缺少本机语音识别库，请先运行 build:native');
contents['lib/arm64-v8a/libqihang_speech.so']=fs.readFileSync(nativeLibrary);
}
// New Java selects these before JNI initialization. Never ship a new APK that
// silently loses hardware acceleration because the packer kept only baseline.
const androidVariants=['libqihang_cpu.so','libqihang_speech_fp16.so','libqihang_speech_dotprod.so'];
for(const name of androidVariants){
 const file=path.join(root,'android/jniLibs/arm64-v8a',name);
 if(!fs.existsSync(file))throw new Error('缺少安卓CPU加速库，请运行 python scripts/build-native.py android：'+name);
 contents['lib/arm64-v8a/'+name]=fs.readFileSync(file);
}
if(refreshRepairWeb){
 for(const name of Object.keys(contents))if(name.startsWith('assets/assets/'))delete contents[name];
 addAssets(web);
 if(repairRevision>=4){
  for(const name of ['local-client.js','native-bridge.js'])contents['assets/static/oral/'+name]=fs.readFileSync(path.join(root,'src/oral',name));
  contents['assets/static/oral/app.js']=fs.readFileSync(path.join(root,'oral-assistant/web/app.js'));
  if(!Buffer.from(contents['assets/static/oral/local-client.js']).toString('utf8').includes('binding.reconnect'))throw new Error('修复版缺少新会话连接逻辑');
  if(repairRevision>=5){
   const client=Buffer.from(contents['assets/static/oral/local-client.js']).toString('utf8'),interfaceScript=Buffer.from(contents['assets/static/oral/app.js']).toString('utf8');
   if(!client.includes('prepare_record')||!client.includes('async openStage()')||!interfaceScript.includes('打断并说话'))throw new Error('修复版缺少录音入口状态更新');
  }
  if(repairRevision>=6){
   for(const name of ['index.html','theme.css'])contents['assets/static/oral/'+name]=fs.readFileSync(path.join(root,'src/static/oral',name));
   contents['assets/static/oral/index.html']=Buffer.from(Buffer.from(contents['assets/static/oral/index.html']).toString('utf8').replaceAll(sourceManifest.name,appName));
   const page=Buffer.from(contents['assets/static/oral/index.html']).toString('utf8'),style=Buffer.from(contents['assets/static/oral/theme.css']).toString('utf8');
   if(!androidManifest.includes('android.permission.MODIFY_AUDIO_SETTINGS')||!page.includes('guide-example')||!style.includes('max-width:380px'))throw new Error('修复版缺少音频权限或窄屏排版');
  }
 }
 contents['assets/native/model-manifest.json']=fs.readFileSync(path.join(root,'native/model-manifest.json'));
 const originalModel=JSON.parse(Buffer.from(repairAssets['assets/native/model-manifest.json']).toString('utf8'));
 const updatedModel=JSON.parse(Buffer.from(contents['assets/native/model-manifest.json']).toString('utf8'));
 for(const key of ['repository','revision','filename','size','sha256'])if(originalModel[key]!==updatedModel[key])throw new Error('模型固定信息改变：'+key);
 if(updatedModel.sources[0].id!=='mirror')throw new Error('修复版未优先配置镜像');
 for(const [name,bytes] of Object.entries(contents))if(name.startsWith('assets/')&&/\.(?:js|html|json)$/.test(name)&&Buffer.from(bytes).toString('utf8').includes('启航法语测试版'))throw new Error('修复版包含未启用的应用名称：'+name);
 const interfaceText=Object.entries(contents).filter(([name])=>name.startsWith('assets/assets/')&&name.endsWith('.js')).map(([,bytes])=>Buffer.from(bytes).toString('utf8')).join('\n');
 for(const marker of ['优先下载源',repairRevision>=10?'法语识别模型':repairRevision>=8?'快速模型':'Whisper Large V3 French','麦克风已允许',version])if(!interfaceText.includes(marker))throw new Error('修复版缺少界面更新：'+marker);
 if(repairRevision>=3)for(const marker of ['microphonePermission','requestMicrophonePermission','qihang-microphone-permission'])if(!interfaceText.includes(marker))throw new Error('修复版缺少系统麦克风权限同步：'+marker);
 if(repairRevision>=6){
  if(!interfaceText.includes('autoEnter'))throw new Error('修复版缺少口语设置停留逻辑');
  const script=Buffer.from(contents['assets/static/oral/app.js']).toString('utf8');
  if(!script.includes('async function openMicrophone(')||!script.includes('captureEpoch'))throw new Error('修复版缺少录音重试与取消处理');
 }
 if(repairRevision>=7){
  const library=fs.readFileSync(path.join(root,'android/jniLibs/arm64-v8a/libqihang_speech.so'));
  for(const symbol of ['Java_cn_qihang_oral_NativeSpeech_prepare','Java_cn_qihang_oral_NativeSpeech_progress'])if(!library.includes(Buffer.from(symbol)))throw new Error('需要重新编译口语识别库：'+symbol);
  contents['lib/arm64-v8a/libqihang_speech.so']=library;
  const client=Buffer.from(contents['assets/static/oral/local-client.js']).toString('utf8');
  if(!client.includes("confirmation_status='automatic'")||!client.includes('confirm_transcript:false')||!client.includes('timeoutMs'))throw new Error('修复版缺少口语自动回复或识别状态更新');
 }
 if(repairRevision>=8){
  for(const name of ['OpenAI-Whisper-MIT.txt','SOURCES.md'])contents['assets/static/oral/licenses/'+name]=fs.readFileSync(path.join(root,'native/licenses',name));
  if(repairRevision<10&&updatedModel.alternatives?.[0]?.sha256!=='ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb')throw new Error('快速模型固定信息不符');
  if(repairRevision>=10&&(updatedModel.alternatives||updatedModel.defaultProfile||interfaceText.includes('快速模型')))throw new Error('快速模型仍在当前产品中');
 }
}
const expectedAssets=Object.fromEntries(Object.entries(contents).filter(([name])=>name.startsWith('assets/')).map(([name,bytes])=>[name,Buffer.from(bytes)]));
for(const entry of fs.readdirSync(path.join(build,'dex')))if(entry.endsWith('.dex'))contents[entry]=fs.readFileSync(path.join(build,'dex',entry));
contents['resources.arsc']=[contents['resources.arsc'],{level:0}];
fs.writeFileSync(path.join(build,'unsigned.apk'),zipSync(contents,{level:6}));
run(path.join(tools,'zipalign.exe'),['-f','4','android/build/unsigned.apk','android/build/aligned.apk']);
const secretPath=path.join(signing,'local.json'),store=path.join(signing,'release.jks');
if(fs.existsSync(store)&&!fs.existsSync(secretPath))throw new Error('签名密码缺失，请保留原有签名文件。');
const secret=fs.existsSync(secretPath)?JSON.parse(fs.readFileSync(secretPath,'utf8')):{password:randomBytes(32).toString('hex')};
if(!fs.existsSync(secretPath))fs.writeFileSync(secretPath,JSON.stringify(secret));
const signEnv={...env,QIHANG_STORE_PASS:secret.password};
if(!fs.existsSync(store))run(path.join(java,'keytool.exe'),['-genkeypair','-keystore',store,'-alias','qihang','-keyalg','RSA','-keysize','3072','-validity','10000','-storepass:env','QIHANG_STORE_PASS','-keypass:env','QIHANG_STORE_PASS','-dname','CN=Qihang French, O=Qihang, C=CN'],{env:signEnv});
const apk=path.join(output,`${appName}-v${version}.apk`);
run(path.join(java,'java.exe'),['-jar',path.join(tools,'lib/apksigner.jar'),'sign','--ks',store,'--ks-key-alias','qihang','--ks-pass','env:QIHANG_STORE_PASS','--key-pass','env:QIHANG_STORE_PASS','--v4-signing-enabled','false','--out',apk,'android/build/aligned.apk'],{env:signEnv});
run(path.join(java,'java.exe'),['-jar',path.join(tools,'lib/apksigner.jar'),'verify','--verbose',apk]);
run(path.join(tools,'zipalign.exe'),['-c','4',apk]);
const packed=unzipSync(fs.readFileSync(apk)),assets=Object.keys(packed).filter(name=>name.startsWith('assets/')&&!name.endsWith('/'));
for(const name of assets)if(!expectedAssets[name]?.equals(Buffer.from(packed[name])))throw new Error('APK 资源不匹配：'+name);
const expectedSpeech=repairAssets&&!(refreshRepairWeb&&repairRevision>=7)?repairAssets['lib/arm64-v8a/libqihang_speech.so']:fs.readFileSync(path.join(root,'android/jniLibs/arm64-v8a/libqihang_speech.so'));
if(!Buffer.from(expectedSpeech).equals(Buffer.from(packed['lib/arm64-v8a/libqihang_speech.so'])))throw new Error('原生识别库与预期文件不一致');
for(const name of androidVariants)if(!fs.readFileSync(path.join(root,'android/jniLibs/arm64-v8a',name)).equals(Buffer.from(packed['lib/arm64-v8a/'+name]||[])))throw new Error('安卓CPU加速库未正确打包：'+name);
if(!repairAssets)for(const name of dictionaryAudioFiles){const bytes=packed['assets/static/lexicon/audio/'+name];if(!bytes||createHash('sha256').update(bytes).digest('hex')+'.mp3'!==name)throw Error('内置词库录音缺失或损坏：'+name);}
const contentFile=packed['assets/static/content/inspire1.zip'];if(!contentFile)throw new Error('APK 缺少正式词库');
if(repairAssets&&!Buffer.from(repairAssets['assets/static/content/inspire1.zip']).equals(Buffer.from(contentFile)))throw new Error('原词库发生变化');
const content=unzipSync(contentFile),bundle=JSON.parse(new TextDecoder().decode(content['manifest.json']));
for(const id of bundle.audio)if(!content[`audio/${id}.bin`]||createHash('sha256').update(content[`audio/${id}.bin`]).digest('hex')!==id)throw new Error('内置录音校验失败');
const sha256=createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(path.join(output,'SHA256.txt'),`${sha256}  ${path.basename(apk)}\n`);
fs.writeFileSync(path.join(output,'构建校验.json'),JSON.stringify({version,name:appName,package:packageId,...(repairAssets?{repairOf:'2.1.0',assetsMatchOriginal:!refreshRepairWeb,webRefreshed:refreshRepairWeb,vocabularyPreserved:true}:{assetsMatchSource:true}),minAndroid:8,signed:true,aligned:true,assetCount:assets.length,bundledContent:bundle.stats,sha256,deviceInstallTested:false},null,2));
console.log(`APK 已生成：${apk}`);
