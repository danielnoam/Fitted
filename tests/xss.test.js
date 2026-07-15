import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { escapeHtml } from '../js/domUtil.js';
import { itemCardHtml } from '../js/ui/wardrobeView.js';
import { matchRowHtml } from '../js/ui/matchView.js';

const PAYLOAD = '<img src=x onerror=alert(1)>';

before(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  // Real object URLs aren't relevant to this test - just needs to exist.
  global.URL.createObjectURL = () => 'blob:mock-url';
});

function parseIntoDiv(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('escapeHtml', () => {
  test('neutralizes angle brackets and quotes', () => {
    const escaped = escapeHtml(PAYLOAD);
    assert.doesNotMatch(escaped, /<img/);
    assert.match(escaped, /&lt;img/);
  });
});

describe('subCategory is escaped wherever it renders (regression for stored XSS)', () => {
  const maliciousItem = {
    id: '1',
    category: 'top',
    subCategory: PAYLOAD,
    thumbnail: {},
    dominantColors: [],
  };

  test('wardrobeView.itemCardHtml does not let subCategory inject markup', () => {
    const div = parseIntoDiv(itemCardHtml(maliciousItem));
    // Only the legitimate thumbnail <img> should exist - none injected via subCategory.
    assert.equal(div.querySelectorAll('img').length, 1);
    assert.match(div.querySelector('.category-badge').textContent, /<img src=x onerror=alert\(1\)>/);
  });

  test('matchView.matchRowHtml does not let subCategory inject markup', () => {
    const result = {
      item: maliciousItem,
      score: 0.8,
      colorRelation: 'neutral',
      categoryScore: 1,
      patternPenalty: 0,
      formalityPenalty: 0,
    };
    const div = parseIntoDiv(matchRowHtml(maliciousItem, result));
    assert.equal(div.querySelectorAll('img').length, 1);
    assert.match(div.querySelector('.category-badge').textContent, /<img src=x onerror=alert\(1\)>/);
  });
});
