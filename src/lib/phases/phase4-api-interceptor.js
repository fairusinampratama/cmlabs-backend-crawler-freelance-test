/**
 * API Interceptor - Phase 4
 * Captures and mocks API responses for dynamic content
 */

class APIInterceptor {
  constructor(options = {}) {
    this.options = {
      interceptXHR: options.interceptXHR !== false,
      interceptFetch: options.interceptFetch !== false,
      saveResponses: options.saveResponses !== false,
      injectMocks: options.injectMocks !== false,
      maxResponseSize: options.maxResponseSize || 1048576 // 1MB
    };
    this.capturedResponses = new Map();
  }

  /**
   * Get interception script for page
   */
  getInterceptionScript() {
    return `
      (function() {
        window.__API_CAPTURES__ = {};
        
        // Intercept Fetch API
        if (${this.options.interceptFetch} && window.fetch) {
          const originalFetch = window.fetch;
          window.fetch = async function(url, options) {
            const key = url + JSON.stringify(options || {});
            
            try {
              const response = await originalFetch.apply(this, arguments);
              
              // Clone response to capture
              const clone = response.clone();
              const body = await clone.text();
              
              window.__API_CAPTURES__[key] = {
                url: url,
                status: response.status,
                headers: Object.fromEntries(response.headers),
                body: body,
                timestamp: Date.now()
              };
              
              return response;
            } catch (error) {
              window.__API_CAPTURES__[key] = {
                url: url,
                error: error.message,
                timestamp: Date.now()
              };
              throw error;
            }
          };
        }
        
        // Intercept XMLHttpRequest
        if (${this.options.interceptXHR}) {
          const OriginalXHR = window.XMLHttpRequest;
          
          window.XMLHttpRequest = function() {
            const xhr = new OriginalXHR();
            const originalSend = xhr.send.bind(xhr);
            let requestUrl = '';
            
            // Capture open() to get URL
            const originalOpen = xhr.open.bind(xhr);
            xhr.open = function(method, url) {
              requestUrl = url;
              return originalOpen.apply(this, arguments);
            };
            
            xhr.send = function(body) {
              const key = requestUrl + (body || '');
              
              xhr.addEventListener('load', function() {
                try {
                  window.__API_CAPTURES__[key] = {
                    url: requestUrl,
                    status: xhr.status,
                    response: xhr.responseText,
                    timestamp: Date.now()
                  };
                } catch (e) {}
              });
              
              return originalSend.apply(this, arguments);
            };
            
            return xhr;
          };
        }
      })();
    `;
  }

  /**
   * Get mock injection script
   */
  getMockInjectionScript(captures) {
    return `
      (function() {
        window.__API_MOCKS__ = ${JSON.stringify(captures)};
        
        // Override fetch to use mocks
        const originalFetch = window.fetch;
        window.fetch = async function(url, options) {
          const key = url + JSON.stringify(options || {});
          
          if (window.__API_MOCKS__[key]) {
            const mock = window.__API_MOCKS__[key];
            
            if (mock.error) {
              throw new Error(mock.error);
            }
            
            // Create mock Response
            return new Response(mock.body || mock.response, {
              status: mock.status || 200,
              headers: mock.headers || {}
            });
          }
          
          // Fall back to original for uncaptured requests
          return originalFetch.apply(this, arguments);
        };
        
        // Override XHR to use mocks
        const OriginalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
          const xhr = new OriginalXHR();
          let requestUrl = '';
          
          const originalOpen = xhr.open.bind(xhr);
          xhr.open = function(method, url) {
            requestUrl = url;
            return originalOpen.apply(this, arguments);
          };
          
          const originalSend = xhr.send.bind(xhr);
          xhr.send = function(body) {
            const key = requestUrl + (body || '');
            const mock = window.__API_MOCKS__[key];
            
            if (mock && !mock.error) {
              // Simulate successful XHR with mock data
              Object.defineProperty(xhr, 'status', { value: mock.status || 200 });
              Object.defineProperty(xhr, 'responseText', { value: mock.body || mock.response || '' });
              Object.defineProperty(xhr, 'readyState', { value: 4 });
              
              setTimeout(() => {
                xhr.dispatchEvent(new Event('load'));
                xhr.dispatchEvent(new Event('loadend'));
              }, 0);
              
              return;
            }
            
            return originalSend.apply(this, arguments);
          };
          
          return xhr;
        };
      })();
    `;
  }

  /**
   * Setup interception on page
   */
  async setupInterception(page) {
    await page.addInitScript(this.getInterceptionScript());
  }

  /**
   * Capture responses from page
   */
  async captureResponses(page) {
    const captures = await page.evaluate(() => window.__API_CAPTURES__ || {});
    
    // Merge with existing captures
    Object.entries(captures).forEach(([key, value]) => {
      if (!this.capturedResponses.has(key)) {
        this.capturedResponses.set(key, value);
      }
    });
    
    return captures;
  }

  /**
   * Inject mocks into page
   */
  async injectMocks(page) {
    if (this.capturedResponses.size === 0) return;
    
    const captures = Object.fromEntries(this.capturedResponses);
    await page.addInitScript(this.getMockInjectionScript(captures));
  }

  /**
   * Get all captured responses
   */
  getCaptures() {
    return Object.fromEntries(this.capturedResponses);
  }

  /**
   * Save captures to file
   */
  saveToFile(filename) {
    const fs = require('fs');
    const captures = this.getCaptures();
    fs.writeFileSync(filename, JSON.stringify(captures, null, 2));
  }

  /**
   * Load captures from file
   */
  loadFromFile(filename) {
    const fs = require('fs');
    if (fs.existsSync(filename)) {
      const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
      this.capturedResponses = new Map(Object.entries(data));
    }
  }

  /**
   * Reset captures
   */
  reset() {
    this.capturedResponses.clear();
  }
}

module.exports = { APIInterceptor };
