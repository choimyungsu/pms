const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const sanitizeHtml = (html) => {
  return DOMPurify.sanitize(html);
};

module.exports = sanitizeHtml;
