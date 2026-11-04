"""Audit and assemble the public files; model weights stay outside app packages."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
NAME = json.loads((ROOT / 'src/manifest.json').read_text(encoding='utf-8'))['name']
OUT = ROOT / '正式版'
MANIFEST = json.loads((ROOT / 'native/model-manifest.json').read_text(encoding='utf-8'))


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def audit(file, prefix, windows=False):
    denied = re.compile(r'(^|/)(?:signing|recordings|sessions|profiles|\.lexicon-work|\.native-tools|node_modules)(/|$)|\.(?:jks|keystore|p12|pem|key|pyc|log)$|(?:identity\.sealed|recording-active\.json|\.qihang-data\.json|local\.json)$', re.I)
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None, 'Archive CRC failure'
        names = archive.namelist()
        assert not any(denied.search(name) for name in names), 'Private file in package'
        assert not any(re.search(r'(^|/)ggml-model[^/]*\.bin(?:\..*)?$', name) for name in names), 'Model weights in app package'
        assert archive.read(prefix + 'index.html') == (ROOT / 'dist/build/h5/index.html').read_bytes()
        for asset in (ROOT / 'dist/build/h5/assets').iterdir():
            if asset.is_file():
                assert archive.read(prefix + 'assets/' + asset.name) == asset.read_bytes(), asset.name
        for number in (1, 2, 3, 4):
            name = f'static/content/inspire{number}.zip'
            assert archive.read(prefix + name) == (ROOT / 'src' / name).read_bytes(), name
        index = json.loads(archive.read(prefix + 'static/lexicon/audio/index.json'))['entries']
        for name in {clip['file'] for clip in index.values()}:
            assert hashlib.sha256(archive.read(prefix + 'static/lexicon/audio/' + name)).hexdigest() + '.mp3' == name
        if windows:
            runtime = NAME + '/口语运行/'
            assert not any(name.startswith(runtime + 'models/') for name in names)
            assert json.loads(archive.read(runtime + 'runtime-source.json'))['modelIncluded'] is False
            for name in ('runtime/bin/javaw.exe', 'bin/qihang_speech.dll', 'bin/vcomp140.dll', 'licenses/whisper-large-v3-french-model-card.md'):
                assert runtime + name in names, name
            with zipfile.ZipFile(io.BytesIO(archive.read(runtime + 'qihang-oral.jar'))) as jar:
                assert VERSION.encode() in jar.read('cn/qihang/oral/WindowsApp.class')
            assert file.stat().st_size < 2 * 1024**3


def copy(source, target):
    if source.resolve() != target.resolve():
        shutil.copyfile(source, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path)
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    assert not OUT.is_symlink() and OUT.resolve() == ROOT / '正式版'
    model = args.model or Path(os.environ.get('QIHANG_MODEL_FILE') or OUT / MANIFEST['filename'])
    if not model.is_file():
        model = ROOT / '交付/模型' / MANIFEST['filename']
    assert model.is_file() and model.stat().st_size == MANIFEST['size'], 'Pinned model file required'
    assert digest(model) == MANIFEST['sha256'], 'Model SHA-256 mismatch'
    outputs = []
    for source, name, prefix, windows in (
        (ROOT / f'安卓安装包/{NAME}-v{VERSION}.apk', f'{NAME}-Android-v{VERSION}.apk', 'assets/', False),
        (ROOT / f'{NAME}_分享版.zip', f'{NAME}-Windows-v{VERSION}.zip', NAME + '/网页/', True),
    ):
        audit(source, prefix, windows)
        target = OUT / name
        copy(source, target)
        outputs.append(target)
        print(name, target.stat().st_size, digest(target), flush=True)
    target = OUT / MANIFEST['filename']
    copy(model, target)
    assert digest(target) == MANIFEST['sha256']
    outputs.append(target)

    license_file = OUT / f'{NAME}-模型许可.zip'
    with zipfile.ZipFile(license_file, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('OpenAI-Whisper-MIT.txt', 'whisper-large-v3-french-model-card.md'):
            archive.write(ROOT / 'native/licenses' / name, name)
        archive.write(ROOT / 'native/model-manifest.json', 'model-manifest.json')
        archive.writestr('README.txt', f"French recognition model: {MANIFEST['repository']}\nRevision: {MANIFEST['revision']}\nFile: {MANIFEST['filename']}\nSize: {MANIFEST['size']} bytes\nSHA-256: {MANIFEST['sha256']}\nLicense: MIT, see the model card and upstream licensing.\nSource: https://huggingface.co/{MANIFEST['repository']}/tree/{MANIFEST['revision']}\nThe application's GPL license does not replace the model's license.\n")
    outputs.append(license_file)
    guide = OUT / f'{NAME}-使用说明.txt'
    guide.write_text(f'''启航法语 {VERSION}

Windows：下载 Windows ZIP，完整解压，双击“启动启航法语.bat”。
安卓：下载 Android APK，直接覆盖安装；更新前不要卸载。
词汇和语法可直接使用，课内、课外单词及例句录音均已内置。

口语识别模型独立下载，电脑和手机共用 ggml-model-q5_0.bin（约 1.08 GB）。
打开设置 → 口语 → 导入本地模型，选择文件并等待校验。
然后允许麦克风，绑定自己的小智账号与考官。电脑和手机分别绑定。
识别在当前设备运行；考官对话、语音回复和中文点评需要联网。
模型可在口语设置中删除；学习记录、口语历史和绑定保留。
正常软件更新会保留已导入的模型，不必重复下载。

下载页：https://github.com/zyh307/qihang-french/releases/tag/v{VERSION}
模型文件大小：{MANIFEST['size']} 字节
模型 SHA-256：{MANIFEST['sha256']}
模型来源和许可见配套的模型许可压缩包。
SHA256SUMS.txt 对应本地中文文件名；SHA256SUMS-GitHub.txt 对应 GitHub 下载文件名。
完整使用教程在 Windows 包及应用帮助中。
''', encoding='utf-8-sig')
    outputs.append(guide)
    (OUT / 'SHA256SUMS.txt').write_text(''.join(digest(file) + '  ' + file.name + '\n' for file in outputs), encoding='utf-8')
    # GitHub normalizes non-ASCII asset filenames; labels use the Chinese name.
    aliases = {
        f'{NAME}-Android-v{VERSION}.apk': f'QihangFrench-Android-v{VERSION}.apk',
        f'{NAME}-Windows-v{VERSION}.zip': f'QihangFrench-Windows-v{VERSION}.zip',
        f'{NAME}-模型许可.zip': 'QihangFrench-Model-Licenses.zip',
        f'{NAME}-使用说明.txt': 'QuickStart-zh-CN.txt',
    }
    (OUT / 'SHA256SUMS-GitHub.txt').write_text(''.join(digest(file) + '  ' + aliases.get(file.name, file.name) + '\n' for file in outputs), encoding='utf-8')
    print('Release files verified:', OUT, flush=True)


if __name__ == '__main__':
    main()
