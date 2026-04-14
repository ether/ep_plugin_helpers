'use strict';

const createLogger = (name) => {
  const log4js = require('ep_etherpad-lite/node_modules/log4js');
  return log4js.getLogger(name);
};

module.exports = {createLogger};
