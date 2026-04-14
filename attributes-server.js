'use strict';

// Server-only export hooks for attributes. These require ep_etherpad-lite
// modules and must NOT be imported from client-side code.

const createLineAttributeExport = (config) => {
  const {attr, normalize, exportStyles} = config;

  const stylesForExport = () => exportStyles || '';

  const getLineHTMLForExport = async (hookName, context) => {
    const Changeset = require('ep_etherpad-lite/static/js/Changeset');
    let header = null;
    if (context.attribLine) {
      const opIter = Changeset.opIterator(context.attribLine);
      if (opIter.hasNext()) {
        const op = opIter.next();
        header = Changeset.opAttributeValue(op, attr, context.apool);
      }
    }
    if (header) {
      if (normalize) header = normalize(header);
      if (context.text.indexOf('*') === 0) {
        context.lineContent = context.lineContent.replace('*', '');
      }
      const paragraph = context.lineContent.match(/<p([^>]+)?>/);
      if (paragraph) {
        context.lineContent = context.lineContent.replace('<p', `<${header} `);
        context.lineContent = context.lineContent.replace('</p>', `</${header}>`);
      } else {
        context.lineContent = `<${header}>${context.lineContent}</${header}>`;
      }
      return context.lineContent;
    }
  };

  return {stylesForExport, getLineHTMLForExport};
};

const createInlineAttributeExport = (config) => {
  const {attr, exportCssFile, exportDataAttr} = config;

  const exportHtmlAdditionalTagsWithData = async (hookName, pad) => {
    const used = [];
    pad.pool.eachAttrib((key, value) => { if (key === attr) used.push(value); });
    return used.map((name) => [attr, name]);
  };

  const stylesForExport = exportCssFile
    ? async () => require('ep_etherpad-lite/node/eejs/').require(exportCssFile)
    : () => '';

  const getLineHTMLForExport = exportDataAttr
    ? async (hookName, context) => {
      const dataPattern = new RegExp(
        `${exportDataAttr}=["|']([0-9a-zA-Z]+)["|']`, 'gi'
      );
      context.lineContent = context.lineContent.replace(
        dataPattern, `class="${attr}:$1"`
      );
    }
    : undefined;

  const result = {exportHtmlAdditionalTagsWithData, stylesForExport};
  if (getLineHTMLForExport) result.getLineHTMLForExport = getLineHTMLForExport;
  return result;
};

const createTagAttributeExport = (config) => {
  const {tags, exportTransform} = config;

  const exportHtmlAdditionalTags = (hookName, pad, cb) => cb(tags);

  const getLineHTMLForExport = exportTransform
    ? async (hookName, context) => {
      let lineContent = context.lineContent;
      for (const tag of tags) {
        if (!lineContent) break;
        const transform = exportTransform(tag);
        lineContent = lineContent.replaceAll(`<${tag}`, transform.open);
        lineContent = lineContent.replaceAll(`</${tag}`, transform.close.replace(/>$/, ''));
      }
      context.lineContent = lineContent;
    }
    : undefined;

  const result = {exportHtmlAdditionalTags};
  if (getLineHTMLForExport) result.getLineHTMLForExport = getLineHTMLForExport;
  return result;
};

module.exports = {
  lineAttributeExport: createLineAttributeExport,
  inlineAttributeExport: createInlineAttributeExport,
  tagAttributeExport: createTagAttributeExport,
  // Keep old names as aliases for backwards compatibility
  createLineAttributeExport,
  createInlineAttributeExport,
  createTagAttributeExport,
};
