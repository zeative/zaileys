import { createLowdb } from '../src/Modules/lowdb';

const db = createLowdb('.temp/test.json', { size: 1024 * 1024 });

const bigData = [];

for (let i = 0; i < 1; i++) {
  bigData.push({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    description: `This is a very long description for user ${i} to make the data larger. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      settings: { theme: 'dark', notifications: true, language: 'en' },
    },
  });
}

await db.set('largeArray', bigData);

const result = await db.get('largeArray');
console.log('🔍 ~  ~ examples/chunk.ts:22 ~ result:', result);
