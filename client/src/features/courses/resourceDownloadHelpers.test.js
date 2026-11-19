import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isInvalidFileContentType,
  parseContentDispositionFilename,
  resolveDownloadFilename,
  executeResourceDownload,
} from './resourceDownloadHelpers.js';

function createMockDom() {
  const clicked = [];
  const appended = [];
  const removed = [];
  const revoked = [];
  const cleanups = [];

  const documentObj = {
    body: {
      appendChild(node) {
        appended.push(node);
      },
      removeChild(node) {
        removed.push(node);
      },
    },
    createElement() {
      const node = {
        style: {},
        parentNode: null,
        click() {
          clicked.push({ href: node.href, download: node.download });
        },
      };
      node.parentNode = documentObj.body;
      return node;
    },
  };

  const urlObj = {
    createObjectURL() {
      return 'blob:http://localhost:5173/test-blob-1';
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };

  const scheduleCleanup = (fn, delay) => {
    cleanups.push({ fn, delay });
  };

  return { clicked, appended, removed, revoked, cleanups, documentObj, urlObj, scheduleCleanup };
}

describe('resourceDownloadHelpers filename & MIME guards', () => {
  it('prefers RFC 5987 UTF-8 filename* over basic filename and sanitizes traversal', () => {
    const header =
      "attachment; filename=\"fallback_name.pdf\"; filename*=UTF-8''Weather%20Charts%20(2026).pdf";
    assert.equal(parseContentDispositionFilename(header), 'Weather Charts (2026).pdf');

    const traversal = 'attachment; filename="../../secret\\report.docx"';
    assert.equal(parseContentDispositionFilename(traversal), 'report.docx');
  });

  it('falls back safely without forcing .pdf when Content-Disposition is absent', () => {
    assert.equal(resolveDownloadFilename('', 'syllabus.txt'), 'syllabus.txt');
    assert.equal(resolveDownloadFilename('', 'slides.pptx'), 'slides.pptx');
    assert.equal(resolveDownloadFilename('', ''), 'resource-file');
  });

  it('flags JSON and HTML content types while allowing document, text, and binary MIME types', () => {
    assert.equal(isInvalidFileContentType('application/json; charset=utf-8'), true);
    assert.equal(isInvalidFileContentType('application/problem+json'), true);
    assert.equal(isInvalidFileContentType('text/html; charset=utf-8'), true);

    assert.equal(isInvalidFileContentType('application/pdf'), false);
    assert.equal(isInvalidFileContentType('text/plain; charset=utf-8'), false);
    assert.equal(
      isInvalidFileContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      false,
    );
    assert.equal(
      isInvalidFileContentType('application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      false,
    );
  });
});

describe('executeResourceDownload authenticated flow & error handling', () => {
  it('attaches Bearer JWT, downloads binary PDF using Content-Disposition filename, and defers blob cleanup', async () => {
    const dom = createMockDom();
    let capturedRequest = null;

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    const fakeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="Invoice.pdf"; filename*=UTF-8\'\'Invoice-Final.pdf',
      }),
      async blob() {
        return new Blob([pdfBytes], { type: 'application/pdf' });
      },
    };

    const result = await executeResourceDownload({
      courseId: '2',
      resourceId: '9',
      fallbackFilename: 'fallback.txt',
      token: 'jwt-abc-123',
      fetchImpl: async (url, init) => {
        capturedRequest = { url, init };
        return fakeResponse;
      },
      ...dom,
    });

    assert.equal(capturedRequest.url, '/api/v1/courses/2/resources/9/download');
    assert.equal(capturedRequest.init.headers.Authorization, 'Bearer jwt-abc-123');
    assert.equal(capturedRequest.init.credentials, 'include');

    assert.equal(result.filename, 'Invoice-Final.pdf');
    assert.equal(result.contentType, 'application/pdf');
    assert.equal(result.sizeBytes, pdfBytes.length);

    assert.equal(dom.clicked.length, 1);
    assert.equal(dom.clicked[0].download, 'Invoice-Final.pdf');
    assert.equal(dom.appended.length, 1);
    assert.equal(dom.removed.length, 1);
    // Deferred cleanup: not revoked synchronously before browser reads blob
    assert.equal(dom.revoked.length, 0);
    assert.equal(dom.cleanups.length, 1);
    assert.equal(dom.cleanups[0].delay, 10000);
    dom.cleanups[0].fn();
    assert.deepEqual(dom.revoked, ['blob:http://localhost:5173/test-blob-1']);
  });

  it('rejects HTTP 401/403 API JSON errors, triggers onUnauthorized on 401, and never triggers a download', async () => {
    const dom = createMockDom();
    let unauthorizedCalled = 0;

    await assert.rejects(
      () =>
        executeResourceDownload({
          courseId: '2',
          resourceId: '9',
          token: 'expired-jwt',
          onUnauthorized: () => {
            unauthorizedCalled += 1;
          },
          fetchImpl: async () => ({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            async json() {
              return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
            },
          }),
          ...dom,
        }),
      /Authentication required/,
    );

    assert.equal(unauthorizedCalled, 1);
    assert.equal(dom.clicked.length, 0);
  });

  it('blocks accidental 200 OK JSON or HTML responses from being downloaded as PDF', async () => {
    const dom = createMockDom();

    await assert.rejects(
      () =>
        executeResourceDownload({
          courseId: '2',
          resourceId: '9',
          fallbackFilename: 'notes.pdf',
          token: 'jwt-valid',
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
            async json() {
              return { success: false, error: { message: 'Upstream gateway error' } };
            },
          }),
          ...dom,
        }),
      /Upstream gateway error/,
    );

    await assert.rejects(
      () =>
        executeResourceDownload({
          courseId: '2',
          resourceId: '9',
          fallbackFilename: 'notes.pdf',
          token: 'jwt-valid',
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            async blob() {
              return new Blob(['<html><body>SPA fallback</body></html>'], { type: 'text/html' });
            },
          }),
          ...dom,
        }),
      /HTML page instead of the requested file/,
    );

    assert.equal(dom.clicked.length, 0);
  });
});
