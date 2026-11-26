import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import sample from "./video-data.json";

export type VideoData = {
  brand: string;
  background: string;
  textColor: string;
  accentColor: string;
  scenes: { title: string; subtitle: string; image?: string }[];
  duration?: number;
  aspectRatio?: "portrait" | "landscape" | "square";
  style?: "editorial" | "kinetic" | "minimal";
  narration?: string;
};

export const MyComposition: React.FC<{ data?: VideoData }> = ({ data = sample as VideoData }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const scenes: VideoData["scenes"] = data.scenes.length ? data.scenes : sample.scenes;
  const sceneDuration = durationInFrames / scenes.length;
  const sceneIndex = Math.min(Math.floor(frame / sceneDuration), scenes.length - 1);
  const scene = scenes[sceneIndex];
  const localFrame = frame - sceneIndex * sceneDuration;
  const reveal = interpolate(localFrame, [0, Math.min(14, sceneDuration / 4)], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(localFrame, [sceneDuration - Math.min(12, sceneDuration / 4), sceneDuration], [1, 0], { extrapolateLeft: "clamp" });
  const progress = Math.min(1, localFrame / sceneDuration);
  const portrait = height > width;
  const padding = Math.round(width * 0.08);
  const style = data.style ?? "editorial";
  const accent = data.accentColor || "#ff814a";

  return (
    <AbsoluteFill style={{ background: data.background, color: data.textColor, fontFamily: "Arial, sans-serif", overflow: "hidden" }}>
      {scene.image && (/\.(mp4|webm)$/i.test(scene.image)
        ? <Sequence from={Math.floor(sceneIndex * sceneDuration)} durationInFrames={Math.ceil(sceneDuration)}><OffthreadVideo src={staticFile(scene.image)} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} /></Sequence>
        : <Img src={staticFile(scene.image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: style === "minimal" ? 0.25 : 0.45, transform: `scale(${1 + progress * 0.08})` }} />)}
      <AbsoluteFill style={{ background: style === "kinetic" ? `linear-gradient(145deg, ${data.background}dd, transparent 65%, ${accent}55)` : `linear-gradient(180deg, ${data.background}88, ${data.background}dd)` }} />
      {style !== "minimal" && <div style={{ position: "absolute", width: width * 0.75, height: width * 0.75, borderRadius: "50%", border: `2px solid ${accent}55`, right: -width * 0.32, top: height * 0.2, transform: `scale(${1 + progress * 0.2}) rotate(${progress * 40}deg)` }} />}
      <div style={{ position: "absolute", top: padding, left: padding, right: padding, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: width * 0.025, fontWeight: 800, letterSpacing: 3, color: accent }}>
        <span>{data.brand}</span><span>{String(sceneIndex + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span>
      </div>
      <div style={{ position: "absolute", top: portrait ? "33%" : "24%", left: padding, right: padding, opacity: reveal * exit, transform: `translateY(${(1 - reveal) * (style === "kinetic" ? 100 : 50)}px)` }}>
        <div style={{ width: width * 0.12, height: 7, background: accent, marginBottom: width * 0.06 }} />
        <div style={{ fontSize: width * (portrait ? 0.082 : 0.065), fontWeight: 900, lineHeight: 1.06, letterSpacing: -width * 0.004, maxWidth: width * 0.84 }}>{scene.title}</div>
      </div>
      <div style={{ position: "absolute", bottom: portrait ? height * 0.14 : height * 0.16, left: padding, right: padding, padding: `${width * 0.025}px ${width * 0.035}px`, background: `${data.background}dd`, borderLeft: `5px solid ${accent}`, borderRadius: 12, fontSize: width * 0.035, fontWeight: 700, lineHeight: 1.3, opacity: reveal * exit }}>
        {scene.subtitle}
      </div>
      <div style={{ position: "absolute", bottom: padding, left: padding, width: width - 2 * padding, height: 5, background: `${data.textColor}33` }}><div style={{ height: "100%", width: `${((frame + 1) / durationInFrames) * 100}%`, background: accent }} /></div>
      {data.narration && <Audio src={staticFile(data.narration)} />}
    </AbsoluteFill>
  );
};
