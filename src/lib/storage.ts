import "server-only";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

export const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["pdf","doc","docx","xls","xlsx","ppt","pptx","csv","txt","md","json","zip","rar","7z","png","jpg","jpeg","webp","gif","mp4","mov","mp3","m4a","ogg","webm","wav","fig","sketch","n8n"]);
const dir = () => process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");

export function checkFile(f: File): string | null {
  if (!f || typeof f === "string" || f.size === 0) return "اختر ملفاً.";
  if (f.size > MAX_BYTES) return "حجم الملف أكبر من 25 ميجا.";
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED.has(ext)) return `نوع الملف .${ext} غير مسموح.`;
  return null;
}

export async function saveFile(f: File) {
  await mkdir(/*turbopackIgnore: true*/ dir(), { recursive: true });
  const stored = randomUUID(); // never use the user's name on disk
  await writeFile(path.join(/*turbopackIgnore: true*/ dir(), stored), Buffer.from(await f.arrayBuffer()), { mode: 0o600 });
  return { stored, name: f.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200), size: f.size, mime: f.type || "application/octet-stream" };
}

export async function readStored(stored: string) {
  if (!/^[0-9a-f-]{36}$/.test(stored)) throw new Error("bad name");
  return readFile(path.join(/*turbopackIgnore: true*/ dir(), stored));
}
export async function removeStored(stored: string) {
  if (!/^[0-9a-f-]{36}$/.test(stored)) return;
  try { await unlink(path.join(/*turbopackIgnore: true*/ dir(), stored)); } catch {}
}
