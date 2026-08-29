// Komprimiert ein Kamerafoto clientseitig vor dem Versand: unkomprimierte
// Handyfotos (5-12MB) sprengen zuverlässig Vercels hartes 4,5MB-Payload-
// Limit für Serverless Functions (siehe README.md im Hauptprojekt
// Sm@rtCraft, wo genau das erst in Produktion aufgefallen ist) - hier
// vorsorglich gleich mit übernommen statt es erst live zu entdecken.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale) || 1;
      const height = Math.round(img.height * scale) || 1;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: 'image/jpeg', previewUrl: dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Foto konnte nicht gelesen werden.'));
    };

    img.src = objectUrl;
  });
}
