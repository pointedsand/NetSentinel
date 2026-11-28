export function initialWindowBounds(workArea) {
  const minWidth = 1024, minHeight = 650;
  const width = Math.max(minWidth, Math.min(1280, workArea.width));
  const height = Math.max(minHeight, Math.min(800, workArea.height));
  return {
    width, height, minWidth, minHeight,
    x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2))
  };
}
