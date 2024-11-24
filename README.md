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

client.command({
 ignorePrefix: true,
 command: "help",
}, async (ctx) => {
 await ctx.reply("This is help command!");
});

// listen all message except command
client.on("message", async (ctx) => {
 await ctx.sock.sendMessage(ctx.from, { text: "Hello World!" }, { quoted: ctx.message });
});

client.on("media", (media) => {
  console.log(media);
});

client.launch();
```
