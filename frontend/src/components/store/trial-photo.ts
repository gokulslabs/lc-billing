import { maxPhotoBytes } from "@/lib/trial-room";

export const trialPhotoFormats = "image/jpeg,image/png,image/webp";

export async function prepareTrialPhoto(file: File) {
  if (!trialPhotoFormats.split(",").includes(file.type) || file.size > maxPhotoBytes) {
    throw new Error("Choose a JPG, PNG or WebP photo up to 12 MB.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("We couldn't open this photo. Try a different image.");
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (Math.min(width, height) < 128 || Math.max(width, height) / Math.min(width, height) > 5) {
      throw new Error("Choose a larger photo with your face and outfit area in view.");
    }
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't prepare the photo. Try another browser.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
