/**
 * E2E Test Analyzer
 * Analyzes similarity test failures and generates actionable insights
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

class E2EAnalyzer {
  constructor(config = {}) {
    this.config = {
      baselineDir: path.join(__dirname, '..', 'baselines'),
      crawledDir: path.join(__dirname, '..', 'crawled'),
      diffDir: path.join(__dirname, '..', 'diffs'),
      outputDir: path.join(__dirname, '..', 'analysis'),
      ...config
    };
    
    this.issuesDB = {
      fonts: {
        category: 'fonts',
        description: 'Font rendering mismatch (FOUT, web fonts not inlined)',
        fixes: ['enhance_font_polyfills', 'inline_web_fonts', 'force_system_fonts'],
        priority: 'high'
      },
      images: {
        category: 'images',
        description: 'Image loading issues (not inlined, broken URLs)',
        fixes: ['enhance_base64_inlining', 'fix_image_urls', 'increase_max_image_size'],
        priority: 'high'
      },
      layout: {
        category: 'layout',
        description: 'Layout shifts (height differences, element positioning)',
        fixes: ['fix_height_calculation', 'stabilize_layout', 'constrain_dimensions'],
        priority: 'critical'
      },
      dynamic_content: {
        category: 'dynamic_content',
        description: 'Dynamic content (animations, carousels not frozen)',
        fixes: ['enhance_content_freezer', 'expand_accordions', 'pause_carousels'],
        priority: 'medium'
      },
      spa_hydration: {
        category: 'spa_hydration',
        description: 'SPA hydration issues (React/Vue not rendering properly)',
        fixes: ['enhance_spa_polyfills', 'remove_hydration_attrs', 'clone_dom'],
        priority: 'high'
      },
      missing_content: {
        category: 'missing_content',
        description: 'Content not loaded (lazy loading not triggered)',
        fixes: ['enhance_lazy_loading', 'scroll_page', 'wait_for_network'],
        priority: 'critical'
      }
    };
  }

  /**
   * Analyze a single test result
   */
  async analyzeResult(targetName, similarity, diffPixels, totalPixels, dimensionMismatch = null) {
    const issues = [];
    const diffPercentage = (diffPixels / totalPixels) * 100;
    
    // Check for height/layout issues
    if (dimensionMismatch && dimensionMismatch.baseline !== dimensionMismatch.crawled) {
      const heightDiff = Math.abs(dimensionMismatch.baseline - dimensionMismatch.crawled);
      const heightDiffPercent = (heightDiff / dimensionMismatch.baseline) * 100;
      
      if (heightDiffPercent > 10) {
        issues.push({
          ...this.issuesDB.layout,
          details: {
            baselineHeight: dimensionMismatch.baseline,
            crawledHeight: dimensionMismatch.crawled,
            heightDiff,
            heightDiffPercent: heightDiffPercent.toFixed(2)
          }
        });
      }
    }
    
    // Analyze diff image if available
    const diffPath = path.join(this.config.diffDir, `${targetName}_diff.png`);
    if (fs.existsSync(diffPath)) {
      const diffAnalysis = await this.analyzeDiffImage(diffPath);
      issues.push(...diffAnalysis.issues);
    }
    
    // Categorize severity based on similarity
    let severity = 'low';
    if (similarity < 70) severity = 'critical';
    else if (similarity < 80) severity = 'high';
    else if (similarity < 90) severity = 'medium';
    
    return {
      target: targetName,
      similarity,
      diffPixels,
      totalPixels,
      diffPercentage: diffPercentage.toFixed(2),
      dimensionMismatch,
      severity,
      issues,
      recommendedFixes: this.generateFixes(issues),
      improvementPotential: this.calculateImprovementPotential(similarity, issues)
    };
  }

  /**
   * Analyze diff image to identify problem regions
   */
  async analyzeDiffImage(diffPath) {
    const issues = [];
    
    try {
      const img = PNG.sync.read(fs.readFileSync(diffPath));
      const { width, height, data } = img;
      
      // Count red pixels (diff color is [255, 0, 0])
      let redPixels = 0;
      let topRedY = height;
      let bottomRedY = 0;
      let leftRedX = width;
      let rightRedX = 0;
      
      // Analyze pixel distribution
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          // Red pixels indicate differences
          if (r > 200 && g < 50 && b < 50) {
            redPixels++;
            if (y < topRedY) topRedY = y;
            if (y > bottomRedY) bottomRedY = y;
            if (x < leftRedX) leftRedX = x;
            if (x > rightRedX) rightRedX = x;
          }
        }
      }
      
      // Analyze diff distribution patterns
      const diffRegion = {
        top: topRedY,
        bottom: bottomRedY,
        left: leftRedX,
        right: rightRedX,
        height: bottomRedY - topRedY,
        width: rightRedX - leftRedX
      };
      
      // Determine issue type based on diff patterns
      if (diffRegion.height > height * 0.8) {
        // Diffs throughout entire page height
        issues.push({
          ...this.issuesDB.spa_hydration,
          details: { diffRegion, pattern: 'full_page_diff' }
        });
      }
      
      if (diffRegion.top > height * 0.5) {
        // Mostly lower portion differs
        issues.push({
          ...this.issuesDB.missing_content,
          details: { diffRegion, pattern: 'lower_portion_missing' }
        });
      }
      
      if (redPixels > 0 && redPixels < (width * height * 0.01)) {
        // Small scattered diffs - likely fonts
        issues.push({
          ...this.issuesDB.fonts,
          details: { redPixels, pattern: 'scattered_diffs' }
        });
      }
      
      return { issues, diffRegion, redPixels };
    } catch (error) {
      console.error('Error analyzing diff image:', error.message);
      return { issues: [], diffRegion: null, redPixels: 0 };
    }
  }

  /**
   * Generate recommended fixes based on issues
   */
  generateFixes(issues) {
    const fixes = new Set();
    
    for (const issue of issues) {
      if (issue.fixes) {
        issue.fixes.forEach(fix => fixes.add(fix));
      }
    }
    
    return Array.from(fixes);
  }

  /**
   * Calculate improvement potential
   */
  calculateImprovementPotential(similarity, issues) {
    let potential = 100 - similarity;
    
    // Adjust based on fixable issues
    const hasLayoutIssue = issues.some(i => i.category === 'layout');
    const hasMissingContent = issues.some(i => i.category === 'missing_content');
    const hasFonts = issues.some(i => i.category === 'fonts');
    
    if (hasLayoutIssue) potential *= 0.6; // Layout issues are harder to fix
    if (hasMissingContent) potential *= 0.7; // Missing content can often be loaded
    if (hasFonts) potential *= 0.9; // Font issues are relatively easy to fix
    
    return Math.round(potential * 100) / 100;
  }

  /**
   * Generate full analysis report
   */
  async generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTargets: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        averageSimilarity: results.reduce((a, b) => a + b.similarity, 0) / results.length
      },
      targets: {},
      globalIssues: this.aggregateIssues(results),
      improvementPlan: this.generateImprovementPlan(results)
    };
    
    for (const result of results) {
      report.targets[result.target] = result;
    }
    
    // Save report
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    
    const reportPath = path.join(this.config.outputDir, 'analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    return report;
  }

  /**
   * Aggregate issues across all targets
   */
  aggregateIssues(results) {
    const issueCounts = {};
    
    for (const result of results) {
      for (const issue of result.issues) {
        issueCounts[issue.category] = (issueCounts[issue.category] || 0) + 1;
      }
    }
    
    return Object.entries(issueCounts)
      .map(([category, count]) => ({
        category,
        count,
        description: this.issuesDB[category]?.description || 'Unknown issue'
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate prioritized improvement plan
   */
  generateImprovementPlan(results) {
    const failedTargets = results.filter(r => !r.passed);
    const globalIssues = this.aggregateIssues(results);
    
    const plan = {
      immediate: [],
      shortTerm: [],
      longTerm: []
    };
    
    // Immediate: Fix critical issues on lowest similarity targets
    for (const target of failedTargets.slice(0, 2)) {
      const criticalIssues = target.issues.filter(i => i.priority === 'critical');
      if (criticalIssues.length > 0) {
        plan.immediate.push({
          target: target.target,
          action: `Fix ${criticalIssues[0].category}`,
          expectedImprovement: target.improvementPotential.toFixed(2),
          fixes: criticalIssues[0].fixes
        });
      }
    }
    
    // Short-term: Fix most common global issues
    if (globalIssues.length > 0) {
      const topIssue = globalIssues[0];
      plan.shortTerm.push({
        action: `Address ${topIssue.category} across all targets`,
        affectedTargets: topIssue.count,
        fixes: this.issuesDB[topIssue.category]?.fixes || []
      });
    }
    
    // Long-term: Incremental threshold increases
    const passingTargets = results.filter(r => r.passed);
    for (const target of passingTargets) {
      plan.longTerm.push({
        target: target.target,
        action: 'Gradually increase threshold',
        currentThreshold: target.threshold,
        suggestedNewThreshold: Math.min(99, Math.ceil(target.similarity + 1))
      });
    }
    
    return plan;
  }

  /**
   * Print human-readable analysis
   */
  printAnalysis(report) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 E2E ANALYSIS REPORT');
    console.log('='.repeat(70));
    
    console.log(`\n🎯 Summary:`);
    console.log(`   Total Targets: ${report.summary.totalTargets}`);
    console.log(`   ✅ Passed: ${report.summary.passed}`);
    console.log(`   ❌ Failed: ${report.summary.failed}`);
    console.log(`   📈 Average Similarity: ${report.summary.averageSimilarity.toFixed(2)}%`);
    
    console.log(`\n🔍 Global Issues (by frequency):`);
    for (const issue of report.globalIssues) {
      console.log(`   ${issue.count}x ${issue.category}: ${issue.description}`);
    }
    
    console.log(`\n📋 Immediate Actions:`);
    for (const action of report.improvementPlan.immediate) {
      console.log(`   → ${action.target}: ${action.action}`);
      console.log(`     Expected improvement: +${action.expectedImprovement}%`);
    }
    
    console.log(`\n📈 Short-term Actions:`);
    for (const action of report.improvementPlan.shortTerm) {
      console.log(`   → ${action.action}`);
      console.log(`     Affects ${action.affectedTargets} targets`);
    }
    
    console.log(`\n🚀 Long-term Goals:`);
    for (const goal of report.improvementPlan.longTerm) {
      console.log(`   → ${goal.target}: Increase threshold to ${goal.suggestedNewThreshold}%`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`📁 Full report saved: ${path.join(this.config.outputDir, 'analysis-report.json')}`);
    console.log('='.repeat(70) + '\n');
  }
}

module.exports = { E2EAnalyzer };
