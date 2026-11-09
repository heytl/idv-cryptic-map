"""Deterministic ZIP packaging, using only Python's standard library."""
import hashlib
import json
from pathlib import Path
import stat
import zipfile

root = Path(__file__).resolve().parents[2]
source = root / 'dist' / 'minitool'
target = root / 'dist' / 'idv-cryptic-map-minitool.zip'
temporary = root / '.tmp' / 'minitool' / 'package.zip.tmp'
audit = json.loads((root / '.tmp/minitool/audit.json').read_text(encoding='utf-8'))
assert audit['result'] == 'pass'
assert audit['appSha256'] == hashlib.sha256((source / 'app.js').read_bytes()).hexdigest(), 'Audit is stale'
allowed = {'.html','.css','.js','.png','.jpg','.jpeg','.gif','.webp','.svg','.woff','.woff2','.json'}
inventory = []
for file in sorted(source.rglob('*')):
    attributes = file.lstat()
    assert not stat.S_ISLNK(attributes.st_mode) and not (getattr(attributes, 'st_file_attributes', 0) & 0x400), 'Link in artifact'
    if not file.is_file():
        continue
    name = file.relative_to(source).as_posix()
    assert all(not part.startswith('.') and part != 'node_modules' for part in Path(name).parts)
    assert file.suffix.lower() in allowed, 'Unsupported artifact file: ' + name
    data = file.read_bytes()
    inventory.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert [f['path'] for f in inventory if f['path'].endswith('.html')] == ['index.html']
expanded = sum(f['bytes'] for f in inventory)
assert expanded <= 30 * 1024 * 1024, 'Expanded package exceeds CLI limit'
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for item in inventory:
        info = zipfile.ZipInfo(item['path'],(2026,1,1,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (stat.S_IFREG | 0o644) << 16
        archive.writestr(info,(source / item['path']).read_bytes(),compresslevel=9)
assert temporary.stat().st_size <= 10 * 1024 * 1024, 'ZIP exceeds 10 MiB upload limit'
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None, 'ZIP CRC failure'
    assert len(archive.namelist()) == len(set(archive.namelist()))
temporary.replace(target)
report = {'result':'pass','path':target.relative_to(root).as_posix(),'files':len(inventory),
          'zipBytes':target.stat().st_size,'expandedBytes':expanded,
          'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'inventory':inventory}
(root / '.tmp/minitool/package.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'inventory'}))
