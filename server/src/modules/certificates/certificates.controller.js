import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  listMyCertificatesQuerySchema,
  parseWithSchema,
  verifyCertificateParamsSchema,
} from './certificates.validation.js';
import { listMyCertificates, verifyCertificateByCode } from './certificates.service.js';

export const listMyCertificatesHandler = asyncHandler(async (req, res) => {
  const { page, pageSize } = parseWithSchema(listMyCertificatesQuerySchema, req.query ?? {});
  const result = await listMyCertificates(req.user.id, { page, pageSize });
  return sendPaginated(res, result);
});

export const verifyCertificateHandler = asyncHandler(async (req, res) => {
  const { certificateCode } = parseWithSchema(verifyCertificateParamsSchema, req.params ?? {});
  const certificate = await verifyCertificateByCode(certificateCode);
  return sendSuccess(res, { certificate });
});

