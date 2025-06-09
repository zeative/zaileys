import Groq from "groq-sdk";

import { Client } from "../src";
// import { Client } from "zaileys";

const groq = new Groq({ apiKey: "YOUR_GROQ_APIKEY" });

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only
  loadLLMSchemas: true, // this option must be activated!
});

wa.on("messages", async (ctx) => {
  const { channelId, uniqueId, roomId, text } = ctx;

  if (text == "clear") {
    await wa.llms.clearCompletions(channelId);
    await wa.text("History clear!", { roomId });
    return;
  }

  const histories = await wa.llms.getCompletions(channelId);
  const model = await groq.chat.completions.create({
    messages: [
      { role: "system", content: "You are 'Zaileys AI' a helpful assistant speak indonesian." },
      ...(histories.map((x) => ({ role: x.role, content: x.content })) as never),
      { role: "user", content: text || "" },
    ],
    model: "llama-3.3-70b-versatile",
  });

  const output = model.choices[0]?.message?.content || "";
  const ai = await wa.text(output, { roomId, asAI: true });

  await wa.llms.addCompletion({ channelId, uniqueId, role: "user", content: text || "" });
  await wa.llms.addCompletion({ channelId, uniqueId: ai?.uniqueId || "", role: "assistant", content: output });
});
