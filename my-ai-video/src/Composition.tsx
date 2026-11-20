
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import videoData from "./video-data.json";

export const MyComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scenes = videoData.scenes;
  const sceneDuration = 5 * fps;

  const sceneIndex = Math.min(
    Math.floor(frame / sceneDuration),
    scenes.length - 1
  );

  const scene = scenes[sceneIndex];
  const localFrame = frame - sceneIndex * sceneDuration;

  const opacity = interpolate(
    localFrame,
    [0, 12, sceneDuration - 12, sceneDuration],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const translateY = interpolate(
    localFrame,
    [0, 18],
    [90, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: videoData.background,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial, sans-serif",
        color: videoData.textColor,
        padding: 90,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 90,
          fontSize: 30,
          letterSpacing: 8,
          color: videoData.accentColor,
          fontWeight: 700,
        }}
      >
        {videoData.brand}
      </div>

      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 105,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: -4,
          }}
        >
          {scene.title}
        </div>

        <div
          style={{
            fontSize: 42,
            marginTop: 45,
            color: videoData.accentColor,
            lineHeight: 1.35,
          }}
        >
          {scene.subtitle}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 100,
          fontSize: 28,
          letterSpacing: 5,
          opacity: 0.5,
        }}
      >
        MADE WITH CODE ✦
      </div>
    </AbsoluteFill>
  );
};
