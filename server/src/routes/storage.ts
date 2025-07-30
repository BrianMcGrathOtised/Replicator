import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { secureStorageService } from '../services/SecureStorageService';
import { validateRequest } from '../utils/validation';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const createConnectionSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  server: Joi.string().min(1).required(),
  username: Joi.string().min(1).required(),
  password: Joi.string().min(1).required(),
  database: Joi.string().min(1).required(),
  port: Joi.number().integer().min(1).max(65535).optional(),
  serverType: Joi.string().valid('sqlserver', 'azure-sql').required()
});

const updateConnectionSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  server: Joi.string().min(1).optional(),
  username: Joi.string().min(1).optional(),
  password: Joi.string().min(1).optional(),
  database: Joi.string().min(1).optional(),
  port: Joi.number().integer().min(1).max(65535).optional(),
  serverType: Joi.string().valid('sqlserver', 'azure-sql').optional()
});

const createScriptSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  content: Joi.string().min(1).required(),
  language: Joi.string().valid('sql', 'javascript', 'typescript').required(),
  tags: Joi.array().items(Joi.string().max(50)).optional()
});

const updateScriptSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  content: Joi.string().min(1).optional(),
  language: Joi.string().valid('sql', 'javascript', 'typescript').optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional()
});

const createTargetSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  targetType: Joi.string().valid('sqlite', 'sqlserver').required(),
  configuration: Joi.object({
    filePath: Joi.string().optional(),
    connectionId: Joi.string().uuid().optional(),
    overwriteExisting: Joi.boolean().optional(),
    backupBefore: Joi.boolean().optional()
  }).required()
});

const updateTargetSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  targetType: Joi.string().valid('sqlite', 'sqlserver').optional(),
  configuration: Joi.object({
    filePath: Joi.string().optional(),
    connectionId: Joi.string().uuid().optional(),
    overwriteExisting: Joi.boolean().optional(),
    backupBefore: Joi.boolean().optional()
  }).optional()
});

const createReplicationConfigSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  sourceConnectionId: Joi.string().uuid().required(),
  targetId: Joi.string().uuid().required(),
  configScriptIds: Joi.array().items(Joi.string().uuid()).required(),
  settings: Joi.object({
    includeTables: Joi.array().items(Joi.string()).optional(),
    excludeTables: Joi.array().items(Joi.string()).optional(),
    includeData: Joi.boolean().optional(),
    includeSchema: Joi.boolean().optional(),
    batchSize: Joi.number().integer().min(1).max(10000).optional()
  }).required()
});

// Connection routes
router.post('/connections', validateRequest(createConnectionSchema), async (req: Request, res: Response) => {
  try {
    const connection = await secureStorageService.createConnection(req.body);
    logger.info('Connection created via API', { id: connection.id, name: connection.name });
    res.status(201).json(connection);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create connection via API', { error: errorMessage });
    throw error;
  }
});

router.get('/connections', async (req: Request, res: Response) => {
  try {
    const connections = await secureStorageService.getConnections();
    res.json(connections);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get connections via API', { error: errorMessage });
    throw error;
  }
});

router.get('/connections/:id', async (req: Request, res: Response) => {
  try {
    const connection = await secureStorageService.getConnection(req.params.id);
    res.json(connection);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get connection via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.put('/connections/:id', validateRequest(updateConnectionSchema), async (req: Request, res: Response) => {
  try {
    const connection = await secureStorageService.updateConnection(req.params.id, req.body);
    logger.info('Connection updated via API', { id: req.params.id });
    res.json(connection);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update connection via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.delete('/connections/:id', async (req: Request, res: Response) => {
  try {
    await secureStorageService.deleteConnection(req.params.id);
    logger.info('Connection deleted via API', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete connection via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

// Get connection string for a specific connection
router.get('/connections/:id/connection-string', async (req: Request, res: Response) => {
  try {
    const connectionString = await secureStorageService.getConnectionString(req.params.id);
    res.type('text/plain').send(connectionString);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get connection string via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

// Script routes
router.post('/scripts', validateRequest(createScriptSchema), async (req: Request, res: Response) => {
  try {
    const script = await secureStorageService.createScript(req.body);
    logger.info('Script created via API', { id: script.id, name: script.name });
    res.status(201).json(script);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create script via API', { error: errorMessage });
    throw error;
  }
});

router.get('/scripts', async (req: Request, res: Response) => {
  try {
    const scripts = await secureStorageService.getScripts();
    res.json(scripts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get scripts via API', { error: errorMessage });
    throw error;
  }
});

router.get('/scripts/:id', async (req: Request, res: Response) => {
  try {
    const script = await secureStorageService.getScript(req.params.id);
    res.json(script);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get script via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.put('/scripts/:id', validateRequest(updateScriptSchema), async (req: Request, res: Response) => {
  try {
    const script = await secureStorageService.updateScript(req.params.id, req.body);
    logger.info('Script updated via API', { id: req.params.id });
    res.json(script);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update script via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.delete('/scripts/:id', async (req: Request, res: Response) => {
  try {
    await secureStorageService.deleteScript(req.params.id);
    logger.info('Script deleted via API', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete script via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

// Target routes
router.post('/targets', validateRequest(createTargetSchema), async (req: Request, res: Response) => {
  try {
    const target = await secureStorageService.createTarget(req.body);
    logger.info('Target created via API', { id: target.id, name: target.name });
    res.status(201).json(target);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create target via API', { error: errorMessage });
    throw error;
  }
});

router.get('/targets', async (req: Request, res: Response) => {
  try {
    const targets = await secureStorageService.getTargets();
    res.json(targets);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get targets via API', { error: errorMessage });
    throw error;
  }
});

router.get('/targets/:id', async (req: Request, res: Response) => {
  try {
    const target = await secureStorageService.getTarget(req.params.id);
    res.json(target);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get target via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.put('/targets/:id', validateRequest(updateTargetSchema), async (req: Request, res: Response) => {
  try {
    const target = await secureStorageService.updateTarget(req.params.id, req.body);
    logger.info('Target updated via API', { id: req.params.id });
    res.json(target);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update target via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.delete('/targets/:id', async (req: Request, res: Response) => {
  try {
    await secureStorageService.deleteTarget(req.params.id);
    logger.info('Target deleted via API', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete target via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

// Replication config routes
router.post('/replication-configs', validateRequest(createReplicationConfigSchema), async (req: Request, res: Response) => {
  try {
    const config = await secureStorageService.createReplicationConfig(req.body);
    logger.info('Replication config created via API', { id: config.id, name: config.name });
    res.status(201).json(config);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create replication config via API', { error: errorMessage });
    throw error;
  }
});

router.get('/replication-configs', async (req: Request, res: Response) => {
  try {
    const configs = await secureStorageService.getReplicationConfigs();
    res.json(configs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get replication configs via API', { error: errorMessage });
    throw error;
  }
});

router.get('/replication-configs/:id', async (req: Request, res: Response) => {
  try {
    const config = await secureStorageService.getReplicationConfig(req.params.id);
    res.json(config);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get replication config via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.put('/replication-configs/:id', validateRequest(createReplicationConfigSchema), async (req: Request, res: Response) => {
  try {
    const config = await secureStorageService.updateReplicationConfig(req.params.id, req.body);
    logger.info('Replication config updated via API', { id: req.params.id });
    res.json(config);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update replication config via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

router.delete('/replication-configs/:id', async (req: Request, res: Response) => {
  try {
    await secureStorageService.deleteReplicationConfig(req.params.id);
    logger.info('Replication config deleted via API', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete replication config via API', { error: errorMessage, id: req.params.id });
    throw error;
  }
});

export default router; 