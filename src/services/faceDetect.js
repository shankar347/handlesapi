/**
 * In-memory face check. The image bytes are decoded, measured, and discarded.
 * Nothing here is stored. A pass requires a skin-toned face region with two
 * distinct darker eye spots. Flat colors, text, and landscapes fail.
 */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);

const isSkin = (r, g, b) =>
  r > 95 &&
  g > 40 &&
  b > 20 &&
  r > g &&
  r > b &&
  Math.abs(r - g) > 15 &&
  r - b > 15;

const decodeImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    return null;
  }
  if (buffer.subarray(0, 4).equals(PNG_SIG)) {
    // Lazy so unit tests can run even if a caller passes raw RGBA.
    // eslint-disable-next-line global-require
    const { PNG } = require('pngjs');
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (buffer.subarray(0, 3).equals(JPEG_SIG)) {
    // eslint-disable-next-line global-require
    const jpeg = require('jpeg-js');
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  return null;
};

const sample = (image) => {
  const maxEdge = 280;
  const stride = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxEdge));
  const width = Math.floor(image.width / stride);
  const height = Math.floor(image.height / stride);
  const luma = new Float32Array(width * height);
  const skin = new Uint8Array(width * height);
  let lumaSum = 0;
  let lumaSq = 0;
  let skinCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = ((y * stride) * image.width + x * stride) * 4;
      const r = image.data[src];
      const g = image.data[src + 1];
      const b = image.data[src + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const i = y * width + x;
      luma[i] = l;
      lumaSum += l;
      lumaSq += l * l;
      if (isSkin(r, g, b)) {
        skin[i] = 1;
        skinCount += 1;
      }
    }
  }

  const n = width * height;
  const mean = lumaSum / n;
  const variance = Math.max(0, lumaSq / n - mean * mean);
  return { width, height, luma, skin, skinCount, variance };
};

const skinBounds = (sampled) => {
  const { width, height, skin } = sampled;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!skin[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
};

const darkSpot = (luma, width, x0, y0, x1, y1) => {
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 6 || rh < 6) return false;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sum += luma[y * width + x];
      count += 1;
    }
  }
  const mean = sum / count;
  const win = 4;
  let darkest = 255;
  let darkPixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (luma[y * width + x] < mean - 28) darkPixels += 1;
    }
  }
  for (let y = y0; y <= y1 - win; y += 2) {
    for (let x = x0; x <= x1 - win; x += 2) {
      let wsum = 0;
      for (let dy = 0; dy < win; dy += 1) {
        for (let dx = 0; dx < win; dx += 1) {
          wsum += luma[(y + dy) * width + (x + dx)];
        }
      }
      const wmean = wsum / (win * win);
      if (wmean < darkest) darkest = wmean;
    }
  }
  const ratio = darkPixels / count;
  return darkest < mean - 22 && ratio > 0.015 && ratio < 0.45;
};

const analyzeFace = (buffer) => {
  const image = decodeImage(buffer);
  if (!image) {
    return { ok: false, reason: 'unreadable_image' };
  }
  if (image.width < 80 || image.height < 80) {
    return { ok: false, reason: 'too_small' };
  }

  const sampled = sample(image);
  const area = sampled.width * sampled.height;
  if (sampled.variance < 80) {
    return { ok: false, reason: 'too_flat' };
  }

  const skinRatio = sampled.skinCount / area;
  if (skinRatio < 0.06 || skinRatio > 0.82) {
    return { ok: false, reason: 'no_face_region' };
  }

  const bounds = skinBounds(sampled);
  if (!bounds) {
    return { ok: false, reason: 'no_face_region' };
  }
  const aspect = bounds.bw / bounds.bh;
  if (aspect < 0.45 || aspect > 1.7 || bounds.bw < 24 || bounds.bh < 28) {
    return { ok: false, reason: 'face_shape' };
  }

  const eyeBottom = bounds.minY + Math.floor(bounds.bh * 0.48);
  const midX = bounds.minX + Math.floor(bounds.bw / 2);
  const leftEye = darkSpot(
    sampled.luma,
    sampled.width,
    bounds.minX,
    bounds.minY,
    midX,
    eyeBottom,
  );
  const rightEye = darkSpot(
    sampled.luma,
    sampled.width,
    midX,
    bounds.minY,
    bounds.maxX + 1,
    eyeBottom,
  );
  if (!leftEye || !rightEye) {
    return { ok: false, reason: 'eyes_not_found' };
  }

  return { ok: true, reason: 'face_detected' };
};

module.exports = {
  analyzeFace,
  decodeImage,
};
