import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractDominantColors, detectPattern } from '../js/imageProcess.js';

// These two functions only destructure {data, width, height} off their input
// and never touch the DOM, so a plain object stands in for a real ImageData
// in Node without needing jsdom/canvas.
function makeImageData(width, height, pixelFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a ?? 255;
    }
  }
  return { data, width, height };
}

describe('extractDominantColors', () => {
  test('a solid-color image returns one color at ~full ratio', () => {
    const imageData = makeImageData(10, 10, () => [200, 50, 50]);
    const colors = extractDominantColors(imageData, 3);
    assert.equal(colors.length, 1);
    assert.equal(colors[0].ratio, 1);
    assert.equal(colors[0].hex, '#c83232');
  });

  test('ranks colors by pixel count, most prevalent first', () => {
    // 3 red pixels, 1 blue pixel in a 2x2 image.
    const imageData = makeImageData(2, 2, (x, y) => (x === 1 && y === 1 ? [0, 0, 255] : [255, 0, 0]));
    const colors = extractDominantColors(imageData, 2);
    assert.equal(colors.length, 2);
    assert.equal(colors[0].hex, '#ff0000');
    assert.equal(colors[0].ratio, 0.75);
    assert.equal(colors[1].hex, '#0000ff');
    assert.equal(colors[1].ratio, 0.25);
  });

  test('skips transparent pixels', () => {
    const imageData = makeImageData(2, 2, (x, y) =>
      x === 0 && y === 0 ? [0, 0, 255, 0] : [255, 0, 0, 255]
    );
    const colors = extractDominantColors(imageData, 1);
    assert.equal(colors.length, 1);
    assert.equal(colors[0].hex, '#ff0000');
    assert.equal(colors[0].ratio, 1);
  });

  test('respects the requested color count', () => {
    const imageData = makeImageData(4, 1, (x) => [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]][x]);
    const colors = extractDominantColors(imageData, 2);
    assert.equal(colors.length, 2);
  });
});

describe('detectPattern', () => {
  test('a solid-color image is solid', () => {
    const imageData = makeImageData(40, 40, () => [120, 130, 200]);
    assert.equal(detectPattern(imageData), 'solid');
  });

  test('lighting/shading variation on one hue still reads as solid', () => {
    // Same hue throughout, lightness drifts smoothly down the image the way
    // folds/shadows would on a real garment.
    const imageData = makeImageData(40, 40, (x, y) => {
      const l = 60 + Math.round((y / 40) * 60); // 60..120 out of 255
      return [l, Math.round(l * 0.4), Math.round(l * 0.4)];
    });
    assert.equal(detectPattern(imageData), 'solid');
  });

  test('sharp alternating-hue stripes are detected as patterned', () => {
    // 2px-wide vertical stripes alternating red/cyan, matching the sampler's
    // cell size so neighboring grid cells fall on opposite stripes.
    const imageData = makeImageData(40, 40, (x) => (Math.floor(x / 2) % 2 === 0 ? [220, 20, 20] : [20, 200, 220]));
    assert.equal(detectPattern(imageData), 'patterned');
  });

  test('a black/white checkerboard is detected as patterned', () => {
    const imageData = makeImageData(40, 40, (x, y) => {
      const cell = Math.floor(x / 4) + Math.floor(y / 4);
      return cell % 2 === 0 ? [10, 10, 10] : [245, 245, 245];
    });
    assert.equal(detectPattern(imageData), 'patterned');
  });
});
