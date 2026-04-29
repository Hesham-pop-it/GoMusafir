// polyfills.js
import 'fast-text-encoding'; // Adds TextEncoder and TextDecoder globally

if (typeof global.DOMException === 'undefined') {
  const DOMExceptionPolyfill = function(message, name) {
    this.message = message;
    this.name = name || 'DOMException';
    this.stack = (new Error()).stack;
  };
  DOMExceptionPolyfill.prototype = Object.create(Error.prototype);
  DOMExceptionPolyfill.prototype.constructor = DOMExceptionPolyfill;
  global.DOMException = DOMExceptionPolyfill;
}