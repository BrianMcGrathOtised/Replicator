import log from 'electron-log';

// Configure electron-log for main process
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

export const logger = {
  info: (message: string, meta?: any) => {
    if (meta) {
      log.info(message, meta);
    } else {
      log.info(message);
    }
  },
  
  error: (message: string, meta?: any) => {
    if (meta) {
      log.error(message, meta);
    } else {
      log.error(message);
    }
  },
  
  warn: (message: string, meta?: any) => {
    if (meta) {
      log.warn(message, meta);
    } else {
      log.warn(message);
    }
  },
  
  debug: (message: string, meta?: any) => {
    if (meta) {
      log.debug(message, meta);
    } else {
      log.debug(message);
    }
  }
};