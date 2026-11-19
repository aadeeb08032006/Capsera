/**
 * Shared client-side helpers for authenticated binary resource downloads.
 * Validates HTTP status, session expiration, and MIME/Content-Type before
 * exposing a Blob download to the browser, preserving authoritative filenames.
 */

const REVOKE_BLOB_URL_DELAY_MS = 10000;

export function sanitizeDownloadFilename(rawName, fallback = 'resource-file') {
  const baseName = String(rawName || '')
    .split(/[/\\]/)
    .pop()
    ?.replace(/[\x00-\x1f\x7f"']/g, '')
    .trim();

  if (!baseName || baseName === '.' || baseName === '..') {
    return fallback;
  }
  return baseName;
}

export function parseContentDispositionFilename(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const extMatch = headerValue.match(/filename\*\s*=\s*(?:utf-8''|UTF-8'')?["']?([^;"']+)["']?/i);
  if (extMatch && extMatch[1]) {
    let decoded = extMatch[1].trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Keep raw token if percent-decoding fails
    }
    const sanitized = sanitizeDownloadFilename(decoded, '');
    if (sanitized) return sanitized;
  }

  const basicMatch = headerValue.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;\s]+)/i);
  const rawMatch = basicMatch?.[1] || basicMatch?.[2];
  if (rawMatch) {
    const sanitized = sanitizeDownloadFilename(rawMatch, '');
    if (sanitized) return sanitized;
  }

  return null;
}

export function resolveDownloadFilename(contentDisposition, fallbackFilename = 'resource-file') {
  const fromHeader = parseContentDispositionFilename(contentDisposition);
  if (fromHeader) {
    return fromHeader;
  }
  return sanitizeDownloadFilename(fallbackFilename, 'resource-file');
}

export function isInvalidFileContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'application/json' ||
    normalized === 'application/problem+json' ||
    normalized.endsWith('+json') ||
    normalized === 'text/html' ||
    normalized === 'application/xhtml+xml'
  ) {
    return true;
  }
  return false;
}

export function buildDownloadErrorMessage(status, payload = null, rawText = '') {
  const apiMessage = payload?.error?.message || payload?.message;
  if (apiMessage && typeof apiMessage === 'string') {
    return apiMessage;
  }

  if (status === 401) {
    return 'Your session has expired or you are not signed in. Please sign in again.';
  }
  if (status === 403) {
    return 'Access denied. You do not have permission to download this resource.';
  }
  if (status === 404) {
    return 'Resource file could not be found or is no longer available.';
  }

  const trimmed = String(rawText || '').trim();
  if (trimmed && !trimmed.startsWith('<')) {
    return trimmed.slice(0, 200);
  }

  return `Download failed with status ${status}.`;
}

function createDownloadError(message, status, code = 'DOWNLOAD_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export async function executeResourceDownload({
  courseId,
  resourceId,
  fallbackFilename = 'resource-file',
  token = null,
  apiBaseUrl = '/api/v1',
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  onUnauthorized = null,
  documentObj = typeof document !== 'undefined' ? document : null,
  urlObj = typeof window !== 'undefined' ? window.URL : null,
  scheduleCleanup = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout,
  revokeDelayMs = REVOKE_BLOB_URL_DELAY_MS,
}) {
  if (!fetchImpl) {
    throw createDownloadError('Download client is unavailable in this environment.', 0);
  }
  if (!documentObj || !urlObj) {
    throw createDownloadError('Browser download APIs are unavailable.', 0);
  }

  const url = `${apiBaseUrl}/courses/${courseId}/resources/${resourceId}/download`;
  const response = await fetchImpl(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const headerContentType = response.headers?.get?.('content-type') || '';
  const contentDisposition = response.headers?.get?.('content-disposition') || '';

  if (!response.ok) {
    if (response.status === 401 && typeof onUnauthorized === 'function') {
      onUnauthorized();
    }

    let payload = null;
    let rawText = '';
    if (String(headerContentType).toLowerCase().includes('json')) {
      payload = await response.json().catch(() => null);
    } else {
      rawText = await response.text().catch(() => '');
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }
    }

    throw createDownloadError(
      buildDownloadErrorMessage(response.status, payload, rawText),
      response.status,
      payload?.error?.code || 'HTTP_ERROR',
    );
  }

  if (isInvalidFileContentType(headerContentType)) {
    const normalized = String(headerContentType).toLowerCase();
    if (normalized.includes('json')) {
      const payload = await response.json().catch(() => null);
      throw createDownloadError(
        payload?.error?.message ||
          payload?.message ||
          'Download blocked: server returned JSON instead of a document file.',
        response.status,
        payload?.error?.code || 'INVALID_DOWNLOAD_PAYLOAD',
      );
    }
    throw createDownloadError(
      'Download blocked: server returned an HTML page instead of the requested file.',
      response.status,
      'INVALID_DOWNLOAD_PAYLOAD',
    );
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw createDownloadError('Downloaded file is empty (0 bytes).', response.status, 'EMPTY_DOWNLOAD');
  }

  if (isInvalidFileContentType(blob.type || '')) {
    throw createDownloadError(
      'Download blocked: received non-binary error content instead of a document file.',
      response.status,
      'INVALID_DOWNLOAD_PAYLOAD',
    );
  }

  const filename = resolveDownloadFilename(contentDisposition, fallbackFilename);
  const blobUrl = urlObj.createObjectURL(blob);
  const anchor = documentObj.createElement('a');

  try {
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    documentObj.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    scheduleCleanup(() => {
      urlObj.revokeObjectURL(blobUrl);
    }, revokeDelayMs);
  }

  return {
    filename,
    contentType: blob.type || headerContentType || 'application/octet-stream',
    sizeBytes: blob.size,
  };
}
