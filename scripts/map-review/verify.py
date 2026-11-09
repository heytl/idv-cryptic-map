"""Verify source identity, lossless crop pixels and coordinate rebasing."""

import argparse
import csv
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

from build import derived, digest, validate


def verify(source, output):
    manifest = json.loads((output / 'coordinates.json').read_text(encoding='utf-8'))
    plan = json.loads((output / 'sync-candidate.json').read_text(encoding='utf-8'))
    assert plan['bundleId'] == manifest['bundleId']
    assert plan['executable'] is False and plan['requiresHumanReview'] is True
    checks, asset_bytes, region_count = [], 0, 0
    for i, candidate in zip(manifest['layouts'], plan['layouts']):
        validate(i)
        assert i['name'] == Path(i['source']['relativePath']).stem
        assert i['category'] == Path(i['source']['relativePath']).parent.as_posix()
        data = (source / i['source']['relativePath']).read_bytes()
        assert digest(data) == i['source']['sha256']
        im = Image.open(io.BytesIO(data)).convert('RGB')
        assert im.size == (i['source']['width'], i['source']['height'])
        for role in ('full', 'entrance'):
            a, r = i['preparedAssets'][role], i[role]
            binary = (output / 'assets' / a['key']).read_bytes()
            assert digest(binary) == a['sha256'] and len(binary) == a['size']
            actual = Image.open(io.BytesIO(binary)).convert('RGB')
            expected = im.crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']))
            assert actual.size == expected.size
            assert np.array_equal(np.asarray(actual), np.asarray(expected)), f'Pixel mismatch: {i["name"]}/{role}'
            asset_bytes += len(binary)
        assert i['floorRegions']['regions'] == derived(i) == candidate['floorRegions']['regions']
        assert candidate['floorRegions']['sourceKey'] == i['preparedAssets']['full']['key']
        assert candidate['floorRegions']['imageHeight'] == i['full']['height']
        for n, (key, r) in enumerate(i['floors'].items()):
            top, bottom = i['detection']['mapEnvelopes'][n]
            assert r['y'] <= top and r['y'] + r['height'] >= bottom, f'Detected map clipped: {i["name"]}/{key}'
            region_count += 1
        checks.append(dict(name=i['name'], sourceHash=True, cropPixels=True, coordinateRebase=True))
    with (output / 'coordinates.csv').open(encoding='utf-8-sig', newline='') as file:
        assert len(list(csv.reader(file))) == len(checks) * 5 + 1
    report = dict(layouts=len(checks), categories=len({i['category'] for i in manifest['layouts']}),
                  floors=region_count, losslessAssets=len(checks) * 2, assetBytes=asset_bytes, checks=checks)
    (output / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'checks'}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    verify(args.source, args.output)
