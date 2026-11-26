
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = path.join(__dirname, "dashboard");
const OUTPUT_DIR = path.join(__dirname, "out");
const HISTORY_FILE = path.join(__dirname, "video-history.json");

app.use(express.json({ limit: "10kb" }));
app.use(express.static(DASHBOARD_DIR));
app.use("/videos", express.static(OUTPUT_DIR));

let currentJob = null;
let lastResult = null;

let history = [];

async function saveHistory() {
  const temporary = `${HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(history, null, 2), "utf8");
  await rename(temporary, HISTORY_FILE);
}

async function loadHistory() {
  try {
    const data = await readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(data);
    history = Array.isArray(parsed) ? parsed.map((job) => job.status === "processing" ? {
      ...job, status: "failed", error: "Server restarted before this job finished.", completedAt: new Date().toISOString(),
    } : job) : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Gagal membaca history:", error.message);
    }
    history = [];
  }
}

function publicJob(job) {
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    videoUrl: job.videoUrl ?? null,
    filename: job.filename ?? null,
    size: job.size ?? null,
    progress: job.progress ?? null,
    stage: job.stage ?? null,
    error: job.error ?? null,
  };
}

function runVideo(topic, jobId, options, onStage) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["auto-video.mjs", topic, "--job-id", jobId],
      {
        cwd: __dirname,
        env: { ...process.env, VIDEO_OPTIONS: JSON.stringify(options) },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      if (output.includes("STEP 2:")) onStage("rendering", 60);
      console.log(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      errorOutput += text;
      console.error(text);
    });

    child.on("error", reject);

    child.on("close", async (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `Generate gagal (exit ${code}). ` +
            errorOutput.slice(-500)
          )
        );
      }

      // Ambil lokasi MP4 unik dari auto-video.mjs
      const match = output.match(new RegExp(`VIDEO_OUTPUT:(out/ai-video-${jobId}\\.mp4)`));

      if (!match) {
        return reject(
          new Error("Nama file video tidak ditemukan.")
        );
      }

      const filename = path.basename(match[1]);
      const filePath = path.join(OUTPUT_DIR, filename);

      try {
        const info = await stat(filePath);

        if (!info.isFile() || info.size === 0) {
          throw new Error("File MP4 tidak valid.");
        }

        resolve({
          videoUrl: `/videos/${filename}`,
          filename,
          size: info.size,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// STATUS
app.get("/api/status", (req, res) => {
  res.json({
    running: currentJob !== null,
    job: currentJob ? publicJob(currentJob) : null,
    lastResult,
  });
});

// VIDEO HISTORY
app.get("/api/history", (req, res) => {
  res.json({
    videos: history
      .filter((job) => job.status === "success")
      .map(publicJob)
      .reverse(),
  });
});

// LATEST VIDEO
app.get("/api/latest-video", async (req, res) => {
  const latest = [...history]
    .reverse()
    .find((job) => job.status === "success");

  if (latest?.videoUrl) {
    return res.json({
      available: true,
      videoUrl: latest.videoUrl,
      filename: latest.filename ?? path.basename(latest.videoUrl),
      jobId: latest.id,
      updatedAt: latest.completedAt,
    });
  }

  // Kompatibilitas dengan video lama
  try {
    const file = await stat(
      path.join(OUTPUT_DIR, "ai-video.mp4")
    );

    if (file.isFile()) {
      return res.json({
        available: true,
        videoUrl: "/videos/ai-video.mp4",
        filename: "ai-video.mp4",
        updatedAt: file.mtime.toISOString(),
        size: file.size,
      });
    }
  } catch {
    // Tidak ada video lama
  }

  res.json({ available: false });
});

// GENERATE VIDEO
app.post("/api/generate", async (req, res) => {
  const topic = req.body?.topic;
  const duration = Number(req.body?.duration ?? 15);
  const aspectRatio = req.body?.aspectRatio ?? "portrait";
  const style = req.body?.style ?? "editorial";
  const voice = req.body?.voice === true;

  if (
    typeof topic !== "string" ||
    topic.trim().length < 3 ||
    topic.length > 500
  ) {
    return res.status(400).json({ error: "Topik harus 3–500 karakter." });
  }

  if (
    ![15, 30, 45, 60].includes(duration) ||
    !["portrait", "landscape", "square"].includes(aspectRatio) ||
    !["editorial", "kinetic", "minimal"].includes(style)
  ) {
    return res.status(400).json({ error: "Pilihan durasi, format, atau gaya tidak valid." });
  }

  if (currentJob) {
    return res.status(409).json({
      error: "Masih ada video yang sedang diproses.",
    });
  }

  const job = {
    id: randomUUID(),
    topic: topic.trim(),
    status: "processing",
    progress: 10,
    stage: "writing",
    createdAt: new Date().toISOString(),
  };

  currentJob = job;
  lastResult = null;

  history.push(job);

  res.status(202).json({
    message: "Video sedang diproses.",
    jobId: job.id,
  });

  // Jalankan workflow di belakang request HTTP
  (async () => {
    try {
      await saveHistory();

      const result = await runVideo(job.topic, job.id, { duration, aspectRatio, style, voice }, (stage, progress) => {
        job.stage = stage;
        job.progress = progress;
      });

      job.status = "success";
      job.videoUrl = result.videoUrl;
      job.filename = result.filename;
      job.size = result.size;
      job.completedAt = new Date().toISOString();
      job.progress = 100;
      job.stage = "complete";

      lastResult = {
        status: "success",
        jobId: job.id,
        videoUrl: job.videoUrl,
        filename: job.filename,
      };

      console.log("✅ Video berhasil:", result.filename);

    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.completedAt = new Date().toISOString();
      job.stage = "failed";

      lastResult = {
        status: "failed",
        jobId: job.id,
        error: error.message,
      };

      console.error("❌ Video gagal:", error.message);

    } finally {
      try {
        await saveHistory();
      } catch (error) {
        console.error(
          "Gagal menyimpan history:",
          error.message
        );
      }

      currentJob = null;
    }
  })();
});

// START SERVER
await mkdir(OUTPUT_DIR, { recursive: true });
await loadHistory();

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `✅ AI Video Factory aktif di port ${PORT}`
  );
});
