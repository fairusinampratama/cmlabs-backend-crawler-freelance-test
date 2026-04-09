/**
 * Test HTTP Server
 * Serves crawled HTML files via HTTP for accurate screenshot testing
 * Fixes file:// protocol CSS rendering issues
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

class TestServer {
  constructor(options = {}) {
    this.port = options.port || 8888;
    this.outputDir = options.outputDir || path.join(__dirname, '..', '..', 'output');
    this.app = express();
    this.server = null;
  }

  /**
   * Start the HTTP server
   */
  async start() {
    // Serve static files from output directory
    this.app.use(express.static(this.outputDir, {
      // Set proper MIME types
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
      }
    }));

    // CORS headers for cross-origin resources
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // List available crawled files
    this.app.get('/list', (req, res) => {
      try {
        const files = fs.readdirSync(this.outputDir)
          .filter(f => f.endsWith('.html'))
          .map(f => ({
            name: f,
            url: `http://localhost:${this.port}/${f}`,
            size: fs.statSync(path.join(this.outputDir, f)).size
          }));
        res.json({ files, port: this.port });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Try to find an available port
    return new Promise((resolve, reject) => {
      const tryPort = (port) => {
        this.server = this.app.listen(port, () => {
          this.port = port;
          console.log(`✅ Test server running at http://localhost:${port}`);
          console.log(`📂 Serving files from: ${this.outputDir}`);
          resolve(port);
        });

        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${port} in use, trying ${port + 1}...`);
            tryPort(port + 1);
          } else {
            reject(err);
          }
        });
      };

      tryPort(this.port);
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('✅ Test server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get URL for a specific HTML file
   */
  getUrl(filename) {
    return `http://localhost:${this.port}/${filename}`;
  }

  /**
   * Wait for server to be ready with health check
   */
  async waitForReady(timeout = 10000) {
    const startTime = Date.now();
    const http = require('http');

    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Server failed to start within timeout'));
          return;
        }

        const req = http.get(`http://localhost:${this.port}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        });

        req.on('error', () => {
          setTimeout(check, 100);
        });
      };

      check();
    });
  }
}

// CLI execution
if (require.main === module) {
  const server = new TestServer();
  
  server.start().then((port) => {
    console.log(`\n🔗 Available URLs:`);
    console.log(`   Health check: http://localhost:${port}/health`);
    console.log(`   File list: http://localhost:${port}/list`);
    console.log(`\n📄 Individual files:`);
    
    const outputDir = path.join(__dirname, '..', '..', 'output');
    if (fs.existsSync(outputDir)) {
      fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.html'))
        .forEach(f => {
          console.log(`   http://localhost:${port}/${f}`);
        });
    }
    
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down test server...');
    server.stop().then(() => {
      process.exit(0);
    });
  });
}

module.exports = { TestServer };
