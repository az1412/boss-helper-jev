"""Wrap a verified Chrome ZIP with an offline, beginner-friendly install guide."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import hashlib
import json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('chrome_zip', type=Path)
parser.add_argument('output_zip', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
guide = (root / 'docs/chrome-install.html').read_bytes()
text = '''Jev 求职助手 · Chrome 安装版

1. 先把整个 ZIP 解压到固定文件夹。
2. 双击「先打开我-安装指南.html」，按中文说明安装。
3. Chrome 地址栏输入 chrome://extensions，开启开发者模式。
4. 点击「加载已解压的扩展程序」，选择包含 manifest.json 的文件夹。
5. 刷新 BOSS 岗位页面，保存配置后再开始。

已编译，无需安装 Bun 或 Node.js。需要本人登录 BOSS 并填写配置。
使用 Jev 时需要 TypeSafe Key；基础筛选 + 默认招呼不需要 AI Key。
这是 Chrome 扩展，首次需要手动加载一次。不要删除已加载的文件夹。
'''.encode('utf-8')

assert args.chrome_zip.resolve() != args.output_zip.resolve()
with ZipFile(args.chrome_zip) as source:
    assert source.testzip() is None, 'Input archive is corrupt'
    names = source.namelist()
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    manifest = json.loads(source.read('manifest.json'))
    assert manifest['manifest_version'] == 3
    assert 'pdf.worker.min.mjs' in names
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in name
    args.output_zip.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output_zip, 'w', ZIP_DEFLATED) as target:
        for name in names:
            target.writestr(name, source.read(name))
        target.writestr('先打开我-安装指南.html', guide)
        target.writestr('安装步骤.txt', text)
    with ZipFile(args.output_zip) as result:
        assert result.testzip() is None
        for name in names:
            assert source.read(name) == result.read(name), name
print(json.dumps({'name': args.output_zip.name, 'version': manifest['version'],
                  'extensionFilesUnchanged': len(names), 'guideFilesAdded': 2,
                  'sha256': hashlib.sha256(args.output_zip.read_bytes()).hexdigest()}, ensure_ascii=False))
