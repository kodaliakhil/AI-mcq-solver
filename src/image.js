const MAX_SIDE = 1600; // plenty for reading text, keeps uploads small & fast

function drawScaled(source, w, h) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToPayload(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

/** Grab the current frame from a <video> element. */
export function captureFromVideo(video) {
  return canvasToPayload(drawScaled(video, video.videoWidth, video.videoHeight));
}

/** Compress a picked/captured File. */
export async function fileToPayload(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
  bitmap.close?.();
  return canvasToPayload(canvas);
}
