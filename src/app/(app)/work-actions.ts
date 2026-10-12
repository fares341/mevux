"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as W from "@/lib/work";
import { checkFile, saveFile, removeStored } from "@/lib/storage";

type R = { ok?: string; error?: string };
const run = async (fn: () => Promise<unknown>, ok: string, paths: string[]): Promise<R> => {
  try { await fn(); paths.forEach((p) => revalidatePath(p)); return { ok }; }
  catch (e) { return { error: e instanceof Error ? e.message : "حصل خطأ." }; }
};
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createTaskAction(_: R, fd: FormData) {
  const u = await requireUser();
  return run(() => W.createTask(u, { projectId: s(fd, "projectId"), title: s(fd, "title"), details: s(fd, "details") || undefined, assigneeIds: fd.getAll("assigneeIds").map(String).filter(Boolean), assigneeId: s(fd, "assigneeId") || undefined, dueDate: s(fd, "dueDate") ? new Date(s(fd, "dueDate")) : null }), "تمت إضافة المهمة.", ["/tasks", "/follow"]);
}
export async function taskStatusAction(fd: FormData) {
  const u = await requireUser();
  const st = s(fd, "status") as W.TaskSt;
  if (!(st in W.TASK_ST)) return;
  await run(() => W.setTaskStatus(u, s(fd, "id"), st), "", ["/tasks", "/follow"]);
}
export async function addUpdateAction(_: R, fd: FormData) {
  const u = await requireUser();
  return run(() => W.addUpdate(u, s(fd, "projectId") || null, s(fd, "text")), "اتسجل التحديث.", ["/follow"]);
}
export async function fileComplaintAction(_: R, fd: FormData) {
  const u = await requireUser();
  // Up to 6 evidence files (images, docs, video) + one optional recorded voice note.
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const voice = fd.get("voice");
  const all = [...files.map((f) => ({ f, isVoice: false })), ...(voice instanceof File && voice.size > 0 ? [{ f: voice, isVoice: true }] : [])];
  if (files.length > 6) return { error: "أقصى حاجة 6 ملفات في الشكوى." };
  if (all.reduce((a, x) => a + x.f.size, 0) > 50 * 1024 * 1024) return { error: "مجموع المرفقات أكبر من 50 ميجا." };
  for (const { f } of all) { const err = checkFile(f); if (err) return { error: `${f.name}: ${err}` }; }
  const saved: W.EvidenceFile[] = [];
  for (const { f, isVoice } of all) saved.push({ ...(await saveFile(f)), isVoice });
  const r = await run(() => W.fileComplaint(u, { projectId: s(fd, "projectId"), againstId: s(fd, "againstId"), text: s(fd, "text"), evidence: s(fd, "evidence") || undefined, files: saved }),
    `اتبعتت الشكوى للمدير${saved.length ? ` ومعاها ${saved.length} مرفق` : ""}. اسمك مش هيظهر للشخص.`, ["/complaints"]);
  if (r.error) for (const f of saved) await removeStored(f.stored);
  return r;
}
export async function respondComplaintAction(_: R, fd: FormData) {
  const u = await requireUser();
  return run(() => W.respondComplaint(u, s(fd, "id"), s(fd, "response")), "اتبعت ردك.", ["/complaints"]);
}
export async function decideComplaintAction(fd: FormData) {
  const u = await requireUser();
  const d = s(fd, "decision") as "RESOLVED" | "DISMISSED" | "DEDUCT";
  await run(() => W.decideComplaint(u, s(fd, "id"), d, s(fd, "note") || undefined, (s(fd, "dedType") || undefined) as never), "", ["/complaints", "/projects"]);
}
