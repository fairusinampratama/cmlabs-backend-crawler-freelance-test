/**
 * Resource Downloader Module
 * Downloads CSS, JS, images, and fonts from detected URLs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class ResourceDownloader {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.downloadedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
    
    // Create asset directories
    this.dirs = {
      css: path.join(outputDir, 'assets', 'css'),
      js: path.join(outputDir, 'assets', 'js'),
      images: path.join(outputDir, 'assets', 'images'),
      fonts: path.join(outputDir, 'assets', 'fonts'),
      media: path.join(outputDir, 'assets', 'media'),
      other: path.join(outputDir, 'assets', 'other')
    };
  }

  /**
   * Initialize directory structure
   */
  async init() {
    for (const dir of Object.values(this.dirs)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Download all resources from detection result
   */
  async downloadAll(resources) {
    await this.init();
    
    const allResources = [
      ...resources.css,
      ...resources.js,
      ...resources.images,
      ...resources.fonts,
      ...resources.media,
      ...resources.other
    ];

    console.log(`\n📥 Downloading ${allResources.length} resources...\n`);

    // Download in batches of 5 to avoid overwhelming servers
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < allResources.length; i += batchSize) {
      const batch = allResources.slice(i, i + batchSize);
      const batchPromises = batch.map(r => this.downloadResource(r));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Progress indicator
      const progress = Math.min((i + batchSize) / allResources.length * 100, 100).toFixed(0);
      process.stdout.write(`\r   Progress: ${progress}% (${this.downloadedCount} downloaded, ${this.failedCount} failed)`);
    }

    console.log('\n');

    return {
      downloaded: this.downloadedCount,
      failed: this.failedCount,
      skipped: this.skippedCount,
      results: results.filter(r => r !== null)
    };
  }

  /**
   * Download a single resource
   */
  async downloadResource(resource) {
    if (!resource.resolvedUrl) {
      this.skippedCount++;
      return null;
    }

    try {
      const url = new URL(resource.resolvedUrl);
      const fileName = this.sanitizeFileName(resource);
      const outputPath = path.join(this.dirs[resource.category], fileName);

      // Skip if already exists
      if (fs.existsSync(outputPath)) {
        return {
          originalUrl: resource.originalUrl,
          resolvedUrl: resource.resolvedUrl,
          localPath: `./assets/${resource.category}/${fileName}`,
          fullPath: outputPath,
          status: 'exists',
          category: resource.category
        };
      }

      const fileData = await this.fetchFile(url);
      
      if (fileData) {
        fs.writeFileSync(outputPath, fileData);
        this.downloadedCount++;
        
        return {
          originalUrl: resource.originalUrl,
          resolvedUrl: resource.resolvedUrl,
          localPath: `./assets/${resource.category}/${fileName}`,
          fullPath: outputPath,
          status: 'downloaded',
          category: resource.category,
          size: fileData.length
        };
      } else {
        this.failedCount++;
        return {
          originalUrl: resource.originalUrl,
          resolvedUrl: resource.resolvedUrl,
          status: 'failed',
          category: resource.category
        };
      }
    } catch (error) {
      this.failedCount++;
      console.error(`\n   ❌ Failed: ${resource.resolvedUrl} - ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch file from URL
   */
  fetchFile(urlObj) {
    return new Promise((resolve, reject) => {
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000 // 10 second timeout
      };

      const request = protocol.request(options, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, urlObj.href);
          this.fetchFile(redirectUrl).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      });

      request.on('error', () => resolve(null));
      request.on('timeout', () => {
        request.destroy();
        resolve(null);
      });

      request.end();
    });
  }

  /**
   * Generate safe file name from URL
   */
  sanitizeFileName(resource) {
    const url = resource.resolvedUrl;
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Remove leading slash and get file name
    pathname = pathname.replace(/^\//, '');
    
    // Replace path separators with underscores
    let fileName = pathname.replace(/\//g, '_');
    
    // Remove query parameters and hash
    fileName = fileName.split('?')[0].split('#')[0];
    
    // If no extension, add one based on category
    if (!fileName.includes('.')) {
      const extensions = {
        css: '.css',
        js: '.js',
        images: '.png',
        fonts: '.woff2',
        media: '.mp4',
        other: '.bin'
      };
      fileName += extensions[resource.category] || '.bin';
    }
    
    // Limit length
    if (fileName.length > 100) {
      const ext = path.extname(fileName);
      fileName = fileName.substring(0, 95) + ext;
    }
    
    // Ensure unique name
    if (fs.existsSync(path.join(this.dirs[resource.category], fileName))) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      fileName = `${base}_${Date.now()}${ext}`;
    }
    
    return fileName;
  }

  /**
   * Get total size of downloaded assets
   */
  getTotalSize() {
    let totalSize = 0;
    
    for (const dir of Object.values(this.dirs)) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const stats = fs.statSync(path.join(dir, file));
          totalSize += stats.size;
        }
      }
    }
    
    return totalSize;
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = ResourceDownloader;

// CLI test
if (require.main === module) {
  const ResourceDetector = require('./resource-detector');
  
  const OUTPUT_DIR = path.join(__dirname, 'output');
  
  const testFiles = [
    { file: 'cmlabs.html', url: 'https://cmlabs.co', name: 'cmlabs' },
    { file: 'sequence.html', url: 'https://sequence.day', name: 'sequence' },
    { file: 'free_choice.html', url: 'https://react.dev', name: 'react' }
  ];

  async function runTest() {
    const detector = new ResourceDetector();

    for (const test of testFiles) {
      const filePath = path.join(OUTPUT_DIR, test.file);
      const siteOutputDir = path.join(OUTPUT_DIR, test.name);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ ${test.file}: File not found`);
        continue;
      }

      console.log(`\n🌐 Processing: ${test.name}`);
      console.log('=' .repeat(50));

      const html = fs.readFileSync(filePath, 'utf-8');
      const resources = detector.detect(html, test.url);

      const downloader = new ResourceDownloader(siteOutputDir);
      const result = await downloader.downloadAll(resources);

      const totalSize = downloader.formatBytes(downloader.getTotalSize());
      
      console.log(`✅ Downloaded: ${result.downloaded}`);
      console.log(`❌ Failed: ${result.failed}`);
      console.log(`⏭️  Skipped: ${result.skipped}`);
      console.log(`💾 Total size: ${totalSize}`);
    }
  }

  runTest().catch(console.error);
}
