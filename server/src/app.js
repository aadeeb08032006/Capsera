import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/db.js';
import { sendSuccess } from './shared/response.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import courseRoutes from './modules/courses/course.routes.js';
import skillsRoutes, { profileSkillsRoutes } from './modules/competency/skills.routes.js';

const app = express();

// Core middleware
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Canonical /api/v1 router
const apiRouter = express.Router();

/**
 * GET /api/v1/health
 * Foundation health endpoint. Pass `?db=true` to test PostgreSQL connectivity.
 */
apiRouter.get('/health', async (req, res, next) => {
  try {
    const shouldCheckDb = req.query.db === 'true' || req.query.db === '1';
    let database = {
      checked: false,
      engine: 'postgresql',
      status: 'SKIPPED',
      name: env.db.database,
    };

    if (shouldCheckDb) {
      const dbResult = await checkDatabaseConnection();
      database = {
        checked: true,
        engine: dbResult.engine,
        status: dbResult.connected ? 'CONNECTED' : 'UNAVAILABLE',
        name: dbResult.database,
        ...(dbResult.errorCode ? { errorCode: dbResult.errorCode } : {}),
      };
    }

    return sendSuccess(res, {
      service: 'capsera-api',
      status: 'OK',
      timestamp: new Date().toISOString(),
      database,
    });
  } catch (error) {
    return next(error);
  }
});

// Mount /api/v1 prefix (Feature module routers will be registered here by Members 1–4)
apiRouter.use('/courses', courseRoutes);
apiRouter.use('/skills', skillsRoutes);
apiRouter.use('/profiles', profileSkillsRoutes);
app.use(env.apiPrefix, apiRouter);

// Fallback & error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
