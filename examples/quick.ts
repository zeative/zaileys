import { cleanJid, Client } from '../src';

const wa = new Client({
  authType: 'qr',
  prefix: '/',

  limiter: {
    maxMessages: 5,
    durationMs: 10_000,
  },

  fakeReply: { provider: 'copilot' },

  citation: {
    isAuthors: async () => {
      // const res = await fetch...
      return [621234567890];
    },
  },
});

wa.on('connection', (ctx) => {
  // do something
});

wa.on('messages', async (ctx) => {
  const isAuthors = await ctx.citation.isAuthors();

  if (!isAuthors) return;
  if (!ctx.isPrefix) return;

  if (ctx.isSpam) {
    await wa.send(ctx.roomId, "Don't spam bruhh!");
    return;
  }

  if (ctx.text == '/basic') {
    await wa.send(ctx.roomId, `Hello World @${cleanJid(ctx.senderLid)}`);
  }

  if (ctx.text == '/reply') {
    await wa.send(ctx.roomId, {
      text: `Reply @${cleanJid(ctx.senderId)} message!`,
      replied: ctx.message(),
    });
  }

  if (ctx.text == '/forward') {
    await wa.forward(ctx.roomId, 'Forwarded message!');
  }

  if (ctx.text == '/banner') {
    await wa.send(ctx.roomId, {
      text: 'Banner message!',
      banner: {
        thumbnailUrl: 'https://github.com/zeative.png',
        sourceUrl: 'https://jaa.web.id',
        title: 'Test Banner',
        body: 'Hello World!',
      },
    });
  }
});

wa.on('calls', (ctx) => {
  // do something
});
