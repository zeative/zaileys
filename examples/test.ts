import { Client } from '../src';

/**
 * Zaileys - Dev Playground
 * 
 * This file is used by `npm run dev` to test the library during development.
 * It provides a basic setup with QR code authentication and a ping/pong command.
 */

const wa = new Client({
  // session name
  session: 'zaileys-test',
  
  // authentication type
  authType: 'qr',
  
  // show internal logs
  showLogs: true,
  
  // enable detailed logs
  fancyLogs: false,
});

wa.on('messages', async (ctx) => {
  // Ignore status updates, stories, or messages from the bot itself
  if (ctx.isStatusMention || ctx.isStory || ctx.isFromMe) return;

  const text = ctx.text?.toLowerCase() || '';

  // ─── Simple Ping Command ──────────────────────────────────────
  if (text === 'ping') {
    console.log(`[Test] Ping received from ${ctx.senderName} (${ctx.senderId})`);
    await wa.send(ctx.roomId, 'Pong! 🏓');
  }

  // ─── Echo Command ─────────────────────────────────────────────
  if (text.startsWith('echo ')) {
    const content = text.replace('echo ', '');
    await wa.send(ctx.roomId, `Echo: ${content}`);
  }
});

// Optional: Notify when the client is ready
wa.ready().then(() => {
  console.log('🚀 Zaileys Test Client is ready!');
});
