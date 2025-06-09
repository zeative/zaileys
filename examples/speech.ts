import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";

import { Client } from "../src";
// import { Client } from "zaileys";

const agent = new GoogleGenAI({ apiKey: "YOUR_GEMINI_APIKEY" });

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
      contents: createUserContent([
        {
          text: "Transcribe it internally, but do not output the transcription. Simply respond to the message as if you were replying naturally in a conversation. Be direct, contextual, and human-like—no need to mention the transcription process or analyze the speaker’s intent.",
        },
        createPartFromUri(uploaded.uri!, uploaded.mimeType!),
      ]),
    })
    .then((x) => x.candidates?.[0].content?.parts?.[0].text || "");

  await wa.text(speech, { roomId: ctx.roomId });
});
