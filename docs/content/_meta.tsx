import type { ReactNode } from 'react'

const paths: Record<string, string> = {
  home: 'M3 9.5 12 3l9 6.5M5 9.5V21h14V9.5M9 21v-6h6v6',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  rocket: 'M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2m4.5-8.5a8 8 0 0 1 4 4l-5 3-2-2zM15 9a2 2 0 1 0 0-.01M14 4l6 6c0 4-3 7-7 9l-3-3-3-3c2-4 5-7 9-7z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  cpu: 'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M5 5h14v14H5zM9 9h6v6H9z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  send: 'm22 2-7 20-4-9-9-4 20-7z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 9a1.5 1.5 0 1 0 0-.01',
  pointer: 'm9 9 5 12 1.8-5.2L21 14 9 9zM3 3l4 1M5 7 4 3M14 7l3-3M7 14l-3 3',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 3v4M21 5h-4M5 17v4M7 19H3',
  terminal: 'm4 17 6-6-6-6M12 19h8',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1zM19 8a5 5 0 0 1 0 8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  network: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 8v4M6.5 16.5 11 12M17.5 16.5 13 12',
  rss: 'M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19a1 1 0 1 0 0-.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  bot: 'M12 8V4M9 2h6M5 8h14v12H5zM9 13v2M15 13v2M2 14h3M19 14h3',
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

function item(icon: string, label: string): { title: ReactNode } {
  return {
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
        <Icon d={paths[icon]} />
        {label}
      </span>
    ),
  }
}

export default {
  '-- getting-started': { type: 'separator', title: 'Getting Started' },
  index: item('home', 'Introduction'),
  installation: item('download', 'Installation'),
  'getting-started': item('rocket', 'Getting Started'),
  configuration: item('sliders', 'Configuration'),

  '-- core': { type: 'separator', title: 'Core Concepts' },
  client: item('cpu', 'Client & Lifecycle'),
  events: item('zap', 'Events'),

  '-- messaging': { type: 'separator', title: 'Messaging' },
  'sending-messages': item('send', 'Sending Messages'),
  media: item('image', 'Media Processing'),
  interactive: item('pointer', 'Interactive Messages'),
  'rich-responses': item('sparkles', 'Rich Responses (AIRich)'),
  commands: item('terminal', 'Commands'),
  automation: item('megaphone', 'Broadcast & Schedule'),

  '-- social': { type: 'separator', title: 'Social & Channels' },
  profile: item('users', 'Profile'),
  presence: item('eye', 'Presence'),
  chat: item('eye', 'Chats'),
  groups: item('users', 'Groups'),
  contacts: item('users', 'Contacts'),
  community: item('network', 'Communities'),
  newsletter: item('rss', 'Newsletters (Channels)'),
  privacy: item('shield', 'Privacy & Blocking'),

  '-- advanced': { type: 'separator', title: 'Advanced' },
  business: item('database', 'Business & Catalog'),
  storage: item('database', 'Storage Adapters'),
  'error-handling': item('alert', 'Error Handling'),
  runtimes: item('server', 'Runtime Support'),

  '-- reference': { type: 'separator', title: 'Reference' },
  troubleshooting: item('help', 'Troubleshooting & FAQ'),
  'api-reference': item('book', 'API Reference'),
  skill: item('bot', 'AI Skill'),
}
