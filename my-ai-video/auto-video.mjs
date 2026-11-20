
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const topic = process.argv.slice(2).join(" ").trim();

if (!topic) {
  console.error("❌ Masukkan topik video!");
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Proses gagal (exit code ${code})`));
    });
  });
}

async function main() {
  console.log("🤖 STEP 1: Gemini menulis skrip...");

  await run("node", ["generate-video.mjs", topic]);

  console.log("🎬 STEP 2: Remotion merender video...");

  await mkdir("out", { recursive: true });

  await run("npx", [
    "remotion",
    "render",
    "MyComp",
    "out/ai-video.mp4",
    "--codec",
    "h264",
    "--concurrency",
    "1",
  ]);

  console.log("✅ VIDEO SELESAI!");
  console.log("📁 Lokasi: out/ai-video.mp4");
}

main().catch((error) => {
  console.error("❌ Gagal:", error.message);
  process.exitCode = 1;
});
