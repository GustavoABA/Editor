import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeComposition, compositionHtml, validateJob } from "./server.mjs";

const validJob = {
  html: '<div class="badge"><h1>Olá mundo</h1></div>',
  css: '.badge{display:grid;animation:enter 1s ease-out}@keyframes enter{from{opacity:0}to{opacity:1}}',
  width: 640, height: 360, duration: 2, fps: 24,
};

test("accepts editable CSS keyframe animation and preserves safe labels", () => {
  const html = compositionHtml(validJob);
  assert.match(html, /Olá mundo/);
  assert.match(html, /@keyframes enter/);
  assert.match(html, /data-composition-id="opencut-hyperframes"/);
  assert.match(html, /data-duration="2"/);
  assert.match(html, /script-src 'unsafe-inline'/); // Official seekable runtime needs it.
  assert.match(html, /connect-src 'none'/);
});

test("rejects user scripts, inline handlers, external resources and unsafe CSS", () => {
  const bad = [
    '<script>alert(1)</script>',
    '<iframe src="https://example.org"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '<div onclick="alert(1)">bad</div>',
  ];
  for (const html of bad) {
    // Scripts/iframe/svg are blocked directly; handlers must be stripped.
    if (/<(?:script|iframe|svg)/.test(html)) {
      assert.throws(() => sanitizeComposition({ html, css: "" }));
    } else {
      assert.doesNotMatch(sanitizeComposition({ html, css: "" }), /onclick=/);
    }
  }
  assert.throws(() => sanitizeComposition({ html: "hello", css: "a{background:url(https://example.org/x)}" }));
  assert.throws(() => sanitizeComposition({ html: "hello", css: '@import "https://example.org/a.css";' }));
});

test("enforces bounded frame duration and resolution", () => {
  assert.deepEqual(validateJob(validJob).fps, 24);
  assert.throws(() => validateJob({ ...validJob, fps: 120 }));
  assert.throws(() => validateJob({ ...validJob, duration: 60 }));
  assert.throws(() => validateJob({ ...validJob, width: 4000 }));
});
