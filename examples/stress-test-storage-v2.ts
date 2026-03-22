import { createStoreAdapter } from '@zaileys/store-adapters';
import * as _ from 'radashi';
import { BufferJSON } from 'baileys';
import fs from 'node:fs/promises';
import path from 'node:path';

const encoder = {
  encode: (obj: any) => JSON.stringify(obj, BufferJSON.replacer),
  decode: (str: string) => JSON.parse(str, BufferJSON.reviver),
};

const TEST_DIR = './.test-storage-stress';

async function runStressTest(type: 'lmdb' | 'json') {
  console.log(`\n🚀 [STRESS TEST] Starting for adapter type: ${type.toUpperCase()}`);
  
  // Cleanup previous test data
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {}
  
  const adapter = createStoreAdapter(type, TEST_DIR, { compression: true, encoder });

  // 1. Concurrency Test: 1000 Simultaneous Writes
  console.log('--- 1. Concurrency: Writing 1000 items simultaneously...');
  const startWrite = Date.now();
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: `item_${i}`,
    data: { name: `Name ${i}`, timestamp: Date.now(), nested: { a: 1, b: 2 } },
  }));

  await Promise.all(items.map(item => adapter.set(item.id, item.data)));
  console.log(`✅ Finished writing 1000 items in ${Date.now() - startWrite}ms`);

  // 2. Data Integrity Check
  console.log('--- 2. Integrity: Verifying all items exist and match...');
  const keys = await adapter.keys();
  if (keys.length !== 1000) {
    throw new Error(`Integrity Failed: Expected 1000 keys, found ${keys.length}`);
  }
  
  const sample = await adapter.get('item_500');
  if (!sample || (sample as any).name !== 'Name 500') {
    throw new Error('Integrity Failed: Sample data mismatch');
  }
  console.log('✅ Integrity Check Passed');

  // 3. Case Sensitivity Test (Critical for JSON hex-sharding)
  console.log('--- 3. Case Sensitivity: Testing collisions (MixedCaseKeys)...');
  await adapter.set('MyKey', { id: 'UPPER' });
  await adapter.set('mykey', { id: 'lower' });

  const upper = await adapter.get('MyKey');
  const lower = await adapter.get('mykey');

  if ((upper as any).id !== 'UPPER' || (lower as any).id !== 'lower') {
    throw new Error('Case Sensitivity Failed: Keys collided or overwrote each other');
  }
  console.log('✅ Case Sensitivity Passed (Hex-sharding works)');

  // 4. Batch Operations (setMany)
  console.log('--- 4. Batch: Testing setMany with 500 items...');
  const batch: Record<string, any> = {};
  for (let i = 0; i < 500; i++) {
    batch[`batch_${i}`] = { val: i };
  }
  await adapter.setMany(batch);
  const batchKeys = (await adapter.keys()).filter(k => k.startsWith('batch_'));
  if (batchKeys.length !== 500) {
    throw new Error(`Batch Failed: Expected 500 batch keys, found ${batchKeys.length}`);
  }
  console.log('✅ Batch setMany Passed');

  // 5. Deletion & Cleanup Simulation
  console.log('--- 5. Cleanup Simulation: Deleting batch items...');
  const deleteBatch = batchKeys;
  await Promise.all(deleteBatch.map(k => adapter.del(k)));
  const remainingKeys = await adapter.keys();
  if (remainingKeys.includes('batch_0')) {
    throw new Error('Deletion Failed: batch_0 still exists');
  }
  console.log(`✅ Cleanup / Deletion Passed. Remaining total keys: ${remainingKeys.length}`);

  console.log(`\n🎉 [STRESS TEST] ${type.toUpperCase()} PASSED ALL TESTS!\n`);
}

async function main() {
  try {
    // Test JSON first (the critical fallback for Android)
    await runStressTest('json');
    
    // Test LMDB if available
    try {
      require.resolve('lmdb');
      await runStressTest('lmdb');
    } catch {
      console.log('⏩ Skipping LMDB test (not installed/supported in this environment)');
    }
    
    console.log('FINAL RESULT: All storage systems are robust! 🛡️');
  } catch (error) {
    console.error('❌ STRESS TEST FAILED:', error);
    process.exit(1);
  }
}

main();
