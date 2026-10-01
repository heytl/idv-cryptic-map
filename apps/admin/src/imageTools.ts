// 浏览器端图像处理：裁剪/缩略图，统一导出 WebP q90（crop_images.py 的替代品）

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WEBP_QUALITY = 0.9;
export const THUMB_WIDTH = 300;

export function loadImage(src: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isObjectUrl = typeof src !== 'string';
    const url = isObjectUrl ? URL.createObjectURL(src) : src;
    img.onload = () => {
      if (isObjectUrl) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (isObjectUrl) URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    if (!isObjectUrl) img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('WebP 编码失败'))), 'image/webp', WEBP_QUALITY);
  });
}

function draw(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  paint(canvas.getContext('2d')!);
  return canvas;
}

/** 按原图自然分辨率裁剪 */
export function crop(img: HTMLImageElement, r: Rect): Promise<Blob> {
  return toBlob(draw(r.w, r.h, (ctx) => ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)));
}

/** 目录卡片缩略图：等比缩到 300px 宽 */
export async function makeThumb(source: Blob): Promise<Blob> {
  const img = await loadImage(source);
  const h = Math.round((img.naturalHeight * THUMB_WIDTH) / img.naturalWidth);
  return toBlob(draw(THUMB_WIDTH, h, (ctx) => ctx.drawImage(img, 0, 0, THUMB_WIDTH, h)));
}

/** 任意上传图转 WebP（单张换图时用，顺带统一格式） */
export async function fileToWebp(file: File): Promise<Blob> {
  const img = await loadImage(file);
  return toBlob(draw(img.naturalWidth, img.naturalHeight, (ctx) => ctx.drawImage(img, 0, 0)));
}
