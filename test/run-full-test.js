/**
 * Full E2E Test Runner
 * Runs the complete workflow: crawl → capture baselines → test similarity
 * Usage: node test/run-full-test.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STEPS = [
  {
    name: 'Clean previous outputs',
    command: 'npm run clean',
    required: false
  },
  {
    name: 'Crawl target websites',
    command: 'npm run crawl',
    required: true
  },
  {
    name: 'Capture baseline screenshots',
    command: 'npm run baseline:capture',
    required: true
  },
  {
    name: 'Run similarity tests',
    command: 'npm run test:similarity',
    required: true
  }
];

async function runFullTest() {
  console.log('🚀 Starting Full E2E Test Workflow\n');
  console.log('='.repeat(70));

  const results = [];

  for (const step of STEPS) {
    console.log(`\n📋 ${step.name}...`);
    console.log(`   Command: ${step.command}`);

    try {
      execSync(step.command, { stdio: 'inherit' });
      results.push({ step: step.name, status: '✅ PASSED' });
      console.log(`   ✅ Success`);
    } catch (error) {
      results.push({ step: step.name, status: '❌ FAILED' });
      console.log(`   ❌ Failed: ${error.message}`);

      if (step.required) {
        console.log('\n' + '='.repeat(70));
        console.log('❌ Required step failed. Stopping workflow.');
        process.exit(1);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Workflow Complete\n');

  results.forEach(r => {
    console.log(`${r.status} ${r.step}`);
  });

  // Check for results
  const reportPath = path.join(__dirname, 'diffs', 'similarity-report.json');
  if (fs.existsSync(reportPath)) {
    console.log(`\n📝 Report available: ${reportPath}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Next steps:');
  console.log('  - Check test output: test/diffs/');
  console.log('  - Review baseline images: test/baselines/');
  console.log('  - Review crawled screenshots: test/crawled/');
}

// Run if called directly
if (require.main === module) {
  runFullTest().catch(err => {
    console.error('❌ Workflow failed:', err);
    process.exit(1);
  });
}

module.exports = { runFullTest };
