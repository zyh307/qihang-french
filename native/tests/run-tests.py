"""Run isolated native protocol checks with a JDK and official JSON-java jar."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

p=argparse.ArgumentParser()
p.add_argument('--jdk',type=Path,required=True,help='JDK root containing bin/java and bin/javac')
p.add_argument('--json-jar',type=Path,required=True)
args=p.parse_args()
root=Path(__file__).resolve().parents[2]
suffix='.exe' if os.name=='nt' else ''
with tempfile.TemporaryDirectory(prefix='qihang_native_tests_') as temporary:
    sources=[root/'native/common/cn/qihang/oral'/name for name in ('J.java','Host.java','Examiner.java','SpeechSettings.java')]
    sources+=list((root/'native/tests/stubs').glob('*.java'))
    sources.append(root/'native/tests/ExaminerProtocolTest.java')
    sources.append(root/'native/tests/SpeechSettingsTest.java')
    subprocess.run([str(args.jdk/'bin'/('javac'+suffix)),'-source','17','-target','17','-Xlint:-options','-encoding','UTF-8','-cp',str(args.json_jar),'-d',temporary,*map(str,sources)],check=True)
    subprocess.run([str(args.jdk/'bin'/('java'+suffix)),'-Djava.io.tmpdir='+temporary,'-cp',temporary+os.pathsep+str(args.json_jar),'cn.qihang.oral.ExaminerProtocolTest'],check=True,timeout=30)
    subprocess.run([str(args.jdk/'bin'/('java'+suffix)),'-cp',temporary,'cn.qihang.oral.SpeechSettingsTest'],check=True,timeout=30)
with tempfile.TemporaryDirectory(prefix='qihang_bundled_tests_') as temporary:
    sources=[root/'native/common/cn/qihang/oral'/name for name in ('J.java','ModelStore.java')]
    sources += [root/'native/tests/stubs/NativeSpeech.java',root/'native/tests/BundledModelTest.java']
    subprocess.run([str(args.jdk/'bin'/('javac'+suffix)),'-source','17','-target','17','-Xlint:-options','-encoding','UTF-8','-cp',str(args.json_jar),'-d',temporary,*map(str,sources)],check=True)
    subprocess.run([str(args.jdk/'bin'/('java'+suffix)),'-Djava.io.tmpdir='+temporary,'-cp',temporary+os.pathsep+str(args.json_jar),'cn.qihang.oral.BundledModelTest'],check=True,timeout=30)
with tempfile.TemporaryDirectory(prefix='qihang_storage_tests_') as temporary:
    sources=[root/'native/common/cn/qihang/oral'/name for name in ('J.java','Host.java','Examiner.java','ModelStore.java','OralCore.java','SpeechSettings.java')]
    sources += [root/'native/tests/stubs'/name for name in ('NativeSpeech.java','SecureSocket.java')]
    sources.append(root/'native/tests/SessionStorageTest.java')
    subprocess.run([str(args.jdk/'bin'/('javac'+suffix)),'-source','17','-target','17','-Xlint:-options','-encoding','UTF-8','-cp',str(args.json_jar),'-d',temporary,*map(str,sources)],check=True)
    subprocess.run([str(args.jdk/'bin'/('java'+suffix)),'-Djava.io.tmpdir='+temporary,'-cp',temporary+os.pathsep+str(args.json_jar),'cn.qihang.oral.SessionStorageTest'],check=True,timeout=30)
with tempfile.TemporaryDirectory(prefix='qihang_android_loader_tests_') as temporary:
    sources=[root/'native/common/cn/qihang/oral/NativeLibraries.java',root/'native/tests/NativeLibrariesTest.java']
    subprocess.run([str(args.jdk/'bin'/('javac'+suffix)),'-source','17','-target','17','-Xlint:-options','-encoding','UTF-8','-d',temporary,*map(str,sources)],check=True)
    subprocess.run([str(args.jdk/'bin'/('java'+suffix)),'-cp',temporary,'cn.qihang.oral.NativeLibrariesTest'],check=True,timeout=30)
