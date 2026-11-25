const { PNG } = require('pngjs');
const { analyzeFace } = require('../src/services/faceDetect');

const paint = (width, height, draw) => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = draw(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
};

const inEllipse = (x, y, cx, cy, rx, ry) => {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};

describe('analyzeFace', () => {
  test('rejects a flat image', () => {
    const image = paint(120, 120, () => [180, 180, 180]);
    expect(analyzeFace(image)).toMatchObject({ ok: false, reason: 'too_flat' });
  });

  test('rejects a landscape with no skin', () => {
    const image = paint(160, 120, (x, y) => (y < 60 ? [70, 140, 210] : [40, 120, 50]));
    expect(analyzeFace(image).ok).toBe(false);
  });

  test('accepts a selfie-like frame and does not keep a success shortcut', () => {
    const image = paint(160, 200, (x, y) => {
      const leftEye = inEllipse(x, y, 62, 78, 7, 5);
      const rightEye = inEllipse(x, y, 98, 78, 7, 5);
      const mouth = inEllipse(x, y, 80, 118, 10, 4);
      if (leftEye || rightEye || mouth) return [20, 16, 14];
      if (inEllipse(x, y, 80, 96, 42, 58)) return [214, 156, 120];
      return [72, 96, 128];
    });
    expect(analyzeFace(image)).toMatchObject({ ok: true, reason: 'face_detected' });
  });
});
