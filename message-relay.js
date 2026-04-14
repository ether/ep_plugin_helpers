'use strict';

const createMessageRelay = (config) => {
  const {incomingType, action, buildPayload} = config;

  const handleMessage = async (hookName, context) => {
    const {message: {type, data = {}} = {}} = context || {};
    if (type !== 'COLLABROOM' || data.type !== incomingType) return;

    const message = data;
    if (action && message.action !== action) return;

    const padMessageHandler = require('ep_etherpad-lite/node/handler/PadMessageHandler');
    const payload = await buildPayload(message);

    const msg = {
      type: 'COLLABROOM',
      data: {
        type: 'CUSTOM',
        payload,
      },
    };

    setTimeout(() => {
      padMessageHandler.handleCustomObjectMessage(msg, false, () => {});
    }, 500);

    return null;
  };

  return {handleMessage};
};

module.exports = {createMessageRelay};
