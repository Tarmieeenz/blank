
import { GoogleGenAI } from "@google/genai";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY belum tersedia.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// Prompt diambil dari Terminal
const args = process.argv.slice(2);
const jobIdFlag = args.lastIndexOf("--job-id");
const jobId = jobIdFlag === -1 ? randomUUID() : args[jobIdFlag + 1];
if (jobIdFlag !== -1) args.splice(jobIdFlag, 2);
const topic = args.join(" ").trim();
if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error("Job ID tidak valid.");
const options = process.env.VIDEO_OPTIONS ? JSON.parse(process.env.VIDEO_OPTIONS) : {};
const sceneCount = Math.max(3, Math.round((options.duration ?? 15) / 10));

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
  const assetNames = await readdir(new URL("./public/assets/", import.meta.url)).catch(() => []);
  const approvedImages = assetNames.filter((name) => /\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(name));

  const response = await generateWithRetry({
    model: "gemini-3.1-flash-lite",
    contents: `
Buat konten video pendek berdasarkan topik berikut:
"${topic}"

Aturan:
- Bahasa Indonesia natural, cocok untuk Gen Z.
- Buat tepat ${sceneCount} scene untuk video ${options.duration ?? 15} detik.
- Setiap scene berisi title dan subtitle.
- Title maksimal 5 kata, subtitle maksimal 12 kata.
- Scene 1: hook yang menarik.
- Scene 2: informasi atau insight utama.
- Scene terakhir: closing yang berkesan.
- Hindari klaim berlebihan atau informasi mengada-ada.
- Gambar boleh dipilih hanya dari daftar aset lokal berlisensi berikut: ${approvedImages.join(", ") || "tidak ada"}.
- Jika memilih gambar, gunakan nama file persis. Jika tidak, kosongkan image.

Kembalikan JSON dengan struktur:
{
  "scenes": [
    {"title": "...", "subtitle": "...", "image": ""},
    {"title": "...", "subtitle": "...", "image": ""}
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
    result.scenes.length !== sceneCount ||
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
    scenes: result.scenes.map((scene) => ({
      title: scene.title,
      subtitle: scene.subtitle,
      image: approvedImages.includes(scene.image) ? `assets/${scene.image}` : undefined,
    })),
  };

  if (options.voice) {
    const speech = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read in natural Indonesian with clear pacing: ${videoData.scenes.map((scene) => scene.subtitle).join(". ")}` }] }],
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    });
    const encoded = speech.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData?.data;
    if (!encoded) throw new Error("Gemini tidak mengembalikan audio.");
    const pcm = Buffer.from(encoded, "base64");
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(48000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    await mkdir(new URL("./public/generated/", import.meta.url), { recursive: true });
    const audioName = `ai-video-${jobId}.wav`;
    await writeFile(new URL(`./public/generated/${audioName}`, import.meta.url), Buffer.concat([header, pcm]));
    videoData.narration = `generated/${audioName}`;
  }

  await mkdir(new URL("./out/", import.meta.url), { recursive: true });
  await writeFile(
    new URL(`./out/ai-video-${jobId}.json`, import.meta.url),
    JSON.stringify(videoData, null, 2),
    "utf8"
  );

  console.log("✅ Video JSON berhasil dibuat!");
  console.log(`📁 File: out/ai-video-${jobId}.json`);
}

generateVideo().catch((error) => {
  console.error("❌ Gagal generate:", error.message);
  process.exitCode = 1;
});
