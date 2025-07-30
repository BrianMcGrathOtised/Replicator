import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';
import { validateConnectionString } from '../utils/validation';
import { dataService, SavedConnection } from '../services/DataService';

const router = Router();

// Get all connections
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: dataService.getConnections()
    });
  } catch (error) {
    next(error);
  }
});

// Get connection by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connection = dataService.getConnection(req.params.id);
    if (!connection) {
      throw new CustomError('Connection not found', 404);
    }

    res.json({
      success: true,
      data: connection
    });
  } catch (error) {
    next(error);
  }
});

// Create new connection
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, connectionString, description, isTargetDatabase } = req.body;

    if (!name || !connectionString) {
      throw new CustomError('Name and connection string are required', 400);
    }

    // Validate connection string
    const validation = validateConnectionString(connectionString);
    if (!validation.isValid) {
      throw new CustomError(validation.error || 'Invalid connection string', 400);
    }

    // Extract database name
    const dbNameMatch = connectionString.match(/(?:database|initial catalog)=([^;]+)/i);
    const databaseName = dbNameMatch ? dbNameMatch[1] : 'Unknown';

    const isAzure = connectionString.toLowerCase().includes('.database.windows.net');

    const connection: SavedConnection = {
      id: uuidv4(),
      name,
      connectionString,
      isAzure,
      isTargetDatabase: !!isTargetDatabase,
      databaseName,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    dataService.addConnection(connection);

    logger.info('Connection created', { id: connection.id, name, isAzure, isTargetDatabase });

    res.status(201).json({
      success: true,
      message: 'Connection created successfully',
      data: connection
    });
  } catch (error) {
    next(error);
  }
});

// Update connection
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existingConnection = dataService.getConnection(req.params.id);
    if (!existingConnection) {
      throw new CustomError('Connection not found', 404);
    }

    const { name, connectionString, description, isTargetDatabase } = req.body;

    if (connectionString) {
      const validation = validateConnectionString(connectionString);
      if (!validation.isValid) {
        throw new CustomError(validation.error || 'Invalid connection string', 400);
      }
    }

    const updates: Partial<SavedConnection> = {
      ...(name && { name }),
      ...(connectionString && { 
        connectionString,
        databaseName: connectionString.match(/(?:database|initial catalog)=([^;]+)/i)?.[1] || 'Unknown',
        isAzure: connectionString.toLowerCase().includes('.database.windows.net')
      }),
      ...(description !== undefined && { description }),
      ...(isTargetDatabase !== undefined && { isTargetDatabase }),
      updatedAt: new Date().toISOString()
    };

    const updatedConnection = dataService.updateConnection(req.params.id, updates);

    logger.info('Connection updated', { id: req.params.id });

    res.json({
      success: true,
      message: 'Connection updated successfully',
      data: updatedConnection
    });
  } catch (error) {
    next(error);
  }
});

// Delete connection
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletedConnection = dataService.deleteConnection(req.params.id);
    if (!deletedConnection) {
      throw new CustomError('Connection not found', 404);
    }

    logger.info('Connection deleted', { id: req.params.id, name: deletedConnection.name });

    res.json({
      success: true,
      message: 'Connection deleted successfully',
      data: deletedConnection
    });
  } catch (error) {
    next(error);
  }
});

export default router; 