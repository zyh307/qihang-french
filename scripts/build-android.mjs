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
const output=path.join(root,'安卓安装包'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
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
if(!process.argv.includes('--skip-web'))run(process.execPath,['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js','build']);
fs.copyFileSync(path.join(sdk,'platform/android-35/android.jar'),path.join(build,'android.jar'));
run(path.join(tools,'aapt2.exe'),['compile','--dir','android/res','-o','android/build/resources.zip']);
run(path.join(tools,'aapt2.exe'),['link','-I','android/build/android.jar','--manifest','android/AndroidManifest.xml','-o','android/build/resources.apk','android/build/resources.zip']);
const sources=[];function collect(dir,extension,result){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())collect(name,extension,result);else if(name.endsWith(extension))result.push(path.relative(root,name));}}
collect(path.join(root,'android/src'),'.java',sources);
run(path.join(java,'javac.exe'),['-source','8','-target','8','-Xlint:-options','-encoding','UTF-8','-bootclasspath','android/build/android.jar'+path.delimiter+path.join(tools,'core-lambda-stubs.jar'),'-d','android/build/classes',...sources]);
const classes=[];collect(path.join(build,'classes'),'.class',classes);
run(path.join(java,'java.exe'),['-cp',path.join(tools,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib','android/build/android.jar','--output','android/build/dex',...classes]);
const contents=unzipSync(fs.readFileSync(path.join(build,'resources.apk')));
// Write web assets with UTF-8 ZIP names: Windows aapt2 cannot open Chinese filenames.
const web=path.join(root,'dist/build/h5');
function addAssets(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('网页资源不能包含外部链接');if(entry.isDirectory())addAssets(file);else contents['assets/'+path.relative(web,file).replaceAll('\\','/')]=fs.readFileSync(file);}}
addAssets(web);
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
const apk=path.join(output,`启航法语-v${version}.apk`);
run(path.join(java,'java.exe'),['-jar',path.join(tools,'lib/apksigner.jar'),'sign','--ks',store,'--ks-key-alias','qihang','--ks-pass','env:QIHANG_STORE_PASS','--key-pass','env:QIHANG_STORE_PASS','--v4-signing-enabled','false','--out',apk,'android/build/aligned.apk'],{env:signEnv});
run(path.join(java,'java.exe'),['-jar',path.join(tools,'lib/apksigner.jar'),'verify','--verbose',apk]);
run(path.join(tools,'zipalign.exe'),['-c','4',apk]);
const packed=unzipSync(fs.readFileSync(apk)),assets=Object.keys(packed).filter(name=>name.startsWith('assets/')&&!name.endsWith('/'));
for(const name of assets){const source=path.join(root,'dist/build/h5',name.slice(7));if(!fs.readFileSync(source).equals(Buffer.from(packed[name])))throw new Error('APK 资源不匹配：'+name);}
const contentFile=packed['assets/static/content/inspire1.zip'];if(!contentFile)throw new Error('APK 缺少正式词库');
const content=unzipSync(contentFile),bundle=JSON.parse(new TextDecoder().decode(content['manifest.json']));
for(const id of bundle.audio)if(!content[`audio/${id}.bin`]||createHash('sha256').update(content[`audio/${id}.bin`]).digest('hex')!==id)throw new Error('内置录音校验失败');
const sha256=createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(path.join(output,'SHA256.txt'),`${sha256}  ${path.basename(apk)}\n`);
fs.writeFileSync(path.join(output,'构建校验.json'),JSON.stringify({version,package:'cn.qihang.francais',minAndroid:8,signed:true,aligned:true,assetCount:assets.length,assetsMatchSource:true,bundledContent:bundle.stats,sha256,deviceInstallTested:false},null,2));
console.log(`APK 已生成：${apk}`);
