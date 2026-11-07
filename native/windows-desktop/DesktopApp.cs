using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
[assembly:AssemblyTitle("启航法语")]
[assembly:AssemblyProduct("启航法语")]
[assembly:AssemblyCompany("启航 AI 俱乐部")]
[assembly:AssemblyVersion("__VERSION__.0")]
[assembly:AssemblyFileVersion("__VERSION__.0")]
namespace QihangFrench {
 internal static class Program {
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string cls,string title);
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr window,int command);
  internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  internal static readonly string Home=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
  internal static string DataRoot(){
#if DESKTOP_CHECKS
   string isolated=Environment.GetEnvironmentVariable("QIHANG_DESKTOP_CHECK_ROOT");if(!String.IsNullOrEmpty(isolated))return Path.GetFullPath(isolated);
#endif
   string config=Path.Combine(Home,".qihang-data.json");if(File.Exists(config)){var data=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(config,Encoding.UTF8));object value;if(!data.TryGetValue("directory",out value)||String.IsNullOrWhiteSpace(value as string))throw new IOException("本机记录位置无效，请保留原记录后重试。");return Path.GetFullPath(Path.IsPathRooted((string)value)?(string)value:Path.Combine(Home,(string)value));}
   return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QihangFrench");
  }
  internal static string HashFile(string file){using(var stream=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
  internal static string Quote(string value){return "\""+value.TrimEnd('\\').Replace("\"","\\\"")+"\"";}
  [STAThread]static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try{string data=DataRoot();Directory.CreateDirectory(data);string key;using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(data.ToLowerInvariant()))).Replace("-","").Substring(0,24);bool first;using(var mutex=new Mutex(true,"Local\\QihangFrench-"+key,out first)){if(!first){IntPtr h=FindWindow(null,"启航法语");if(h!=IntPtr.Zero){ShowWindow(h,9);SetForegroundWindow(h);}return;}Application.Run(new AppWindow(data));}}catch(Exception e){MessageBox.Show(e.Message,"启航法语",MessageBoxButtons.OK,MessageBoxIcon.Information);}}
 }
 internal sealed class AppWindow:Form {
  const string Version="__VERSION__";
  static readonly int Port=LocalPort();static readonly string Origin="http://127.0.0.1:"+Port+"/";
  static int LocalPort(){
#if DESKTOP_CHECKS
   string value=Environment.GetEnvironmentVariable("QIHANG_DESKTOP_CHECK_HOST_PORT");if(!String.IsNullOrEmpty(value)){int port=Int32.Parse(value);if(port<1024||port>65535)throw new IOException();return port;}
#endif
   return 5188;
  }
  readonly string dataRoot;readonly WebView2 web=new WebView2();readonly Label status=new Label();
  readonly HttpClient http=new HttpClient(new HttpClientHandler{UseProxy=false});
  Process host;bool ownsHost,ready,closing,allowClose;TaskCompletionSource<bool> closeReady;
  public AppWindow(string data){dataRoot=data;Text="启航法语";Width=1180;Height=850;MinimumSize=new Size(430,640);StartPosition=FormStartPosition.CenterScreen;Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);BackColor=Color.FromArgb(244,247,252);web.Dock=DockStyle.Fill;Controls.Add(web);status.Dock=DockStyle.Fill;status.Text="正在打开启航法语…\r\nOuverture de l’application…";status.TextAlign=ContentAlignment.MiddleCenter;status.Font=new Font("Microsoft YaHei UI",12);Controls.Add(status);
   var menu=new MenuStrip();var records=new ToolStripMenuItem("记录");records.DropDownItems.Add("导出备份",null,async(s,e)=>{if(ready)await web.ExecuteScriptAsync("window.dispatchEvent(new Event('qihang-backup'))");});records.DropDownItems.Add("打开记录位置",null,(s,e)=>Process.Start(new ProcessStartInfo(dataRoot){UseShellExecute=true}));menu.Items.Add(records);MainMenuStrip=menu;Controls.Add(menu);menu.Dock=DockStyle.Top;
#if DESKTOP_CHECKS
   if(!String.IsNullOrEmpty(Environment.GetEnvironmentVariable("QIHANG_DESKTOP_CHECK_ROOT"))){ShowInTaskbar=false;WindowState=FormWindowState.Minimized;}
#endif
   Shown+=async(s,e)=>await Open();FormClosing+=OnClosing;
  }
  async Task<Dictionary<string,object>> Health(){try{using(var limit=new CancellationTokenSource(1500)){var response=await http.GetAsync(Origin+"__qihang_health",limit.Token);if(!response.IsSuccessStatusCode)return null;return Program.Json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());}}catch{return null;}}
  bool Compatible(Dictionary<string,object> h){return h!=null&&h.ContainsKey("version")&&(string)h["version"]==Version&&h.ContainsKey("oralProtocol")&&(string)h["oralProtocol"]=="20261106-browser-records";}
  async Task Open(){try{
   var health=await Health();if(health!=null&&!Compatible(health))throw new IOException("旧版仍在运行，请关闭旧版后稍候重试。");
   if(health==null){string runtime=Path.Combine(Program.Home,"口语运行");string args="-Xmx512m -Dqihang.headless=true -Dqihang.port="+Port+" -Dqihang.data="+Program.Quote(dataRoot)+" -Djava.library.path="+Program.Quote(Path.Combine(runtime,"bin"))+" -cp "+Program.Quote(Path.Combine(runtime,"qihang-oral.jar")+";"+Path.Combine(runtime,"json.jar"))+" cn.qihang.oral.WindowsApp "+Program.Quote(Program.Home);var start=new ProcessStartInfo(Path.Combine(runtime,"runtime/bin/javaw.exe"),args){WorkingDirectory=Program.Home,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};start.EnvironmentVariables["PATH"]=Path.Combine(runtime,"bin")+";"+Environment.GetEnvironmentVariable("PATH");
#if DESKTOP_CHECKS
 start.EnvironmentVariables["JAVA_TOOL_OPTIONS"]="-Dqihang.isolatedCheck=true";
#endif
 host=Process.Start(start);ownsHost=true;for(int i=0;i<120;i++){if(host.HasExited)throw new IOException("程序未能启动，请完整解压后重试。");health=await Health();if(Compatible(health))break;await Task.Delay(250);}if(!Compatible(health))throw new IOException("启动等待超时，请关闭旧版后重试。");}
   string engine=null;bool fixedNeeded=false;try{string available=CoreWebView2Environment.GetAvailableBrowserVersionString();fixedNeeded=Int32.Parse(available.Split('.')[0])<120;}catch(WebView2RuntimeNotFoundException){fixedNeeded=true;}
#if DESKTOP_CHECKS
   if(Environment.GetEnvironmentVariable("QIHANG_DESKTOP_CHECK_FIXED")=="1")fixedNeeded=true;
#endif
   if(fixedNeeded){status.Text="正在准备应用…\r\nPréparation de l’application…";engine=await Task.Run(()=>PrepareRuntime());}
   Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER",Path.Combine(dataRoot,"BrowserRecords"));Environment.SetEnvironmentVariable("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER",engine);Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",null);var options=new CoreWebView2EnvironmentOptions();
#if DESKTOP_CHECKS
   string debug=Environment.GetEnvironmentVariable("QIHANG_DESKTOP_CHECK_PORT");if(!String.IsNullOrEmpty(debug))options.AdditionalBrowserArguments="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+Int32.Parse(debug);
#endif
   var environment=await CoreWebView2Environment.CreateAsync(engine,Path.Combine(dataRoot,"BrowserRecords"),options);await web.EnsureCoreWebView2Async(environment);var settings=web.CoreWebView2.Settings;settings.AreDevToolsEnabled=false;settings.AreDefaultContextMenusEnabled=false;settings.IsStatusBarEnabled=false;settings.AreBrowserAcceleratorKeysEnabled=true;
   web.CoreWebView2.NavigationStarting+=(s,e)=>{Uri uri;if(e.Uri.StartsWith("blob:"+Origin,StringComparison.Ordinal))return;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||!e.Uri.StartsWith(Origin,StringComparison.Ordinal)){e.Cancel=true;if(uri!=null&&uri.Scheme=="https")External(uri.AbsoluteUri);}};
   web.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;Uri uri;if(Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)&&uri.Scheme=="https")External(uri.AbsoluteUri);};
   web.CoreWebView2.PermissionRequested+=(s,e)=>{if(e.Uri.StartsWith(Origin,StringComparison.Ordinal)&&e.PermissionKind==CoreWebView2PermissionKind.Microphone)e.State=CoreWebView2PermissionState.Allow;};
   web.CoreWebView2.DownloadStarting+=(s,e)=>{using(var deferral=e.GetDeferral())using(var dialog=new SaveFileDialog()){dialog.FileName=Path.GetFileName(e.ResultFilePath);dialog.Filter="所有文件|*.*";if(dialog.ShowDialog(this)==DialogResult.OK){e.ResultFilePath=dialog.FileName;e.Handled=true;}else e.Cancel=true;}};
   web.CoreWebView2.WebMessageReceived+=(s,e)=>{if(!e.Source.StartsWith(Origin,StringComparison.Ordinal))return;try{var value=Program.Json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);
#if DESKTOP_CHECKS
    if(value.ContainsKey("type")&&(string)value["type"]=="qihang-check-close"){BeginInvoke(new Action(Close));return;}
#endif
    if(closeReady!=null&&value.ContainsKey("type")&&(string)value["type"]=="qihang-close-ready")closeReady.TrySetResult(!value.ContainsKey("error"));}catch{}};
   web.CoreWebView2.NavigationCompleted+=(s,e)=>{if(e.IsSuccess){ready=true;status.Visible=false;web.Focus();
#if DESKTOP_CHECKS
    File.WriteAllText(Path.Combine(dataRoot,"desktop-check.json"),Program.Json.Serialize(new{version=Version,profile=Path.Combine(dataRoot,"BrowserRecords"),hostPid=host==null?0:host.Id}));
#endif
   }else status.Text="页面未能打开，请重新启动。\r\nRelancez l’application.";};web.CoreWebView2.Navigate(Origin);
  }catch(Exception e){status.Text=e.Message;StopHost();}}
  string PrepareRuntime(){var metadata=Program.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(Program.Home,"桌面运行/webview-runtime.json")));var runtime=(Dictionary<string,object>)metadata["runtime"];string version=(string)runtime["version"],expected=(string)runtime["sha256"],cache=Path.Combine(dataRoot,"ApplicationRuntime","WebView2-"+version),marker=Path.Combine(cache,"ready.txt");if(File.Exists(marker)&&File.ReadAllText(marker)==expected){var installed=Directory.GetFiles(cache,"msedgewebview2.exe",SearchOption.AllDirectories);if(installed.Length==1)return Path.GetDirectoryName(installed[0]);}
   string cab=Path.Combine(Program.Home,"桌面运行/WebView2Runtime.cab");if(Program.HashFile(cab)!=expected)throw new IOException("程序文件不完整，请重新完整解压。");string temporary=Path.Combine(Path.GetTempPath(),"QihangWebView-"+Guid.NewGuid().ToString("N").Substring(0,8));Directory.CreateDirectory(temporary);var start=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"expand.exe"),"-F:* "+Program.Quote(cab)+" "+Program.Quote(temporary)){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true,RedirectStandardError=true};using(var process=Process.Start(start)){string output=process.StandardOutput.ReadToEnd();process.StandardError.ReadToEnd();process.WaitForExit();if(process.ExitCode!=0)throw new IOException("应用准备失败，请检查剩余空间后重试。");}var exe=Directory.GetFiles(temporary,"msedgewebview2.exe",SearchOption.AllDirectories);if(exe.Length!=1)throw new IOException("应用组件不完整，请重新解压。");string folder=Path.GetDirectoryName(exe[0]);using(var acl=Process.Start(new ProcessStartInfo("icacls.exe",Program.Quote(folder)+" /grant *S-1-15-2-1:(OI)(CI)(RX) *S-1-15-2-2:(OI)(CI)(RX) /T /Q"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true})){acl.StandardOutput.ReadToEnd();acl.WaitForExit();if(acl.ExitCode!=0)throw new IOException("应用组件无法读取，请检查当前用户权限。");}Directory.CreateDirectory(Path.GetDirectoryName(cache));if(Directory.Exists(cache))Directory.Move(cache,cache+".old-"+Guid.NewGuid().ToString("N").Substring(0,8));if(Path.GetPathRoot(folder)==Path.GetPathRoot(cache))Directory.Move(folder,cache);else{Directory.CreateDirectory(cache);foreach(string file in Directory.GetFiles(folder,"*",SearchOption.AllDirectories)){string target=Path.Combine(cache,file.Substring(folder.Length+1));Directory.CreateDirectory(Path.GetDirectoryName(target));File.Copy(file,target);}}File.WriteAllText(Path.Combine(cache,"ready.txt"),expected);if(temporary.StartsWith(Path.GetTempPath(),StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(temporary).StartsWith("QihangWebView-"))Directory.Delete(temporary,true);return Path.GetDirectoryName(Directory.GetFiles(cache,"msedgewebview2.exe",SearchOption.AllDirectories)[0]);
  }
  static void External(string url){try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch{}}
  async void OnClosing(object sender,FormClosingEventArgs e){if(allowClose)return;e.Cancel=true;if(closing)return;closing=true;try{if(ready){closeReady=new TaskCompletionSource<bool>();await web.ExecuteScriptAsync("window.dispatchEvent(new Event('qihang-host-close'))");var finished=await Task.WhenAny(closeReady.Task,Task.Delay(25000));if(finished!=closeReady.Task||!closeReady.Task.Result){MessageBox.Show("记录尚在保存，请稍后再退出。","启航法语");closing=false;return;}}web.Dispose();StopHost();allowClose=true;Close();}catch{closing=false;MessageBox.Show("记录尚未保存，请稍后再退出。","启航法语");}}
  void StopHost(){if(ownsHost&&host!=null){try{if(!host.HasExited)host.Kill();}catch{}host.Dispose();host=null;}http.CancelPendingRequests();}
 }
}
