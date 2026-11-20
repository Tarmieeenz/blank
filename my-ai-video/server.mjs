
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const app = express();
const PORT = 3001;

// Batasi ukuran request
app.use(express.json({ limit: "10kb" }));
app.use(express.static("dashboard"));
app.use("/videos", express.static("out"));

// Hanya izinkan satu pekerjaan sekaligus
let currentJob = null;
let lastResult = null;


app.get("/api/latest-video", async (req, res) => {
  try {
    const file = await stat("out/ai-video.mp4");

    if (!file.isFile()) {
      return res.json({ available: false });
    }

    res.json({
      available: true,
      videoUrl: "/videos/ai-video.mp4",
      updatedAt: file.mtime.toISOString(),
      size: file.size,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.json({ available: false });
    }

    console.error("Gagal mengecek video:", error);
    res.status(500).json({
      error: "Gagal membaca file video.",
    });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    running: currentJob !== null,
    job: currentJob,
    lastResult: lastResult,
  });
});

app.post("/api/generate", (req, res) => {
  const topic = req.body?.topic;

  if (typeof topic !== "string" ||
      topic.trim().length < 3 ||
      topic.length > 500) {
    return res.status(400).json({
      error: "Topik harus berisi 3–500 karakter.",
    });
  }

  if (currentJob) {
    return res.status(409).json({
      error: "Masih ada video yang sedang diproses.",
    });
  }

  const jobId = randomUUID();
  const outputName = `${jobId}.mp4`;

  currentJob = {
    id: jobId,
    status: "processing",
    topic: topic.trim(),
  };

  const child = spawn(
    process.execPath,
    ["auto-video.mjs", topic.trim()],
    {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "pipe",
    }
  );

  child.stdout.on("data", (data) => {
    console.log(data.toString());
  });

  child.stderr.on("data", (data) => {
    console.error(data.toString());
  });

  child.on("error", (error) => {
    console.error("Gagal menjalankan AI:", error.message);
    currentJob = null;
  });

  
child.on("close", (code) => {
  console.log("Video process exit code:", code);

  if (code === 0) {
    lastResult = {
      status: "success",
      jobId,
      videoUrl: "/videos/ai-video.mp4",
    };

    console.log("✅ Video berhasil dibuat!");
  } else {
    lastResult = {
      status: "failed",
      jobId,
      error: "Proses AI atau rendering gagal.",
    };

    console.log("❌ Video gagal dibuat.");
  }

  currentJob = null;
});


  res.status(202).json({
    message: "Video sedang diproses.",
    jobId,
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`AI Video Server aktif di port ${PORT}`);
});
