'use strict';

const createLogger = (name) => {
  const log4js = require('log4js');
  return log4js.getLogger(name);
};

module.exports = {logger: createLogger, createLogger};
