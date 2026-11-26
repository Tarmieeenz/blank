import React from "react";
import { Composition } from "remotion";
import { MyComposition, type VideoData } from "./Composition";
import sample from "./video-data.json";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MyComp"
    component={MyComposition}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ data: sample as VideoData }}
    calculateMetadata={({ props }) => {
      const data = props.data as VideoData;
      const dimensions = data.aspectRatio === "landscape" ? [1920, 1080] : data.aspectRatio === "square" ? [1080, 1080] : [1080, 1920];
      return { durationInFrames: Math.round((data.duration ?? 15) * 30), width: dimensions[0], height: dimensions[1] };
    }}
  />
);
