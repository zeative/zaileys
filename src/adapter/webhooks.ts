import { Hono } from "hono";
import { serve } from "@hono/node-server";
import Client from "../classes/Client";
import { getLocalIP } from "../helpers/utils";

let hooksInitial = false;

export const startWebhooks = async (client: Client, socket: Client["socket"]) => {
  const app = new Hono();
  const ip = getLocalIP();

  app.get("/webhooks", async (c) => {
    socket?.ev.emit("idle-webhooks" as any, c);
    return c.text("OK");
  });

  app.post("/webhooks", async (c) => {
    socket?.ev.emit("idle-webhooks" as any, c);
    return c.text("OK");
  });

  if (!hooksInitial) {
    serve(
      {
        fetch: app.fetch,
        port: 4135,
      },
      () => {
        client.stopSpinner("webhooks", true, `Webhooks Access\n  - URL   : http://${ip}:4135/webhooks\n  - PORT  : 4135\n  - METHOD: GET, POST`);
        hooksInitial = true;
      }
    );
  }

  client.stopSpinner("webhooks", true, `Webhooks Access\n  - URL   : http://${ip}:4135/webhooks\n  - PORT  : 4135\n  - METHOD: GET, POST`);
};

export const sendWebhooks = async (url: string, data: unknown) => {
  if (!url && !data) return;

  await fetch(url, {
    method: "POST",
    body: JSON.stringify(data),
  }).catch(() => null);
};
