"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { addTodo, toggleTodo, deleteTodo, updateTodo } from "@/lib/todos";
import { cairoToDate } from "@/lib/tz";

type R = { ok?: string; error?: string };
const v = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => { revalidatePath("/tasks"); revalidatePath("/"); };

export async function addTodoAction(_: R, fd: FormData): Promise<R> {
  const u = await requireUser();
  try {
    const due = v(fd, "due") ? cairoToDate(v(fd, "due")) : null;
    await addTodo(u, { title: v(fd, "title"), details: v(fd, "details"), kind: v(fd, "kind"), dueAt: due });
    refresh();
    return { ok: v(fd, "kind") === "IDEA" ? "اتحفظت الفكرة." : "اتضافت المهمة." };
  } catch (e) { return { error: e instanceof Error ? e.message : "حصل خطأ." }; }
}
export async function toggleTodoAction(fd: FormData) { const u = await requireUser(); await toggleTodo(u, v(fd, "id")).catch(() => {}); refresh(); }
export async function deleteTodoAction(fd: FormData) { const u = await requireUser(); await deleteTodo(u, v(fd, "id")); refresh(); }
export async function editTodoAction(fd: FormData) {
  const u = await requireUser();
  await updateTodo(u, v(fd, "id"), { title: v(fd, "title"), details: v(fd, "details"), dueAt: v(fd, "due") ? cairoToDate(v(fd, "due")) : null, kind: v(fd, "kind") || undefined });
  refresh();
}
