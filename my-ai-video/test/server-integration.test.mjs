import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { ensureBrowser } from "@remotion/renderer";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sandboxDir = await mkdtemp(path.join(tmpdir(), "ai-video-factory-test-"));
const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;
let completedJob;

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function getBrowserExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_PATH,
    ...["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]
      .flatMap((name) => (process.env.PATH ?? "").split(path.delimiter).map((directory) => path.join(directory, name))),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try another installed browser.
    }
  }

  const browser = await ensureBrowser();
  if (browser.type === "no-browser" || browser.type === "version-mismatch") {
    throw new Error("Remotion could not install a browser for the dashboard test.");
  }
  return browser.path;
}

async function startServer() {
  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: sandboxDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let errors = "";
  serverProcess.stderr.on("data", (chunk) => {
    errors += chunk;
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited during startup: ${errors}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Server did not start: ${errors}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => serverProcess.once("exit", resolve));
}

async function waitForCompletedJob(jobId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/status`);
    const status = await response.json();

    if (!status.running && status.lastResult?.jobId === jobId) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Video job did not finish");
}

before(async () => {
  await cp(path.join(projectDir, "server.mjs"), path.join(sandboxDir, "server.mjs"));
  await cp(path.join(projectDir, "dashboard"), path.join(sandboxDir, "dashboard"), {
    recursive: true,
  });
  await symlink(path.join(projectDir, "node_modules"), path.join(sandboxDir, "node_modules"));
  await mkdir(path.join(sandboxDir, "out"));

  await writeFile(
    path.join(sandboxDir, "auto-video.mjs"),
    `import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const args = process.argv.slice(2);
const jobIdFlag = args.indexOf("--job-id");
const jobId = args[jobIdFlag + 1];
args.splice(jobIdFlag, 2);
if (!/^[a-f0-9-]{36}$/.test(jobId) || args.join(" ") !== "safe test topic") {
  process.exit(2);
}
const outputPath = \`out/ai-video-\${jobId}.mp4\`;
await mkdir("out", { recursive: true });
const renderer = spawn("ffmpeg", [
  "-loglevel", "error",
  "-f", "lavfi",
  "-i", "color=c=black:s=16x16:d=0.1",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-y", outputPath,
]);
const renderCode = await new Promise((resolve) => renderer.once("exit", resolve));
if (renderCode !== 0) process.exit(renderCode);
console.log(\`VIDEO_OUTPUT:\${outputPath}\`);
`,
    "utf8",
  );

  await startServer();
});

after(async () => {
  await stopServer();
});

test("tracks a unique video through status, history, preview, and download", async () => {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "safe test topic", duration: 30, aspectRatio: "square", style: "kinetic" }),
  });
  assert.equal(response.status, 202);

  const accepted = await response.json();
  assert.match(accepted.jobId, /^[a-f0-9-]{36}$/);

  const status = await waitForCompletedJob(accepted.jobId);
  const filename = `ai-video-${accepted.jobId}.mp4`;
  const videoUrl = `/videos/${filename}`;
  assert.deepEqual(status.lastResult, {
    status: "success",
    jobId: accepted.jobId,
    videoUrl,
    filename,
  });

  const historyResponse = await fetch(`${baseUrl}/api/history`);
  const history = await historyResponse.json();
  assert.equal(history.videos.length, 1);
  assert.equal(history.videos[0].videoUrl, videoUrl);
  assert.equal(history.videos[0].filename, filename);
  assert.ok(history.videos[0].size > 0);

  const latestResponse = await fetch(`${baseUrl}/api/latest-video`);
  const latest = await latestResponse.json();
  assert.equal(latest.videoUrl, videoUrl);
  assert.equal(latest.filename, filename);

  const videoResponse = await fetch(`${baseUrl}${videoUrl}`);
  assert.equal(videoResponse.status, 200);
  assert.ok((await videoResponse.arrayBuffer()).byteLength > 0);

  completedJob = { filename, videoUrl };
});

test("rejects unsupported render options before starting a job", async () => {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "safe test topic", duration: 999 }),
  });
  assert.equal(response.status, 400);
});

test("reloads persisted history after a server restart", async () => {
  await stopServer();
  await startServer();

  const historyResponse = await fetch(`${baseUrl}/api/history`);
  const history = await historyResponse.json();
  assert.equal(history.videos.length, 1);
  assert.equal(history.videos[0].videoUrl, completedJob.videoUrl);
  assert.equal(history.videos[0].filename, completedJob.filename);

  const savedHistory = JSON.parse(
    await readFile(path.join(sandboxDir, "video-history.json"), "utf8"),
  );
  assert.equal(savedHistory[0].filename, completedJob.filename);
  assert.equal(savedHistory[0].status, "success");
});

test("renders preview and download links in the dashboard", async () => {
  const chromium = await getBrowserExecutable();
  const browser = spawn(
    chromium,
    [
      "--headless",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--user-data-dir=${path.join(sandboxDir, "chromium-profile")}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `${baseUrl}/`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let browserErrors = "";
  const debuggingUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Chromium did not start: ${browserErrors}`)),
      5000,
    );

    browser.stderr.on("data", (chunk) => {
      browserErrors += chunk;
      const match = browserErrors.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    browser.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  try {
    const debugPort = new URL(debuggingUrl).port;
    let page;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        .then((response) => response.json());
      page = targets.find((target) => target.url.startsWith(baseUrl));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(page, "Dashboard browser target was not created");

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const html = await new Promise((resolve, reject) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result.result.value);
      });
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression: "document.documentElement.outerHTML",
          returnByValue: true,
        },
      }));
    });
    socket.close();

    assert.match(html, new RegExp(`src="${completedJob.videoUrl}`));
    assert.match(html, new RegExp(`href="${completedJob.videoUrl}"`));
    assert.match(html, new RegExp(`download="${completedJob.filename}"`));
  } finally {
    browser.kill("SIGTERM");
    await new Promise((resolve) => browser.once("exit", resolve));
  }
});

test("refuses to start with corrupt history and preserves the file", async () => {
  await stopServer();
  const historyPath = path.join(sandboxDir, "video-history.json");
  const invalidHistory = "{invalid history";
  await writeFile(historyPath, invalidHistory, "utf8");

  const processWithCorruptHistory = spawn(process.execPath, ["server.mjs"], {
    cwd: sandboxDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const exitCode = await new Promise((resolve) => processWithCorruptHistory.once("exit", resolve));
  assert.notEqual(exitCode, 0);
  assert.equal(await readFile(historyPath, "utf8"), invalidHistory);
});
