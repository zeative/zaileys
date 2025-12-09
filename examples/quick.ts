import { Client } from 'zaileys';

const wa = new Client({
  authType: 'qr',
});

wa.on('messages', async (ctx) => {
  if (ctx.text == 'ping') {
    await wa.send(ctx.roomId, 'Pong! 🏓');
  }
});
