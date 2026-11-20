
import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY belum tersedia.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Prompt diambil dari Terminal
const topic = process.argv.slice(2).join(" ").trim();

if (!topic) {
  console.error("Masukkan topik video terlebih dahulu.");
  process.exit(1);
}

async function generateWithRetry(request) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      const status = error.status ?? error.code;
      const retryable = [429, 500, 502, 503, 504].includes(
        Number(status)
      );

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const delay = 2000 * 2 ** (attempt - 1);

      console.log(
        `⚠️ Gemini sibuk (${status}). Percobaan ${attempt}/${maxAttempts}.`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function generateVideo() {
  console.log("🤖 Gemini sedang menulis konten...");

  const response = await generateWithRetry({
    model: "gemini-3.1-flash-lite",
    contents: `
Buat konten video pendek berdasarkan topik berikut:
"${topic}"

Aturan:
- Bahasa Indonesia natural, cocok untuk Gen Z.
- Buat tepat 3 scene untuk video 15 detik.
- Setiap scene berisi title dan subtitle.
- Title maksimal 5 kata, subtitle maksimal 12 kata.
- Scene 1: hook yang menarik.
- Scene 2: informasi atau insight utama.
- Scene 3: closing yang berkesan.
- Hindari klaim berlebihan atau informasi mengada-ada.

Kembalikan JSON dengan struktur:
{
  "scenes": [
    {"title": "...", "subtitle": "..."},
    {"title": "...", "subtitle": "..."},
    {"title": "...", "subtitle": "..."}
  ]
}
`,
    config: {
      responseMimeType: "application/json",
    },
  });

  if (!response.text) {
    throw new Error("Gemini tidak mengembalikan konten.");
  }

  const result = JSON.parse(response.text);

  if (
    !Array.isArray(result.scenes) ||
    result.scenes.length !== 3 ||
    !result.scenes.every(
      (scene) =>
        typeof scene.title === "string" &&
        typeof scene.subtitle === "string"
    )
  ) {
    throw new Error("Format scene dari Gemini tidak sesuai.");
  }

  const videoData = {
    brand: "AI MOTION STUDIO",
    background: "#111111",
    textColor: "#F5F2EA",
    accentColor: "#FF814A",
    scenes: result.scenes,
  };

  await writeFile(
    new URL("./src/video-data.json", import.meta.url),
    JSON.stringify(videoData, null, 2),
    "utf8"
  );

  console.log("✅ Video JSON berhasil dibuat!");
  console.log("📁 File: src/video-data.json");
}

generateVideo().catch((error) => {
  console.error("❌ Gagal generate:", error.message);
  process.exitCode = 1;
});
