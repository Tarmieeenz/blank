
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const jobIdFlag = args.lastIndexOf("--job-id");
const jobId = jobIdFlag === -1 ? randomUUID() : args[jobIdFlag + 1];

if (jobIdFlag !== -1) {
  args.splice(jobIdFlag, 2);
}

const topic = args.join(" ").trim();

if (!/^[a-f0-9-]{36}$/.test(jobId)) {
  console.error("❌ Job ID video tidak valid!");
  process.exit(1);
}

const outputPath = `out/ai-video-${jobId}.mp4`;
const options = process.env.VIDEO_OPTIONS ? JSON.parse(process.env.VIDEO_OPTIONS) : {};

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

  await run("node", ["generate-video.mjs", topic, "--job-id", jobId]);

  console.log("🎬 STEP 2: Remotion merender video...");

  await mkdir("out", { recursive: true });
  const data = JSON.parse(await readFile(`out/ai-video-${jobId}.json`, "utf8"));
  const props = JSON.stringify({ data: { ...data, ...options } });

  await run("npx", [
    "remotion",
    "render",
    "MyComp",
    outputPath,
    "--props",
    props,
    "--codec",
    "h264",
    "--concurrency",
    "1",
  ]);

  console.log("✅ VIDEO SELESAI!");
  console.log(`📁 Lokasi: ${outputPath}`);
  console.log(`VIDEO_OUTPUT:${outputPath}`);
}

main().catch((error) => {
  console.error("❌ Gagal:", error.message);
  process.exitCode = 1;
});
