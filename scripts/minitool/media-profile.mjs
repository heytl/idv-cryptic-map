import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function imageQuality(value) {
  if (value === undefined || value === '') return null;
  if (!/^\d+$/.test(String(value))) throw Error('MINITOOL_IMAGE_QUALITY must be an integer from 1 to 100');
  const quality = Number(value);
  if (quality < 1 || quality > 100) throw Error('MINITOOL_IMAGE_QUALITY must be an integer from 1 to 100');
  return quality;
}

// Derived media keeps source provenance; content-addressed names always match bytes.
export async function prepareImage(bytes, sourcePath, quality, sharp) {
  const sourceSha256 = digest(bytes);
  if (sourcePath !== `media/${sourceSha256}.webp`) throw Error('Original image hash mismatch: ' + sourcePath);
  if (quality === null) return { bytes, record: { sourcePath, path: sourcePath, sourceSha256, sha256: sourceSha256, sourceBytes: bytes.length, bytes: bytes.length, reencoded: false } };
  const before = await sharp(bytes).metadata();
  const encoded = await sharp(bytes).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
  const chosen = encoded.length < bytes.length ? encoded : bytes;
  const after = await sharp(chosen).metadata();
  if (before.width !== after.width || before.height !== after.height || before.hasAlpha !== after.hasAlpha) throw Error('Image geometry or transparency changed: ' + sourcePath);
  const sha256 = digest(chosen);
  return { bytes: chosen, record: { sourcePath, path: `media/${sha256}.webp`, sourceSha256, sha256, sourceBytes: bytes.length, bytes: chosen.length,
    width: before.width, height: before.height, reencoded: chosen !== bytes } };
}
