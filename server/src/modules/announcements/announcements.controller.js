import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  announcementIdParamSchema,
  createAnnouncementBodySchema,
  listAnnouncementsQuerySchema,
  parseWithSchema,
  updateAnnouncementBodySchema,
} from './announcements.validation.js';
import {
  createAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from './announcements.service.js';

export const listAnnouncementsHandler = asyncHandler(async (req, res) => {
  const filters = parseWithSchema(listAnnouncementsQuerySchema, req.query ?? {});
  const result = await listAnnouncements(filters, req.user ?? null);
  return sendPaginated(res, result);
});

export const createAnnouncementHandler = asyncHandler(async (req, res) => {
  const payload = parseWithSchema(createAnnouncementBodySchema, req.body ?? {});
  const announcement = await createAnnouncement(req.user.id, payload);
  return sendSuccess(res, { announcement }, 201);
});

export const updateAnnouncementHandler = asyncHandler(async (req, res) => {
  const { announcementId } = parseWithSchema(announcementIdParamSchema, req.params ?? {});
  const payload = parseWithSchema(updateAnnouncementBodySchema, req.body ?? {});
  const announcement = await updateAnnouncement(announcementId, payload);
  return sendSuccess(res, { announcement });
});
