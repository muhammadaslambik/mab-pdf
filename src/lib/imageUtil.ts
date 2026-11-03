export type Embeddable = { data: Uint8Array; mime: 'image/png' | 'image/jpeg' };

export const mimeFromName = (name: string): string => {
  const e = name.toLowerCase().split('.').pop() ?? '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf' } as Record<string, string>)[e] ?? '';
};

/** Ubah gambar apa pun yang bisa didekode browser menjadi PNG/JPEG (format yang dipahami pdf-lib). */
export async function toEmbeddable(bytes: Uint8Array, mime: string): Promise<Embeddable | null> {
  const m = mime.toLowerCase();
  if (m === 'image/png') return { data: bytes, mime: 'image/png' };
  if (m === 'image/jpeg' || m === 'image/jpg') return { data: bytes, mime: 'image/jpeg' };
  if (!/gif|bmp|webp/.test(m)) return null;
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: m }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('x'))), 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' };
  } catch { return null; }
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
