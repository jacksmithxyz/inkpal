import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { Bot } from "grammy";
import type { PhotoSize } from "grammy/types";
import { PROMPT } from "./prompt";

const botToken = Bun.env.TELEGRAM_BOT_TOKEN || "";
const bot = new Bot(botToken);

const anthropic = new Anthropic();

async function getTelegramImage(imageArray: PhotoSize[]) {
  // The highest resolution image is in the final index position of imageArray
  const highestQualityImg = imageArray.pop();

  if (!highestQualityImg) {
    throw new Error("No image found in array.");
  }

  const fileInfo = await bot.api.getFile(highestQualityImg?.file_id);
  const filePath = fileInfo.file_path;

  const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch file from Telegram");
  }

  return response.arrayBuffer();
}

async function uploadImageToAnthropic(image: ArrayBuffer) {
  const fileData = await anthropic.beta.files.upload({
    file: await toFile(image, undefined, { type: "image/jpeg" }),
    betas: ["files-api-2025-04-14"],
  });

  return fileData;
}

async function getAnthropicResponse(fileId: string) {
  const message = await anthropic.beta.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 20000,
    temperature: 1,
    system: "You are a text analysis expert",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image",
            source: {
              type: "file",
              file_id: fileId,
            },
          },
        ],
      },
    ],
    betas: ["files-api-2025-04-14"],
  });
  console.log(message);
  return message;
}

bot.command("start", (ctx) =>
  ctx.reply(
    "Welcome to Inkpal! Please send an image of your handwritten text to get started.",
  ),
);

bot.on("message:photo", async (ctx) => {
  const photoArray = ctx.message.photo;
  const image = await getTelegramImage(photoArray);
  const uploadedFile = await uploadImageToAnthropic(image);

  const imageText = await getAnthropicResponse(uploadedFile.id);

  ctx.reply(imageText.content[0].text, { parse_mode: "MarkdownV2" });
});

bot.on("message:text", (ctx) => {
  ctx.reply("*Please send an image*", { parse_mode: "MarkdownV2" });
});

// Start the bot.
bot.start();
