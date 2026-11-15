interface ImageFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pan percentages are relative to the image, but the bounds cover the stage. */
export function artworkViewport(frame: ImageFrame, focus: { x: number; y: number; zoom: number }) {
  const stageWidth = frame.width + 2 * frame.left;
  const stageHeight = frame.height + 2 * frame.top;
  // A very wide/tall stage may need more than the requested zoom to cover it.
  const zoom = Math.max(focus.zoom, stageWidth / frame.width, stageHeight / frame.height);
  const pan = (coordinate: number, imageSize: number, stageSize: number) => {
    const limit = Math.max(0, 0.5 - stageSize / (2 * zoom * imageSize));
    return Math.max(-limit, Math.min(limit, 0.5 - coordinate)) * 100;
  };
  return {
    zoom,
    x: pan(focus.x, frame.width, stageWidth),
    y: pan(focus.y, frame.height, stageHeight),
  };
}
