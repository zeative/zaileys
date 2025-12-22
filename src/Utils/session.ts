import { promises as fs } from 'node:fs';
import { store } from '../Library/center-store';

type WASocket = {
  ev?: { removeAllListeners: () => void };
  end?: (reason?: Error) => void;
};

export const cleanupSocket = (socket: WASocket) => {
  if (!socket) return;
  try {
    socket.ev?.removeAllListeners();
    socket.end?.(new Error('Cleanup'));
  } catch {}
};

export const repairSessionKeys = async (session: string) => {
  const keysPath = `.session/${session}/auth/keys.json`;

  try {
    const content = await fs.readFile(keysPath, 'utf-8');
    const keys = JSON.parse(content);
    const corruptedPrefixes = ['sender-key:', 'session:'];

    const repairedKeys: Record<string, unknown> = {};
    let repaired = false;

    for (const [key, value] of Object.entries(keys)) {
      const isCorrupted = corruptedPrefixes.some((prefix) => key.startsWith(prefix));
      if (!isCorrupted) {
        repairedKeys[key] = value;
      } else {
        repaired = true;
      }
    }

    if (repaired) {
      await fs.writeFile(keysPath, JSON.stringify(repairedKeys, null, 2));
      store.spinner.success(' Session keys repaired successfully');
    }
  } catch {
    store.spinner.warn(' Could not repair session keys, will re-negotiate');
  }
};

export const getExistingSocket = (): WASocket | null => {
  const socket = store.get('socket') as WASocket | undefined;
  return socket?.end ? socket : null;
};
