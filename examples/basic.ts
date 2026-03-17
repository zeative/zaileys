import { Client } from '../src';

const wa = new Client({
  authType: 'qr',
  prefix: '!',
});

wa.on('messages', async (ctx) => {
  if (ctx.isStatusMention || ctx.isStory || ctx.isFromMe) return;

  const cmd = ctx.text?.split(' ')[0]?.toLowerCase() ?? '';

  // ─── Text ────────────────────────────────────────────────────
  if (cmd === 'ping') {
    await wa.send(ctx.roomId, 'Pong! 🏓');
  }

  // ─── Reply ───────────────────────────────────────────────────
  if (cmd === 'hello') {
    await wa.send(ctx.roomId, {
      text: `Hi *${ctx.senderName}*! Welcome to Zaileys 👋`,
      replied: ctx.message(),
    });
  }

  // ─── Image ───────────────────────────────────────────────────
  if (cmd === 'image') {
    await wa.send(ctx.roomId, {
      image: 'https://picsum.photos/400/300',
      caption: '📸 Random image from Picsum',
    });
  }

  // ─── Sticker ─────────────────────────────────────────────────
  if (cmd === 'sticker') {
    await wa.send(ctx.roomId, {
      sticker: 'https://picsum.photos/200',
      shape: 'rounded',
    });
  }

  // ─── Location ────────────────────────────────────────────────
  if (cmd === 'location') {
    await wa.send(ctx.roomId, {
      location: {
        latitude: -6.2,
        longitude: 106.816666,
        title: 'Jakarta',
        footer: 'Capital City of Indonesia',
      },
    });
  }

  // ─── Poll ────────────────────────────────────────────────────
  if (cmd === 'poll') {
    await wa.send(ctx.roomId, {
      poll: {
        name: 'What is your favorite language?',
        answers: ['TypeScript', 'JavaScript', 'Python', 'Go'],
        isMultiple: false,
      },
    });
  }

  // ─── Reaction ────────────────────────────────────────────────
  if (cmd === 'react') {
    await wa.reaction(ctx.message(), '🔥');
  }

  // ─── Simple Buttons ──────────────────────────────────────────
  if (cmd === 'simple') {
    await wa.button(ctx.roomId, {
      text: 'Pick an option below:',
      buttons: {
        type: 'simple',
        footer: 'Powered by Zaileys',
        data: [
          { id: 'opt_1', text: '✅ Accept' },
          { id: 'opt_2', text: '❌ Decline' },
          { id: 'opt_3', text: '⏭️ Skip' },
        ],
      },
    });
  }

  // ─── Interactive Buttons ─────────────────────────────────────
  if (cmd === 'interactive') {
    await wa.button(ctx.roomId, {
      text: 'Here are some interactive actions:',
      buttons: {
        type: 'interactive',
        footer: 'Powered by Zaileys',
        data: [
          { type: 'quick_reply', id: 'like', text: '👍 Like' },
          { type: 'cta_url', text: '🌐 Open Website', url: 'https://github.com/zeative/zaileys' },
          { type: 'cta_copy', id: 'promo', text: '📋 Copy Code', copy: 'ZAILEYS2025' },
          { type: 'cta_call', text: '📞 Call Us', phoneNumber: '+628123456789' },
        ],
      },
    });
  }

  // ─── List / Single Select ───────────────────────────────────
  if (cmd === 'list') {
    await wa.button(ctx.roomId, {
      text: 'Browse our categories:',
      buttons: {
        type: 'interactive',
        footer: 'Pick one from the list',
        data: [
          {
            type: 'single_select',
            text: 'Open Menu',
            section: [
              {
                title: '🍕 Food',
                rows: [
                  { id: 'pizza', title: 'Pizza', description: 'Classic Italian' },
                  { id: 'sushi', title: 'Sushi', description: 'Fresh Japanese' },
                ],
              },
              {
                title: '🥤 Drinks',
                rows: [
                  { id: 'coffee', title: 'Coffee', description: 'Hot & fresh' },
                  { id: 'juice', title: 'Orange Juice', description: 'Freshly squeezed' },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  // ─── Carousel (Desktop Compatible!) ────────────────────────
  if (cmd === 'carousel') {
    await wa.button(ctx.roomId, {
      text: 'Swipe through our featured items 👇',
      buttons: {
        type: 'carousel',
        data: [
          {
            body: '🏔️ Mountain Adventure',
            footer: 'Starting from $299',
            header: {
              title: 'Mountain Trip',
              image: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=400&h=200&fit=crop',
              hasMediaAttachment: true,
            },
            nativeFlow: [
              { type: 'cta_url', text: 'Book Now', url: 'https://example.com/mountain' },
              { type: 'quick_reply', id: 'fav_mountain', text: '❤️ Save' },
            ],
          },
          {
            body: '🏖️ Beach Paradise',
            footer: 'Starting from $199',
            header: {
              title: 'Beach Getaway',
              image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=200&fit=crop',
              hasMediaAttachment: true,
            },
            nativeFlow: [
              { type: 'cta_url', text: 'Book Now', url: 'https://example.com/beach' },
              { type: 'quick_reply', id: 'fav_beach', text: '❤️ Save' },
            ],
          },
          {
            body: '🏙️ City Explorer',
            footer: 'Starting from $149',
            header: {
              title: 'City Tour',
              image: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&h=200&fit=crop',
              hasMediaAttachment: true,
            },
            nativeFlow: [
              { type: 'cta_url', text: 'Book Now', url: 'https://example.com/city' },
              { type: 'cta_copy', id: 'code_city', text: '📋 Copy Promo', copy: 'CITY20' },
            ],
          },
        ],
      },
    });
  }

  // ─── Help Menu ───────────────────────────────────────────────
  if (cmd === 'menu' || cmd === 'help') {
    await wa.send(ctx.roomId, {
      text: [
        '*🤖 Zaileys Example Bot*',
        '',
        '📝 *Messages*',
        '• !ping — Pong test',
        '• !hello — Reply greeting',
        '• !react — React with 🔥',
        '',
        '📸 *Media*',
        '• !image — Random image',
        '• !sticker — Random sticker',
        '• !location — Send location',
        '• !poll — Create a poll',
        '',
        '🎛️ *Buttons*',
        '• !simple — Simple buttons',
        '• !interactive — URL, copy, call buttons',
        '• !list — List selector menu',
        '• !carousel — Carousel cards ✅ Desktop',
      ].join('\n'),
      replied: ctx.message(),
    });
  }
});
