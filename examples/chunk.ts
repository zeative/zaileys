import { createLowdb } from '../src/Modules/lowdb';

const db = createLowdb('.temp/sdsd.json', { chunkSize: 1024 * 1024 });

await db.read();

const bigData = [];
for (let i = 0; i < 100000; i++) {
  bigData.push({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    description: `This is a very long description for user ${i} to make the data larger. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      settings: {
        theme: 'dark',
        notifications: true,
        language: 'en',
      },
    },
  });
}

// await db.set('largeArray', bigData);

// await db.write();

console.log(await db.get('largeArray'));
