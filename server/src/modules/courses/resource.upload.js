import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { AppError } from '../../shared/AppError.js';
import { RESOURCE_TYPES } from '../../shared/constants.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_ROOT = path.resolve(MODULE_DIR, '../../../uploads');
export const DEFAULT_MAX_RESOURCE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB

/**
 * Executable, script, active-web, and installer extensions blocked regardless of MIME claims.
 */
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.mjs',
  '.cjs',
  '.ts',
  '.sh',
  '.bash',
  '.zsh',
  '.ksh',
  '.ps1',
  '.psm1',
  '.psd1',
  '.py',
  '.pyc',
  '.rb',
  '.pl',
  '.php',
  '.phtml',
  '.jsp',
  '.asp',
  '.aspx',
  '.cgi',
  '.jar',
  '.war',
  '.ear',
  '.class',
  '.app',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.bin',
  '.elf',
  '.dll',
  '.so',
  '.dylib',
  '.sys',
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.hta',
  '.lnk',
  '.reg',
  '.inf',
  '.cpl',
  '.wsf',
  '.wsh',
]);

/**
 * Strict MIME-type whitelist mapped to canonical extensions and default CAPSERA resource type.
 */
const ALLOWED_MIME_MAP = new Map([
  ['application/pdf', { extensions: ['.pdf'], resourceType: RESOURCE_TYPES.DOCUMENT }],
  ['text/plain', { extensions: ['.txt'], resourceType: RESOURCE_TYPES.DOCUMENT }],
  ['text/csv', { extensions: ['.csv'], resourceType: RESOURCE_TYPES.DOCUMENT }],
  ['text/markdown', { extensions: ['.md'], resourceType: RESOURCE_TYPES.DOCUMENT }],
  ['application/msword', { extensions: ['.doc'], resourceType: RESOURCE_TYPES.DOCUMENT }],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    { extensions: ['.docx'], resourceType: RESOURCE_TYPES.DOCUMENT },
  ],
  ['application/vnd.ms-powerpoint', { extensions: ['.ppt'], resourceType: RESOURCE_TYPES.PRESENTATION }],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    { extensions: ['.pptx'], resourceType: RESOURCE_TYPES.PRESENTATION },
  ],
  ['video/mp4', { extensions: ['.mp4'], resourceType: RESOURCE_TYPES.VIDEO }],
  ['video/webm', { extensions: ['.webm'], resourceType: RESOURCE_TYPES.VIDEO }],
  ['video/quicktime', { extensions: ['.mov'], resourceType: RESOURCE_TYPES.VIDEO }],
  ['audio/mpeg', { extensions: ['.mp3'], resourceType: RESOURCE_TYPES.OTHER }],
  ['image/png', { extensions: ['.png'], resourceType: RESOURCE_TYPES.OTHER }],
  ['image/jpeg', { extensions: ['.jpg', '.jpeg'], resourceType: RESOURCE_TYPES.OTHER }],
  ['image/webp', { extensions: ['.webp'], resourceType: RESOURCE_TYPES.OTHER }],
  ['application/zip', { extensions: ['.zip'], resourceType: RESOURCE_TYPES.OTHER }],
  ['application/x-zip-compressed', { extensions: ['.zip'], resourceType: RESOURCE_TYPES.OTHER }],
]);

/**
 * Resolve the local development uploads root directory dynamically (test-override safe).
 */
export function getUploadRootDir() {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : DEFAULT_UPLOAD_ROOT;
}

/**
 * Return configured maximum uploaded resource file size in bytes.
 */
export function getMaxResourceFileSizeBytes() {
  const parsed = Number(process.env.MAX_RESOURCE_FILE_SIZE_BYTES);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_RESOURCE_FILE_SIZE_BYTES;
}

/**
 * Sanitize client-provided filenames for safe metadata storage and Content-Disposition headers.
 */
export function sanitizeOriginalFilename(rawName, forcedExt = '') {
  const rawBase = String(rawName || '').split(/[/\\]/).pop() || '';
  const withoutControls = rawBase.replace(/[\x00-\x1f\x7f\r\n]/g, '');
  const ext = forcedExt || path.extname(withoutControls).toLowerCase();
  const stemRaw = ext ? withoutControls.slice(0, -ext.length) : withoutControls;
  const safeStem = stemRaw
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/_{2,}/g, '_')
    .trim()
    .slice(0, Math.max(1, 200 - ext.length));

  const finalStem = safeStem || 'resource';
  return `${finalStem}${ext}`;
}

/**
 * Normalize MIME type string without optional charset/boundary parameters.
 */
export function normalizeMimeType(rawMime) {
  return String(rawMime || '').toLowerCase().split(';')[0].trim();
}

/**
 * Infer canonical CAPSERA RESOURCE_TYPES value from an already-validated MIME type.
 */
export function inferResourceTypeFromMime(mimeType) {
  const entry = ALLOWED_MIME_MAP.get(normalizeMimeType(mimeType));
  return entry ? entry.resourceType : RESOURCE_TYPES.OTHER;
}

/**
 * Build relative POSIX storage key inside the course uploads directory.
 */
export function buildStorageKey(courseId, storedFilename) {
  return path.posix.join('courses', String(courseId), storedFilename);
}

/**
 * Extract normalized metadata from a completed Multer file object using documented fields only.
 */
export function extractUploadedFileMetadata(courseId, file) {
  const normalizedMime = normalizeMimeType(file.mimetype);
  const ext = path.extname(file.filename || file.originalname || '').toLowerCase();
  return {
    storageKey: buildStorageKey(courseId, file.filename),
    originalFilename: sanitizeOriginalFilename(file.originalname, ext),
    mimeType: normalizedMime,
    fileSizeBytes: Number(file.size),
    defaultResourceType: inferResourceTypeFromMime(normalizedMime),
  };
}

function validateUploadFile(file) {
  const baseName = String(file?.originalname || '').split(/[/\\]/).pop() || '';
  const segments = baseName.split('.').slice(1);

  for (const segment of segments) {
    if (BLOCKED_EXTENSIONS.has(`.${segment.toLowerCase()}`)) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Executable, script, and HTML/SVG files are not permitted',
      );
    }
  }

  const ext = path.extname(baseName).toLowerCase();
  const normalizedMime = normalizeMimeType(file?.mimetype);
  const allowedEntry = ALLOWED_MIME_MAP.get(normalizedMime);

  if (!allowedEntry || !ext || !allowedEntry.extensions.includes(ext)) {
    throw new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Unsupported file type. Allowed formats: PDF, Office docs/slides, TXT/CSV/MD, MP4/WEBM/MOV, MP3, PNG/JPG/WEBP, ZIP',
    );
  }

  return { ext, normalizedMime };
}

/**
 * Resolve and confine a stored storage_ref to the uploads root directory (blocks path traversal).
 */
export function resolveSafeStoragePath(storageRef) {
  if (!storageRef || typeof storageRef !== 'string') {
    return null;
  }
  const uploadRoot = getUploadRootDir();
  const resolved = path.resolve(uploadRoot, storageRef);
  const relative = path.relative(uploadRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

/**
 * Remove an uploaded file by Multer file object or relative storage_ref without throwing on ENOENT.
 */
export async function removeStoredFile({ file = null, storageRef = null } = {}) {
  const candidates = [];
  if (file?.path) {
    candidates.push(file.path);
  }
  if (storageRef) {
    const safePath = resolveSafeStoragePath(storageRef);
    if (safePath && !candidates.includes(safePath)) {
      candidates.push(safePath);
    }
  }

  for (const filePath of candidates) {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        // Ignore cleanup errors during error unwinding so original API errors surface cleanly.
      }
    }
  }
}

/**
 * Express middleware handling multipart uploads via multer with 413/415 conversion and filename sanitization.
 * Passes JSON link-only requests straight through.
 */
export function handleResourceUpload(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next();
  }

  const maxBytes = getMaxResourceFileSizeBytes();
  const storage = multer.diskStorage({
    destination(uploadReq, file, cb) {
      const courseId = String(uploadReq.params.courseId);
      const destDir = path.join(getUploadRootDir(), 'courses', courseId);
      fs.mkdir(destDir, { recursive: true }, (err) => cb(err, destDir));
    },
    filename(uploadReq, file, cb) {
      try {
        const { ext } = validateUploadFile(file);
        const storedFilename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        cb(null, storedFilename);
      } catch (err) {
        cb(err);
      }
    },
  });

  const uploadSingle = multer({
    storage,
    limits: {
      fileSize: maxBytes,
      files: 1,
    },
    fileFilter(uploadReq, file, cb) {
      try {
        validateUploadFile(file);
        cb(null, true);
      } catch (err) {
        cb(err);
      }
    },
  }).single('file');

  return uploadSingle(req, res, async (err) => {
    if (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              413,
              'FILE_TOO_LARGE',
              `Uploaded file exceeds maximum allowed size of ${maxBytes} bytes`,
            ),
          );
        }
        return next(new AppError(400, 'VALIDATION_ERROR', err.message || 'Invalid upload payload'));
      }
      return next(err);
    }

    if (req.file && req.file.size === 0) {
      await removeStoredFile({ file: req.file });
      return next(new AppError(400, 'VALIDATION_ERROR', 'Uploaded file must not be empty'));
    }

    return next();
  });
}
