import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import { dataService, StoredConfiguration } from '../services/DataService';

const router = Router();

// Get all configurations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: dataService.getConfigurations()
    });
  } catch (error) {
    next(error);
  }
});

// Get configuration by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configuration = dataService.getConfiguration(req.params.id);
    if (!configuration) {
      throw new CustomError('Configuration not found', 404);
    }

    res.json({
      success: true,
      data: configuration
    });
  } catch (error) {
    next(error);
  }
});

// Create new configuration
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sourceConnectionId, targetConnectionId, createTargetDatabase, scriptIds } = req.body;

    if (!name || !sourceConnectionId || !targetConnectionId) {
      throw new CustomError('Name, source connection ID, and target connection ID are required', 400);
    }

    const configuration: StoredConfiguration = {
      id: uuidv4(),
      name,
      sourceConnectionId,
      targetConnectionId,
      createTargetDatabase: !!createTargetDatabase,
      scriptIds: scriptIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dataService.addConfiguration(configuration);

    logger.info('Configuration created', { 
      id: configuration.id, 
      name, 
      sourceConnectionId, 
      targetConnectionId,
      scriptCount: configuration.scriptIds.length
    });

    res.status(201).json({
      success: true,
      message: 'Configuration created successfully',
      data: configuration
    });
  } catch (error) {
    next(error);
  }
});

// Update configuration
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existingConfig = dataService.getConfiguration(req.params.id);
    if (!existingConfig) {
      throw new CustomError('Configuration not found', 404);
    }

    const { name, sourceConnectionId, targetConnectionId, createTargetDatabase, scriptIds } = req.body;

    const updates: Partial<StoredConfiguration> = {
      ...(name && { name }),
      ...(sourceConnectionId && { sourceConnectionId }),
      ...(targetConnectionId && { targetConnectionId }),
      ...(createTargetDatabase !== undefined && { createTargetDatabase }),
      ...(scriptIds !== undefined && { scriptIds }),
      updatedAt: new Date().toISOString()
    };

    const updatedConfig = dataService.updateConfiguration(req.params.id, updates);

    logger.info('Configuration updated', { id: req.params.id });

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    next(error);
  }
});

// Update last run time
router.patch('/:id/last-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedConfig = dataService.updateConfiguration(req.params.id, {
      lastRun: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    if (!updatedConfig) {
      throw new CustomError('Configuration not found', 404);
    }

    res.json({
      success: true,
      message: 'Last run time updated',
      data: updatedConfig
    });
  } catch (error) {
    next(error);
  }
});

// Delete configuration
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletedConfig = dataService.deleteConfiguration(req.params.id);
    if (!deletedConfig) {
      throw new CustomError('Configuration not found', 404);
    }

    logger.info('Configuration deleted', { id: req.params.id, name: deletedConfig.name });

    res.json({
      success: true,
      message: 'Configuration deleted successfully',
      data: deletedConfig
    });
  } catch (error) {
    next(error);
  }
});

export default router; 