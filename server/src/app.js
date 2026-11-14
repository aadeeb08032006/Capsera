import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/db.js';
import { sendSuccess } from './shared/response.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './modules/auth/auth.routes.js';
import courseRoutes from './modules/courses/course.routes.js';
import skillsRoutes, { profileSkillsRoutes } from './modules/competency/skills.routes.js';
import trainerRecommendationRoutes from './modules/competency/recommendations.routes.js';

const app = express();

// Core middleware
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  }),
);
const defaultJsonParser = express.json({ limit: '1mb' });
const authJsonParser = express.json({ limit: '10kb' });
const authPath = `${env.apiPrefix.replace(/\/$/, '')}/auth`.toLowerCase();

app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  const isAuthPath = path === authPath || path.startsWith(`${authPath}/`);
  return (isAuthPath ? authJsonParser : defaultJsonParser)(req, res, next);
});

// Canonical /api/v1 router
const apiRouter = express.Router();
apiRouter.use('/auth', authRouter);

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
apiRouter.use('/trainers', trainerRecommendationRoutes);
app.use(env.apiPrefix, apiRouter);

// Fallback & error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
