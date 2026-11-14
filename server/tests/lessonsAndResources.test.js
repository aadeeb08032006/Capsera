import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const testState = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-lessons-resources-32chars';
  return { uploadDir: '' };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, withTransaction } from '../src/config/db.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '10',
  fullName = 'Trainer One',
  email = 'trainer1@example.com',
  role = 'TRAINER',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeCourseRow(overrides = {}) {
  const now = new Date('2026-11-11T10:00:00.000Z');
  return {
    id: '1',
    trainer_id: '10',
    title: 'Monsoon Dynamics',
    summary: 'Synoptic scale analysis',
    description: 'Comprehensive module covering tropical meteorology.',
    subject: 'Meteorology',
    level: 'INTERMEDIATE',
    thumbnail_url: null,
    status: 'PUBLISHED',
    published_at: now,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeLessonRow(overrides = {}) {
  const now = new Date('2026-11-11T10:00:00.000Z');
  return {
    id: '101',
    course_id: '1',
    title: 'Jet Streams Overview',
    content: 'Detailed explanation of subtropical jet streams.',
    lesson_order: 1,
    estimated_duration_minutes: 45,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeResourceRow(overrides = {}) {
  const now = new Date('2026-11-11T10:00:00.000Z');
  return {
    id: '501',
    course_id: '1',
    lesson_id: '101',
    uploaded_by: '10',
    title: 'Lecture Slides',
    description: 'Week 1 slide deck',
    resource_type: 'DOCUMENT',
    storage_ref: 'courses/1/sample.pdf',
    external_url: null,
    original_filename: 'lecture1.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 256,
    resource_order: 1,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

describe('Lessons & Learning Resources API', () => {
  beforeAll(() => {
    testState.uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsera-uploads-'));
    process.env.UPLOAD_DIR = testState.uploadDir;
    process.env.MAX_RESOURCE_FILE_SIZE_BYTES = '1024';
  });

  afterAll(() => {
    delete process.env.UPLOAD_DIR;
    delete process.env.MAX_RESOURCE_FILE_SIZE_BYTES;
    if (testState.uploadDir) {
      fs.rmSync(testState.uploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MAX_RESOURCE_FILE_SIZE_BYTES = '1024';
  });

  describe('Lessons API (/api/v1/courses/:courseId/lessons & /api/v1/lessons/:lessonId)', () => {
    it('auto-assigns next lesson position when creating a lesson (201)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({ rows: [{ max_order: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            makeLessonRow({
              id: '103',
              course_id: '1',
              title: 'Thermodynamic Diagrams',
              lesson_order: 3,
            }),
          ],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .post('/api/v1/courses/1/lessons')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: '  Thermodynamic Diagrams  ',
          estimatedDurationMinutes: 45,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lesson).toMatchObject({
        id: '103',
        courseId: '1',
        title: 'Thermodynamic Diagrams',
        position: 3,
        estimatedDurationMinutes: 45,
      });
      expect(clientQuery.mock.calls[2][1][3]).toBe(3);
    });

    it('rejects lesson creation by non-owner trainer or trainee (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const traineeRes = await request(app)
        .post('/api/v1/courses/1/lessons')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ title: 'Unauthorized' });

      expect(traineeRes.status).toBe(403);
      expect(traineeRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '11', role: 'TRAINER' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });
      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const otherTrainerRes = await request(app)
        .post('/api/v1/courses/1/lessons')
        .set('Authorization', `Bearer ${makeToken('11')}`)
        .send({ title: 'Other Trainer Lesson' });

      expect(otherTrainerRes.status).toBe(403);
      expect(otherTrainerRes.body.error.code).toBe('FORBIDDEN');
    });

    it('looks up lesson course first then enforces ownership on PATCH /api/v1/lessons/:lessonId', async () => {
      mockAuthUser({ id: '11', role: 'TRAINER' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeLessonRow({ id: '101', course_id: '1' })] })
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const forbiddenRes = await request(app)
        .patch('/api/v1/lessons/101')
        .set('Authorization', `Bearer ${makeToken('11')}`)
        .send({ title: 'Hijacked Lesson' });

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '10', role: 'TRAINER' });
      const ownerQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeLessonRow({ id: '101', course_id: '1', lesson_order: 1 })] })
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({
          rows: [
            makeLessonRow({
              id: '101',
              course_id: '1',
              title: 'Updated Jet Streams',
              lesson_order: 1,
            }),
          ],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: ownerQuery }));

      const okRes = await request(app)
        .patch('/api/v1/lessons/101')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: 'Updated Jet Streams' });

      expect(okRes.status).toBe(200);
      expect(okRes.body.data.lesson.title).toBe('Updated Jet Streams');
    });

    it('hides DRAFT course lessons from trainees (403) and returns ordered lessons for PUBLISHED courses (200)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '2', trainer_id: '10', status: 'DRAFT' })],
      });

      const draftRes = await request(app)
        .get('/api/v1/courses/2/lessons')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(draftRes.status).toBe(403);

      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'PUBLISHED' })],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeLessonRow({ id: '101', lesson_order: 1 }),
          makeLessonRow({ id: '102', lesson_order: 2, title: 'Rossby Waves' }),
        ],
      });

      const pubRes = await request(app)
        .get('/api/v1/courses/1/lessons')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.lessons.map((l) => l.position)).toEqual([1, 2]);
    });

    it('reorders lesson positions safely across occupied slots on PATCH and blocks deleting in-use lessons (409)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      const reorderMock = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeLessonRow({ id: '102', course_id: '1', lesson_order: 2 })] })
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({
          rows: [
            makeLessonRow({ id: '101', lesson_order: 1 }),
            makeLessonRow({ id: '102', lesson_order: 2 }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            makeLessonRow({ id: '101', lesson_order: 1 }),
            makeLessonRow({ id: '102', lesson_order: 2 }),
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [makeLessonRow({ id: '102', course_id: '1', lesson_order: 1 })],
        });

      withTransaction.mockImplementationOnce(async (work) => work({ query: reorderMock }));

      const moveRes = await request(app)
        .patch('/api/v1/lessons/102')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ position: 1 });

      expect(moveRes.status).toBe(200);
      expect(moveRes.body.data.lesson.position).toBe(1);

      mockAuthUser({ id: '10', role: 'TRAINER' });
      const deleteInUseQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeLessonRow({ id: '101', course_id: '1' })] })
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({ rows: [{ in_use: true }] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: deleteInUseQuery }));

      const delRes = await request(app)
        .delete('/api/v1/lessons/101')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(delRes.status).toBe(409);
      expect(delRes.body.error.code).toBe('LESSON_IN_USE');
    });
  });

  describe('Learning Resources API & Protected Upload/Download', () => {
    it('rejects oversized uploaded files with 413 FILE_TOO_LARGE', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const oversizedBuffer = Buffer.alloc(2048, 'a');
      const res = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .field('title', 'Too Large Deck')
        .attach('file', oversizedBuffer, {
          filename: 'slides.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(413);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects executable and disallowed file types with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const exeRes = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .field('title', 'Executable Payload')
        .attach('file', Buffer.from('MZ...'), {
          filename: 'installer.exe',
          contentType: 'application/x-msdownload',
        });

      expect(exeRes.status).toBe(415);
      expect(exeRes.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const doubleExtRes = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .field('title', 'Disguised Script')
        .attach('file', Buffer.from('#!/bin/sh'), {
          filename: 'notes.sh.pdf',
          contentType: 'application/pdf',
        });

      expect(doubleExtRes.status).toBe(415);
      expect(doubleExtRes.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('sanitizes filenames, stores file in uploads/, saves only metadata, and omits raw storage paths', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] })
        .mockResolvedValueOnce({ rows: [{ id: '101' }] })
        .mockResolvedValueOnce({ rows: [{ max_order: 0 }] })
        .mockImplementationOnce(async (sql, params) => ({
          rows: [
            makeResourceRow({
              id: '700',
              course_id: '1',
              lesson_id: '101',
              uploaded_by: '10',
              title: params[3],
              resource_type: params[5],
              storage_ref: params[6],
              external_url: params[7],
              original_filename: params[8],
              mime_type: params[9],
              file_size_bytes: params[10],
              resource_order: params[11],
            }),
          ],
        }));

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const pdfBytes = Buffer.from('%PDF-1.4 sample content');
      const res = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .field('title', 'Synoptic Notes')
        .field('lessonId', '101')
        .attach('file', pdfBytes, {
          filename: '../../evil..notes;v1?.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const resource = res.body.data.resource;
      expect(resource).toMatchObject({
        id: '700',
        courseId: '1',
        lessonId: '101',
        resourceType: 'DOCUMENT',
        originalFilename: 'evil.notes_v1_.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: pdfBytes.length,
        hasFile: true,
        downloadUrl: '/api/v1/courses/1/resources/700/download',
      });
      expect(resource.storageRef).toBeUndefined();
      expect(resource.storage_ref).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(testState.uploadDir);

      const savedFiles = listFilesRecursive(testState.uploadDir);
      expect(savedFiles.length).toBeGreaterThanOrEqual(1);

      const insertedStorageRef = clientQuery.mock.calls[3][1][6];
      expect(insertedStorageRef).toMatch(/^courses\/1\/\d+-[0-9a-f-]+\.pdf$/);
    });

    it('cleans up uploaded disk file if metadata validation fails (400)', async () => {
      const filesBefore = listFilesRecursive(testState.uploadDir).length;
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const res = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .field('title', '')
        .attach('file', Buffer.from('%PDF-1.4 cleanup check'), {
          filename: 'orphan.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
      expect(listFilesRecursive(testState.uploadDir).length).toBe(filesBefore);
    });

    it('supports external LINK resources and blocks javascript: URLs', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });

      const badUrlRes = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: 'Malicious Link',
          resourceType: 'LINK',
          externalUrl: 'javascript:alert(1)',
        });

      expect(badUrlRes.status).toBe(400);

      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] })
        .mockResolvedValueOnce({ rows: [{ max_order: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            makeResourceRow({
              id: '701',
              title: 'NOAA Reference',
              resource_type: 'LINK',
              storage_ref: null,
              external_url: 'https://www.noaa.gov/education',
              original_filename: null,
              mime_type: null,
              file_size_bytes: null,
              resource_order: 2,
            }),
          ],
        });
      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const okRes = await request(app)
        .post('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: 'NOAA Reference',
          resourceType: 'LINK',
          externalUrl: 'https://www.noaa.gov/education',
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.data.resource).toMatchObject({
        resourceType: 'LINK',
        externalUrl: 'https://www.noaa.gov/education',
        hasFile: false,
        downloadUrl: null,
      });
    });

    it('returns 403 FORBIDDEN when an unenrolled trainee lists or downloads resources', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })] });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const listRes = await request(app)
        .get('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(listRes.status).toBe(403);
      expect(listRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })] });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const dlRes = await request(app)
        .get('/api/v1/courses/1/resources/501/download')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(dlRes.status).toBe(403);
      expect(dlRes.body.error.code).toBe('FORBIDDEN');
    });

    it('returns resource list without raw storage paths and serves authorized file downloads to enrolled trainee', async () => {
      const courseUploadDir = path.join(testState.uploadDir, 'courses', '1');
      fs.mkdirSync(courseUploadDir, { recursive: true });
      const diskFileName = 'verified-handout.pdf';
      const diskContent = '%PDF-1.4 CAPSERA protected handout';
      fs.writeFileSync(path.join(courseUploadDir, diskFileName), diskContent);
      const storageRef = 'courses/1/verified-handout.pdf';

      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })] });
      executeQuery.mockResolvedValueOnce({ rows: [{ id: '90', status: 'ACTIVE' }] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeResourceRow({
            id: '800',
            storage_ref: storageRef,
            original_filename: 'handout.pdf',
          }),
        ],
      });

      const listRes = await request(app)
        .get('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.resources).toHaveLength(1);
      expect(listRes.body.data.resources[0]).toMatchObject({
        id: '800',
        hasFile: true,
        downloadUrl: '/api/v1/courses/1/resources/800/download',
      });
      expect(listRes.body.data.resources[0].storageRef).toBeUndefined();
      expect(JSON.stringify(listRes.body)).not.toContain('verified-handout.pdf');

      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })] });
      executeQuery.mockResolvedValueOnce({ rows: [{ id: '90', status: 'ACTIVE' }] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeResourceRow({
            id: '800',
            storage_ref: storageRef,
            original_filename: 'handout.pdf',
            mime_type: 'application/pdf',
          }),
        ],
      });

      const dlRes = await request(app)
        .get('/api/v1/courses/1/resources/800/download')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(dlRes.status).toBe(200);
      expect(dlRes.headers['content-type']).toContain('application/pdf');
      expect(dlRes.headers['content-disposition']).toContain('attachment');
      expect(dlRes.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(dlRes.body).toString('utf8')).toBe(diskContent);
    });

    it('never exposes files directly under /uploads static path', async () => {
      const res = await request(app).get('/uploads/courses/1/verified-handout.pdf');
      expect(res.status).toBe(404);
    });

    it('blocks non-owner trainer and CANCELLED enrollment from listing or downloading resources (403)', async () => {
      mockAuthUser({ id: '11', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'PUBLISHED' })],
      });

      const trainerRes = await request(app)
        .get('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('11')}`);

      expect(trainerRes.status).toBe(403);
      expect(trainerRes.body.error.code).toBe('FORBIDDEN');

      mockAuthUser({ id: '21', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'PUBLISHED' })],
      });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const cancelledRes = await request(app)
        .get('/api/v1/courses/1/resources/800/download')
        .set('Authorization', `Bearer ${makeToken('21')}`);

      expect(cancelledRes.status).toBe(403);
      expect(cancelledRes.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to list resources and delete a file-backed resource with disk cleanup', async () => {
      const courseUploadDir = path.join(testState.uploadDir, 'courses', '1');
      fs.mkdirSync(courseUploadDir, { recursive: true });
      const targetPath = path.join(courseUploadDir, 'to-delete.pdf');
      fs.writeFileSync(targetPath, '%PDF-1.4 delete me');

      mockAuthUser({ id: '1', role: 'ADMIN' });
      executeQuery.mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10' })] });
      executeQuery.mockResolvedValueOnce({
        rows: [
          makeResourceRow({
            id: '801',
            storage_ref: 'courses/1/to-delete.pdf',
            original_filename: 'to-delete.pdf',
          }),
        ],
      });

      const listRes = await request(app)
        .get('/api/v1/courses/1/resources')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.resources[0].id).toBe('801');

      mockAuthUser({ id: '1', role: 'ADMIN' });
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeCourseRow({ id: '1', trainer_id: '10', status: 'DRAFT' })] })
        .mockResolvedValueOnce({
          rows: [{ id: '801', storage_ref: 'courses/1/to-delete.pdf' }],
        });
      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const delRes = await request(app)
        .delete('/api/v1/courses/1/resources/801')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data).toEqual({
        action: 'DELETED',
        deletedResourceId: '801',
      });
      expect(fs.existsSync(targetPath)).toBe(false);
    });
  });
});
