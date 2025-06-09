import { Client } from "../src";
// import { Client } from "zaileys";

const wa = new Client({
  authType: "qr", // has issue with pairing code, just use qr only
  webhooks: {
    url: "https://...", // An event triggers a call to the webhook url
  },
});

/*
✔ Webhooks Access
  - URL   : http://xxx.xxx.x.xxx:4135/webhooks
  - PORT  : 4135
  - METHOD: GET, POST

  hit to "URL" with data to be captured by "webhooks" event
  example:

  await fetch("http://xxx.xxx.x.xxx:4135/webhooks?test1=hello&test2=world", {
    method: "POST", // optional (GET & POST only)
    body: JSON.stringify({ testingBody: "OK", yourData: "test1" })
  })
*/

wa.on("webhooks", (ctx) => {
  // passing search params
  console.log(ctx.data.query); // { test1: "hello", test2: "world" }

  // passing body
  console.log(ctx.data.json); // { testingBody: "OK", yourData: "test1" }

  // lets explore
  console.log(ctx)
  console.log(ctx.data.form)
  console.log(ctx.data.raw)
});
