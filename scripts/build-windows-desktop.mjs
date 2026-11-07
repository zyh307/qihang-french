import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tools=path.join(root,'.native-tools/webview2'),out=path.join(root,'native/build/desktop'),sdk=path.join(tools,'sdk');
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,meta=JSON.parse(await fs.readFile(path.join(root,'native/windows-desktop/webview-runtime.json'),'utf8'));
const hash=async name=>createHash('sha256').update(await fs.readFile(name)).digest('hex');
if(await hash(path.join(tools,'sdk.nupkg'))!==meta.sdk.sha256||await hash(path.join(tools,'runtime.cab'))!==meta.runtime.sha256)throw Error('WebView2 构建组件校验失败');
await fs.mkdir(path.join(out,'桌面运行'),{recursive:true});
for(const name of['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll'])await fs.copyFile(path.join(sdk,'lib/net462',name),path.join(out,name));
await fs.copyFile(path.join(sdk,'runtimes/win-x64/native/WebView2Loader.dll'),path.join(out,'WebView2Loader.dll'));
await fs.copyFile(path.join(tools,'runtime.cab'),path.join(out,'桌面运行/WebView2Runtime.cab'));await fs.copyFile(path.join(root,'native/windows-desktop/webview-runtime.json'),path.join(out,'桌面运行/webview-runtime.json'));await fs.copyFile(path.join(sdk,'LICENSE.txt'),path.join(out,'桌面运行/WebView2-LICENSE.txt'));
const source=path.join(root,'native/build/DesktopApp.generated.cs');await fs.writeFile(source,(await fs.readFile(path.join(root,'native/windows-desktop/DesktopApp.cs'),'utf8')).replaceAll('__VERSION__',version));
const compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',refs=['System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Net.Http.dll','System.Web.Extensions.dll',path.join(out,'Microsoft.Web.WebView2.Core.dll'),path.join(out,'Microsoft.Web.WebView2.WinForms.dll')];
const args=['/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/langversion:5','/win32manifest:'+path.join(root,'native/windows-desktop/desktop.manifest'),'/win32icon:'+path.join(root,'native/windows-desktop/app.ico'),...refs.map(r=>'/reference:'+r),'/out:'+path.join(out,'启航法语.exe'),source];
const run=values=>{const r=spawnSync(compiler,values,{cwd:root,windowsHide:true,stdio:'inherit'});if(r.error||r.status)throw r.error||Error('Windows EXE 编译失败');};run(args);
if(process.argv.includes('--checks')){const check=path.join(root,'.lexicon-work/desktop-check.exe');run([...args.slice(0,-1).filter(a=>!a.startsWith('/out:')),'/define:DESKTOP_CHECKS','/out:'+check,source]);}
const names=['启航法语.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','桌面运行/WebView2Runtime.cab','桌面运行/webview-runtime.json','桌面运行/WebView2-LICENSE.txt'];
await fs.writeFile(path.join(out,'desktop-files.json'),JSON.stringify({version,files:await Promise.all(names.map(async name=>({name,sha256:await hash(path.join(out,name))})))},null,2));console.log('Windows 独立窗口 EXE 已生成：'+path.join(out,'启航法语.exe'));
