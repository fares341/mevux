"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as W from "@/lib/work";

type R = { ok?: string; error?: string };
const run = async (fn: () => Promise<unknown>, ok: string, paths: string[]): Promise<R> => {
  try { await fn(); paths.forEach((p) => revalidatePath(p)); return { ok }; }
  catch (e) { return { error: e instanceof Error ? e.message : "حصل خطأ." }; }
};
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createTaskAction(_: R, fd: FormData) {
  const u = await requireUser();
  return run(() => W.createTask(u, { projectId: s(fd, "projectId"), title: s(fd, "title"), details: s(fd, "details") || undefined, assigneeId: s(fd, "assigneeId") || undefined, dueDate: s(fd, "dueDate") ? new Date(s(fd, "dueDate")) : null }), "تمت إضافة المهمة.", ["/tasks", "/follow"]);
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
  return run(() => W.fileComplaint(u, { projectId: s(fd, "projectId"), againstId: s(fd, "againstId"), text: s(fd, "text"), evidence: s(fd, "evidence") || undefined }), "اتبعتت الشكوى للمدير. اسمك مش هيظهر للشخص.", ["/complaints"]);
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
