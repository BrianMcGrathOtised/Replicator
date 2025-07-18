import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middleware/errorHandler';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return next(new CustomError(`Validation error: ${errorMessage}`, 400));
    }
    
    next();
  };
}

export function validateConnectionString(connectionString: string): ValidationResult {
  try {
    // Basic validation for SQL Server connection string format
    if (!connectionString || typeof connectionString !== 'string') {
      return {
        isValid: false,
        error: 'Connection string must be a non-empty string'
      };
    }

    // Check for basic SQL Server connection string patterns
    const hasServer = /(?:server|data source|addr)\s*=/i.test(connectionString);
    const hasDatabase = /(?:database|initial catalog)\s*=/i.test(connectionString);
    
    if (!hasServer) {
      return {
        isValid: false,
        error: 'Connection string must include server/data source'
      };
    }

    // Database is optional for some scenarios (master db connection)
    
    return {
      isValid: true
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid connection string format'
    };
  }
}

export const replicationConfigSchema = Joi.object({
  connectionString: Joi.string().required(),
  target: Joi.object({
    targetType: Joi.string().valid('sqlserver').required(),
    connectionString: Joi.string().required(),
    overwriteExisting: Joi.boolean().optional(),
    backupBefore: Joi.boolean().optional(),
    createNewDatabase: Joi.boolean().optional()
  }).required(),
  configScripts: Joi.array().items(Joi.string()).default([]),
  settings: Joi.object({
    includeData: Joi.boolean().optional(),
    includeSchema: Joi.boolean().optional()
  }).optional()
});

export function validateReplicationConfig(config: any): ValidationResult {
  const { error } = replicationConfigSchema.validate(config);
  
  if (error) {
    return {
      isValid: false,
      error: error.details[0].message
    };
  }
  
  return {
    isValid: true
  };
} 