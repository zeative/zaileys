#!/usr/bin/env node

// Script to build with increased memory allocation
const { spawn } = require('child_process');
const path = require('path');

// Resolve the tsup binary path correctly for Windows
const tsupPath = path.resolve(__dirname, '../node_modules/tsup/dist/cli-default.js');

// Spawn tsup with increased memory
const buildProcess = spawn(
  'node',
  [
    '--max-old-space-size=4096', // Increase memory to 4GB
    tsupPath
  ],
  {
    stdio: 'inherit',
    shell: true
  }
);

buildProcess.on('close', (code) => {
  if (code === 0) {
    console.log('Build completed successfully');
  } else {
    console.error(`Build process exited with code ${code}`);
    process.exit(code);
  }
});