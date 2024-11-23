# REF

- [Baileys](https://github.com/WhiskeySockets/Baileys)
- [telegraf](https://github.com/telegraf/telegraf)

___

```js
import { Baileys } from "@frierendv/frieren";

const client = new Baileys.WASocket({
 prefix: ["/", "!"],
})

// middleware
client.use(async (ctx, next) => {
 if (ctx.country !== "ID") {
  return;
 } else {
  await next();
 }
});

// register command
client.command("start", async (ctx) => {
 await ctx.reply("Hello World!");
});

// listen all message except command
client.on("message", async (ctx) => {
 console.log(ctx);

 await ctx.sock.sendMessage(ctx.from, { text: "Hello World!" });
});

client.on("media", (media) => {
  console.log(media);
});

client.launch();
```
