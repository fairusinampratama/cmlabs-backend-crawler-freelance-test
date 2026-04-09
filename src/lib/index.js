/**
 * Lib Index - Export all visual accuracy modules
 */

const { ResourceInliner } = require('./resource-inliner');
const { LazyLoadFixer } = require('./lazy-load-fixer');
const { SPAPolyfills } = require('./spa-polyfills');
const { APIInterceptor } = require('./api-interceptor');
const { ContentFreezer } = require('./content-freezer');

module.exports = {
  ResourceInliner,
  LazyLoadFixer,
  SPAPolyfills,
  APIInterceptor,
  ContentFreezer
};
