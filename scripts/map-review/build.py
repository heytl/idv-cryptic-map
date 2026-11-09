"""Build a local, offline review bundle for the three-basement route sheets.

Requires Pillow and numpy. No network or production writes are performed.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


def runs(values, gap=0):
    indexes = np.flatnonzero(values)
    groups = np.split(indexes, np.where(np.diff(indexes) > gap + 1)[0] + 1)
    return [(int(g[0]), int(g[-1] + 1)) for g in groups if len(g)]


def rect(x, top, width, bottom):
    return dict(x=int(x), y=int(top), width=int(width), height=int(bottom - top))


def detect(image):
    """Find each sheet's frame, headings and independent map-content envelopes.

    Search windows express this collection's three-floor sheet format, rather
    than fixed crop coordinates. Ambiguous inputs fail instead of using defaults.
    """
    width, height = image.size
    a = np.asarray(image.convert('RGB')).astype(np.int16)
    r, g, b = a.transpose(2, 0, 1)
    white = (r > 220) & (g > 220) & (b > 220) & (abs(r - g) < 20)
    edges = runs(white[:int(height * .18), int(width * .35):].sum(1) > width * .25)
    if len(edges) != 2:
        raise ValueError('Expected two horizontal entrance-frame edges')
    xs = np.flatnonzero(white[edges[0][0]:edges[0][1]].sum(0))
    entrance = rect(xs.min(), edges[0][0], xs.max() + 1 - xs.min(), edges[1][1])

    yellow = (r > 160) & (g > 140) & (b < 150) & (r - b > 55) & (g - b > 35)
    titles = []
    for start, end in [(.155, .245), (.385, .465), (.64, .72)]:
        lo, hi = int(height * start), int(height * end)
        bands = runs(yellow[lo:hi, int(width * .02):int(width * .24)].sum(1) > width * .012, 14)
        bands = [(s + lo, e + lo) for s, e in bands if (e - s) > height * .012]
        if len(bands) != 1:
            raise ValueError(f'Ambiguous floor heading: {bands}')
        titles.append(bands[0])

    low, high = a.min(2), a.max(2)
    neutral = (low > 48) & (high > 77) & (high - low < 65)
    # JPEG antialiasing around yellow headings can otherwise join a map envelope.
    for top, bottom in titles:
        neutral[max(0, top - 6):bottom + 6, :int(width * .24)] = False
    start, end = entrance['y'] + entrance['height'] + 15, int(height * .943)
    bands = runs(neutral[start:end].sum(1) > width * .005, 6)
    bands = [(s + start, e + start) for s, e in bands if (e - s) > height * .17]
    if len(bands) != 3:
        raise ValueError(f'Expected three independent map envelopes: {bands}')
    floors = {}
    for i, ((top, bottom), (title_top, title_bottom)) in enumerate(zip(bands, titles)):
        crop_top = min(top, title_top) - 10
        crop_bottom = max(bottom, title_bottom) + 10
        if i and crop_top < bands[i - 1][1] and top >= bands[i - 1][1]:
            # A heading is optional; map completeness and excluding neighbouring
            # geometry take priority. Keep the heading only if it fits cleanly.
            crop_top = title_top if title_top >= bands[i - 1][1] else top - 10
        # Avoid the next heading when no map geometry actually overlaps it.
        if i < 2 and bottom <= titles[i + 1][0]:
            crop_bottom = max(bottom, min(crop_bottom, titles[i + 1][0] - 1))
        floors[f'b{i + 1}'] = rect(0, crop_top, width, crop_bottom)
    full = rect(0, min(f['y'] for f in floors.values()), width,
                max(f['y'] + f['height'] for f in floors.values()))
    # The detected frame includes a ~5px white stroke and JPEG antialiasing.
    # Keep only its interior; do not shrink the full image or floor rectangles.
    inset = 8
    entrance = rect(entrance['x'] + inset, entrance['y'] + inset,
                    entrance['width'] - 2 * inset,
                    entrance['y'] + entrance['height'] - inset)
    return full, entrance, floors, dict(headings=titles, mapEnvelopes=bands)


def validate(item):
    width, height = item['source']['width'], item['source']['height']
    for key, r in [('full', item['full']), ('entrance', item['entrance']), *item['floors'].items()]:
        if set(r) != {'x', 'y', 'width', 'height'} or not all(type(v) is int for v in r.values()):
            raise ValueError(f'{item["name"]}/{key}: invalid rectangle')
        if min(r['x'], r['y']) < 0 or min(r['width'], r['height']) <= 0:
            raise ValueError(f'{item["name"]}/{key}: nonpositive/outside rectangle')
        if r['x'] + r['width'] > width or r['y'] + r['height'] > height:
            raise ValueError(f'{item["name"]}/{key}: rectangle outside source')
        if key != 'entrance' and (r['x'] != 0 or r['width'] != width):
            raise ValueError('Full image and floors must keep the entire source width')
        if key in item['floors'] and not (item['full']['y'] <= r['y'] and
                r['y'] + r['height'] <= item['full']['y'] + item['full']['height']):
            raise ValueError(f'{item["name"]}/{key}: floor outside full image')
    if list(item['floors']) != ['b1', 'b2', 'b3']:
        raise ValueError('Expected b1, b2 and b3')


def derived(item):
    validate(item)
    return {key: {**r, 'y': r['y'] - item['full']['y']} for key, r in item['floors'].items()}


def write_asset(image, region, role, output):
    box = (region['x'], region['y'], region['x'] + region['width'], region['y'] + region['height'])
    # Lossless crops preserve the decoded source pixels and original resolution.
    buffer = io.BytesIO()
    image.crop(box).save(buffer, 'WEBP', lossless=True, method=4)
    data = buffer.getvalue()
    sha = digest(data)
    key = f'maps/{role}/{sha}.webp'
    target = output / 'assets' / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return dict(key=key, sha256=sha, size=len(data), width=region['width'], height=region['height'])


def build(args):
    source, output = args.source.resolve(), args.output.resolve()
    if source == output or source in output.parents:
        raise ValueError('Output must be outside the input resource directory')
    paths = sorted((p for p in source.rglob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}),
                   key=lambda p: (int(re.search(r'\d+', p.stem)[0]) if re.search(r'\d+', p.stem) else 0, p.as_posix()))
    if not paths:
        raise ValueError('No source images')
    approved = None
    if args.coordinates:
        approved = json.loads(args.coordinates.read_text(encoding='utf-8-sig'))
        if approved.get('format') != 'idv-map-region-review' or approved.get('formatVersion') != 1:
            raise ValueError('Unsupported review document')
        approved = {i['source']['relativePath']: i for i in approved['layouts']}
        if set(approved) != {p.relative_to(source).as_posix() for p in paths}:
            raise ValueError('Reviewed source file list does not match input')
    records, data_urls = [], {}
    for index, path in enumerate(paths):
        data = path.read_bytes()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        rel = path.relative_to(source).as_posix()
        item = dict(id=f'layout-{index + 1}', name=path.stem, category=path.parent.relative_to(source).as_posix(),
                    source=dict(relativePath=rel, sha256=digest(data), width=im.width, height=im.height),
                    review=dict(status='pending', note=''))
        if approved:
            prior = approved[rel]
            if prior['source']['sha256'] != digest(data) or (prior['source']['width'], prior['source']['height']) != im.size:
                raise ValueError(f'Source content changed: {rel}')
            for key in ('full', 'entrance', 'floors', 'review', 'detection', 'entranceBorderTrim'):
                if key in prior:
                    item[key] = prior[key]
        else:
            item['full'], item['entrance'], item['floors'], item['detection'] = detect(im)
        validate(item)
        item['floorRegions'] = dict(imageWidth=item['full']['width'], imageHeight=item['full']['height'], regions=derived(item))
        records.append(item)
        mime = Image.MIME[Image.open(io.BytesIO(data)).format]
        data_urls[item['id']] = f'data:{mime};base64,{base64.b64encode(data).decode()}'
    if len({i['name'] for i in records}) != len(records):
        raise ValueError('Duplicate layout names need explicit resolution')
    # Validate all source/coordinate pairs before writing any deliverables.
    output.mkdir(parents=True, exist_ok=True)
    sync_items = []
    for item, path in zip(records, paths):
        im = Image.open(path).convert('RGB')
        full = write_asset(im, item['full'], 'layout/full', output)
        entrance = write_asset(im, item['entrance'], 'entrance', output)
        item['preparedAssets'] = dict(full=full, entrance=entrance)
        sync_items.append(dict(name=item['name'], entranceCategory=item['category'],
                               review=item['review'], sourceSha256=item['source']['sha256'],
                               floorImages=dict(full=dict(key=full['key'])),
                               floorRegions=dict(sourceKey=full['key'], **item['floorRegions']),
                               entranceImage=dict(key=entrance['key'])))
    manifest = dict(format='idv-map-region-review', formatVersion=1, gameMapName='磷光症', difficultyName='噩梦',
                    generatedAt=datetime.now(timezone.utc).isoformat(), assetsRequireRebuild=False,
                    coordinateConvention='Original decoded source pixels; top/left inclusive, bottom/right exclusive. '
                        'floorRegions are relative to the cropped full image. Floors may overlap.', layouts=records)
    manifest['bundleId'] = digest(json.dumps(records, ensure_ascii=False, sort_keys=True).encode())[:16]
    (output / 'coordinates.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    plan = dict(format='idv-map-sync-candidate', requiresHumanReview=True, executable=False,
                note='Map/difficulty/entrance/filter/floor identities must be matched against the target saved config. '
                     'This is a coordinate/resource candidate, not a whole-config import. Rebuild after editing coordinates.',
                bundleId=manifest['bundleId'], layouts=sync_items)
    (output / 'sync-candidate.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with (output / 'coordinates.csv').open('w', newline='', encoding='utf-8-sig') as file:
        writer = csv.writer(file)
        writer.writerow(['布局', '入口分类', '区域', '原图X', '原图Y起', '原图Y止(不含)', '宽', '高', '全图相对Y', '审核状态'])
        for i in records:
            for name, r in [('full', i['full']), ('entrance', i['entrance']), *i['floors'].items()]:
                writer.writerow([i['name'], i['category'], name, r['x'], r['y'], r['y'] + r['height'],
                                 r['width'], r['height'], r['y'] - i['full']['y'] if name in i['floors'] else '', i['review']['status']])
    template = Path(__file__).with_name('review.html').read_text(encoding='utf-8')
    payload = json.dumps(dict(manifest=manifest, sources=data_urls), ensure_ascii=False).replace('<', '\\u003c')
    (output / 'index.html').write_text(template.replace('__REVIEW_DATA__', payload), encoding='utf-8')
    print(json.dumps(dict(layouts=len(records), categories=len({i['category'] for i in records}),
                          floors=sum(len(i['floors']) for i in records), assets=sum(a['size'] for i in records for a in i['preparedAssets'].values()),
                          htmlBytes=(output / 'index.html').stat().st_size, bundleId=manifest['bundleId']), ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--coordinates', type=Path, help='Rebuild from the JSON exported by the review page')
    build(parser.parse_args())
