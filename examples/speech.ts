import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";

import { Client } from "../src";
// import { Client } from "zaileys";

const agent = new GoogleGenAI({ apiKey: "AIzaSyCE8ml8-tcfXVChsfYiqR-Z1W1ovHZSIh8" });

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only
});

wa.on("messages", async (ctx) => {
  if (ctx.chatType != "audio") return;

  const buffer = await ctx.media?.buffer();
  const stream = new File([buffer || ""], "voice.ogg", { type: "audio/ogg" });

  const uploaded = await agent.files.upload({
    file: stream,
    config: { mimeType: "audio/ogg" },
  });

  const speech = await agent.models
    .generateContent({
      model: "gemini-2.0-flash-001",
      contents: createUserContent([{ text: "Please transcribe this audio:" }, createPartFromUri(uploaded.uri!, uploaded.mimeType!)]),
    })
    .then((x) => x.candidates?.[0].content?.parts?.[0].text || "");

  const answer = await agent.models
    .generateContent({
      model: "gemini-2.0-flash-001",
      contents: speech,
    })
    .then((x) => x.candidates?.[0].content?.parts?.[0].text || "");

  await wa.text(answer, { roomId: ctx.roomId });
});
