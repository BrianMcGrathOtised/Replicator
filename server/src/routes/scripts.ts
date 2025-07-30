import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import { dataService, SavedSqlScript } from '../services/DataService';

const router = Router();

// Get all scripts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: dataService.getScripts()
    });
  } catch (error) {
    next(error);
  }
});

// Get script by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const script = dataService.getScript(req.params.id);
    if (!script) {
      throw new CustomError('Script not found', 404);
    }

    res.json({
      success: true,
      data: script
    });
  } catch (error) {
    next(error);
  }
});

// Create new script
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, content, description } = req.body;

    if (!name || !content) {
      throw new CustomError('Name and content are required', 400);
    }

    const script: SavedSqlScript = {
      id: uuidv4(),
      name,
      content,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dataService.addScript(script);

    logger.info('Script created', { id: script.id, name, contentLength: content.length });

    res.status(201).json({
      success: true,
      message: 'Script created successfully',
      data: script
    });
  } catch (error) {
    next(error);
  }
});

// Update script
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existingScript = dataService.getScript(req.params.id);
    if (!existingScript) {
      throw new CustomError('Script not found', 404);
    }

    const { name, content, description } = req.body;

    const updates: Partial<SavedSqlScript> = {
      ...(name && { name }),
      ...(content && { content }),
      ...(description !== undefined && { description }),
      updatedAt: new Date().toISOString()
    };

    const updatedScript = dataService.updateScript(req.params.id, updates);

    logger.info('Script updated', { id: req.params.id });

    res.json({
      success: true,
      message: 'Script updated successfully',
      data: updatedScript
    });
  } catch (error) {
    next(error);
  }
});

// Delete script
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletedScript = dataService.deleteScript(req.params.id);
    if (!deletedScript) {
      throw new CustomError('Script not found', 404);
    }

    logger.info('Script deleted', { id: req.params.id, name: deletedScript.name });

    res.json({
      success: true,
      message: 'Script deleted successfully',
      data: deletedScript
    });
  } catch (error) {
    next(error);
  }
});

export default router; 