import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import { ReplicationService } from '../services/ReplicationService';
import { validateConnectionString, validateRequest, validateReplicationConfig } from '../utils/validation';

const router = Router();
const replicationService = new ReplicationService();

// Validation schemas
const storedReplicationSchema = Joi.object({
  configId: Joi.string().uuid().required()
});

// Test connection endpoint
router.post('/test-connection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connectionString } = req.body;
    
    if (!connectionString) {
      throw new CustomError('Connection string is required', 400);
    }

    const validation = validateConnectionString(connectionString);
    if (!validation.isValid) {
      throw new CustomError(validation.error || 'Invalid connection string', 400);
    }

    const result = await replicationService.testConnection(connectionString);
    
    res.json({
      success: true,
      message: 'Connection test successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Test stored connection endpoint
router.post('/test-stored-connection/:connectionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connectionId } = req.params;
    
    if (!connectionId) {
      throw new CustomError('Connection ID is required', 400);
    }

    const result = await replicationService.testStoredConnection(connectionId);
    
    res.json({
      success: true,
      message: 'Stored connection test successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Start replication endpoint
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connectionString, target, configScripts = [], settings = {} } = req.body;
    
    if (!connectionString) {
      throw new CustomError('Connection string is required', 400);
    }

    if (!target || !target.targetType) {
      throw new CustomError('Target configuration is required', 400);
    }

    const validation = validateConnectionString(connectionString);
    if (!validation.isValid) {
      throw new CustomError(validation.error || 'Invalid connection string', 400);
    }

    // Validate the complete replication config
    const configValidation = validateReplicationConfig({ connectionString, target, configScripts, settings });
    if (!configValidation.isValid) {
      throw new CustomError(configValidation.error || 'Invalid replication configuration', 400);
    }

    const jobId = await replicationService.startReplication({
      connectionString,
      target,
      configScripts,
      settings
    });
    
    res.json({
      success: true,
      message: 'Replication started',
      data: { jobId }
    });
  } catch (error) {
    next(error);
  }
});

// Start replication from stored configuration
router.post('/start-stored', validateRequest(storedReplicationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { configId } = req.body;
    
    const jobId = await replicationService.startStoredReplication({ configId });
    
    res.json({
      success: true,
      message: 'Stored replication started',
      data: { jobId }
    });
  } catch (error) {
    next(error);
  }
});

// Get replication status
router.get('/status/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    
    const status = await replicationService.getReplicationStatus(jobId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

// Cancel replication
router.post('/cancel/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    
    await replicationService.cancelReplication(jobId);
    
    res.json({
      success: true,
      message: 'Replication cancelled'
    });
  } catch (error) {
    next(error);
  }
});

// Start replication from configuration ID (new approach)
router.post('/start-from-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { configurationId } = req.body;
    
    if (!configurationId) {
      throw new CustomError('Configuration ID is required', 400);
    }

    const jobId = await replicationService.startReplicationFromConfigId(configurationId);
    
    res.json({
      success: true,
      message: 'Replication started from configuration',
      data: { jobId }
    });
  } catch (error) {
    next(error);
  }
});

export { router as replicationRoutes }; 