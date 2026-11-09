import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { imageQuality, prepareImage } from './media-profile.mjs';
const sharp = createRequire(new URL('../../apps/web/package.json', import.meta.url))('sharp');
const sourcePath = bytes => `media/${createHash('sha256').update(bytes).digest('hex')}.webp`;

test('original mode preserves bytes and validates content-addressed source', async () => {
  const bytes = await sharp({create:{width:32,height:24,channels:3,background:'#ad7721'}}).webp({lossless:true}).toBuffer();
  const result = await prepareImage(bytes,sourcePath(bytes),null,null);
  assert.deepEqual(result.bytes,bytes);
  assert.equal(result.record.path,sourcePath(bytes));
  await assert.rejects(prepareImage(bytes,'media/invalid.webp',null,null),/hash mismatch/);
});

test('quality profile retains geometry and records both source and derived hashes', async () => {
  let seed=12345;const pixels=Buffer.alloc(128*96*3);
  for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels[i]=seed>>>24;}
  const original=await sharp(pixels,{raw:{width:128,height:96,channels:3}}).webp({lossless:true}).toBuffer();
  const result=await prepareImage(original,sourcePath(original),85,sharp);
  const metadata=await sharp(result.bytes).metadata();
  assert.deepEqual([metadata.width,metadata.height,metadata.hasAlpha],[128,96,false]);
  assert(result.bytes.length<original.length);
  assert.equal(result.record.sourcePath,sourcePath(original));
  assert.equal(result.record.path,sourcePath(result.bytes));
  assert.equal(result.record.reencoded,true);
});

test('profile never enlarges an image or removes transparency', async () => {
  const original=await sharp({create:{width:24,height:20,channels:4,background:{r:210,g:120,b:35,alpha:.4}}}).webp({lossless:true}).toBuffer();
  const result=await prepareImage(original,sourcePath(original),95,sharp);
  assert(result.bytes.length<=original.length);
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha,true);
});

test('quality option rejects invalid values instead of silently reducing quality', () => {
  assert.equal(imageQuality(undefined),null);assert.equal(imageQuality('85'),85);
  for(const value of ['0','101','85.5','auto','-1'])assert.throws(()=>imageQuality(value),/integer/);
});
