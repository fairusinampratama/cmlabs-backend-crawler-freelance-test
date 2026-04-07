/**
 * HTML URL Rewriter Module
 * Rewrites external URLs in HTML to point to local downloaded resources
 */

const fs = require('fs');
const path = require('path');

class HTMLRewriter {
  constructor(siteOutputDir) {
    this.siteOutputDir = siteOutputDir;
    this.urlMap = new Map(); // Maps original URLs to local paths
  }

  /**
   * Load URL mappings from downloaded resources
   */
  loadUrlMap(downloadResults) {
    for (const result of downloadResults) {
      if (result.status === 'downloaded' || result.status === 'exists') {
        this.urlMap.set(result.originalUrl, result.localPath);
        this.urlMap.set(result.resolvedUrl, result.localPath);
        
        // Also map URL without query params
        const urlWithoutQuery = result.resolvedUrl.split('?')[0];
        this.urlMap.set(urlWithoutQuery, result.localPath);
      }
    }
  }

  /**
   * Main rewrite method - transforms all URLs in HTML
   */
  rewrite(html, baseUrl) {
    let rewritten = html;

    // Rewrite CSS links
    rewritten = this.rewriteCssLinks(rewritten);

    // Rewrite JS scripts
    rewritten = this.rewriteJsScripts(rewritten);

    // Rewrite image sources
    rewritten = this.rewriteImageSources(rewritten);

    // Rewrite srcset attributes
    rewritten = this.rewriteSrcset(rewritten);

    // Rewrite inline styles
    rewritten = this.rewriteInlineStyles(rewritten, baseUrl);

    // Rewrite preload links
    rewritten = this.rewritePreloadLinks(rewritten);

    // Rewrite video sources
    rewritten = this.rewriteVideoSources(rewritten);

    // Add base tag if not present (helps with relative URLs)
    rewritten = this.addBaseTag(rewritten, baseUrl);

    return rewritten;
  }

  /**
   * Rewrite CSS link tags
   */
  rewriteCssLinks(html) {
    const regex = /<link([^>]*)rel=["']stylesheet["']([^>]*)href=["']([^"']+)["']([^>]*)>/gi;
    
    return html.replace(regex, (match, before, middle, url, after) => {
      const localPath = this.findLocalPath(url);
      if (localPath) {
        return `<link${before}rel="stylesheet"${middle}href="${localPath}"${after}>`;
      }
      return match;
    });
  }

  /**
   * Rewrite preload link tags
   */
  rewritePreloadLinks(html) {
    // Preload CSS
    let result = html.replace(
      /<link([^>]*)rel=["']preload["']([^>]*)as=["']style["']([^>]*)href=["']([^"']+)["']([^>]*)>/gi,
      (match, before, middle1, middle2, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<link${before}rel="preload"${middle1}as="style"${middle2}href="${localPath}"${after}>`;
        }
        return match;
      }
    );

    // Preload JS
    result = result.replace(
      /<link([^>]*)rel=["']preload["']([^>]*)as=["']script["']([^>]*)href=["']([^"']+)["']([^>]*)>/gi,
      (match, before, middle1, middle2, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<link${before}rel="preload"${middle1}as="script"${middle2}href="${localPath}"${after}>`;
        }
        return match;
      }
    );

    return result;
  }

  /**
   * Rewrite script src attributes
   */
  rewriteJsScripts(html) {
    const regex = /<script([^>]*)src=["']([^"']+)["']([^>]*)>/gi;
    
    return html.replace(regex, (match, before, url, after) => {
      const localPath = this.findLocalPath(url);
      if (localPath) {
        return `<script${before}src="${localPath}"${after}>`;
      }
      return match;
    });
  }

  /**
   * Rewrite image src attributes
   */
  rewriteImageSources(html) {
    // Standard img tags
    let result = html.replace(
      /<img([^>]*)src=["']([^"']+)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<img${before}src="${localPath}"${after}>`;
        }
        return match;
      }
    );

    // Image srcset
    result = result.replace(
      /<img([^>]*)srcset=["']([^"']+)["']([^>]*)>/gi,
      (match, before, srcset, after) => {
        const rewrittenSrcset = this.rewriteSrcsetValue(srcset);
        return `<img${before}srcset="${rewrittenSrcset}"${after}>`;
      }
    );

    return result;
  }

  /**
   * Rewrite srcset attribute values
   */
  rewriteSrcsetValue(srcset) {
    // Format: "url1 1x, url2 2x, url3 3x"
    const parts = srcset.split(',').map(part => {
      const [url, descriptor] = part.trim().split(/\s+/);
      const localPath = this.findLocalPath(url);
      if (localPath) {
        return descriptor ? `${localPath} ${descriptor}` : localPath;
      }
      return part.trim();
    });

    return parts.join(', ');
  }

  /**
   * Rewrite srcset attributes in HTML
   */
  rewriteSrcset(html) {
    const regex = /srcset=["']([^"']+)["']/gi;
    
    return html.replace(regex, (match, srcset) => {
      const rewritten = this.rewriteSrcsetValue(srcset);
      return `srcset="${rewritten}"`;
    });
  }

  /**
   * Rewrite URLs in inline style attributes
   */
  rewriteInlineStyles(html, baseUrl) {
    const styleRegex = /style=["']([^"']*)["']/gi;
    const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;

    return html.replace(styleRegex, (match, style) => {
      let rewrittenStyle = style;
      let urlMatch;

      while ((urlMatch = urlRegex.exec(style)) !== null) {
        const originalUrl = urlMatch[1];
        const localPath = this.findLocalPath(originalUrl);
        
        if (localPath) {
          rewrittenStyle = rewrittenStyle.replace(
            `url(${urlMatch[0].includes('"') ? '"' + originalUrl + '"' : originalUrl})`,
            `url("${localPath}")`
          );
        }
      }

      return `style="${rewrittenStyle}"`;
    });
  }

  /**
   * Rewrite video sources
   */
  rewriteVideoSources(html) {
    // Video src
    let result = html.replace(
      /<video([^>]*)src=["']([^"']+)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<video${before}src="${localPath}"${after}>`;
        }
        return match;
      }
    );

    // Video poster
    result = result.replace(
      /<video([^>]*)poster=["']([^"']+)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<video${before}poster="${localPath}"${after}>`;
        }
        return match;
      }
    );

    // Source tags within video
    result = result.replace(
      /<source([^>]*)src=["']([^"']+)["']([^>]*)>/gi,
      (match, before, url, after) => {
        const localPath = this.findLocalPath(url);
        if (localPath) {
          return `<source${before}src="${localPath}"${after}>`;
        }
        return match;
      }
    );

    return result;
  }

  /**
   * Find local path for a URL
   */
  findLocalPath(url) {
    if (!url) return null;

    // Check direct match
    if (this.urlMap.has(url)) {
      return this.urlMap.get(url);
    }

    // Check without query params
    const urlWithoutQuery = url.split('?')[0];
    if (this.urlMap.has(urlWithoutQuery)) {
      return this.urlMap.get(urlWithoutQuery);
    }

    // Check if any key ends with the path
    for (const [key, value] of this.urlMap) {
      if (key.endsWith(url) || url.endsWith(key.split('/').pop())) {
        return value;
      }
    }

    return null;
  }

  /**
   * Add base tag to HTML head for relative URLs
   */
  addBaseTag(html, baseUrl) {
    // If base tag already exists, don't add another
    if (/<base[^>]*href=/i.test(html)) {
      return html;
    }

    const urlObj = new URL(baseUrl);
    const baseHref = `${urlObj.protocol}//${urlObj.host}/`;

    // Insert base tag after <head>
    return html.replace(/<head>/i, `<head>\n  <base href="${baseHref}">`);
  }

  /**
   * Rewrite CSS content (for CSS @import statements)
   */
  rewriteCssContent(cssContent, baseUrl) {
    // Rewrite @import url() statements
    const importRegex = /@import\s+url\(["']?([^"')]+)["']?\)/gi;

    return cssContent.replace(importRegex, (match, url) => {
      const localPath = this.findLocalPath(url);
      if (localPath) {
        return `@import url("${localPath}");`;
      }
      return match;
    });
  }

  /**
   * Save rewritten HTML to file
   */
  saveRewrittenHtml(html, filename = 'index.html') {
    const outputPath = path.join(this.siteOutputDir, filename);
    fs.writeFileSync(outputPath, html, 'utf-8');
    return outputPath;
  }
}

module.exports = HTMLRewriter;

// CLI test
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ResourceDetector = require('./resource-detector');
  const ResourceDownloader = require('./resource-downloader');

  const OUTPUT_DIR = path.join(__dirname, 'output');
  
  const testSite = {
    file: 'sequence.html',
    url: 'https://sequence.day',
    name: 'sequence'
  };

  async function test() {
    console.log('🔄 HTML URL Rewriter Test\n');
    
    const siteOutputDir = path.join(OUTPUT_DIR, testSite.name);
    const htmlPath = path.join(OUTPUT_DIR, testSite.file);
    
    if (!fs.existsSync(siteOutputDir)) {
      console.log('❌ Run resource-downloader first to download assets');
      return;
    }

    // Load HTML
    let html = fs.readFileSync(htmlPath, 'utf-8');
    
    // Detect resources
    const detector = new ResourceDetector();
    const resources = detector.detect(html, testSite.url);
    
    // Create dummy download results from existing files
    const downloadResults = [];
    const assetsDir = path.join(siteOutputDir, 'assets');
    
    for (const [category, items] of Object.entries(resources)) {
      if (category === 'summary' || category === 'baseUrl') continue;
      
      for (const item of items) {
        const categoryDir = path.join(assetsDir, category);
        if (fs.existsSync(categoryDir)) {
          const files = fs.readdirSync(categoryDir);
          const matchingFile = files.find(f => item.resolvedUrl.includes(f.replace(/_/g, '/')));
          
          if (matchingFile) {
            downloadResults.push({
              originalUrl: item.originalUrl,
              resolvedUrl: item.resolvedUrl,
              localPath: `./assets/${category}/${matchingFile}`,
              status: 'exists',
              category: category
            });
          }
        }
      }
    }

    console.log(`📊 Found ${downloadResults.length} downloaded resources\n`);

    // Rewrite HTML
    const rewriter = new HTMLRewriter(siteOutputDir);
    rewriter.loadUrlMap(downloadResults);
    
    const rewrittenHtml = rewriter.rewrite(html, testSite.url);
    
    // Save
    const outputPath = rewriter.saveRewrittenHtml(rewrittenHtml);
    
    console.log(`✅ Rewritten HTML saved to: ${outputPath}`);
    
    // Show sample rewrites
    console.log('\n📝 Sample URL rewrites:');
    let count = 0;
    for (const [original, local] of rewriter.urlMap) {
      if (count < 5 && !original.includes('data:')) {
        console.log(`   ${original.substring(0, 50)}...`);
        console.log(`   → ${local}\n`);
        count++;
      }
    }
  }

  test().catch(console.error);
}
