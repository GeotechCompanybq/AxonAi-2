import type { Task } from "@/types";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";

const TASKS_STORAGE_KEY = "AxonTasks";

function readLocal(): Task[] {
  try {
    const tasksJson = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!tasksJson) return [];
    const parsedTasks = JSON.parse(tasksJson) as Task[];
    if (
      Array.isArray(parsedTasks) &&
      parsedTasks.every((task) => typeof task.id === "string")
    ) {
      return parsedTasks;
    }
    localStorage.removeItem(TASKS_STORAGE_KEY);
    return [];
  } catch {
    try {
      localStorage.removeItem(TASKS_STORAGE_KEY);
    } catch {}
    return [];
  }
}

function writeLocal(tasks: Task[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
}

function getUidFromLocal(): string | null {
  try {
    const u = auth?.currentUser?.uid;
    if (u) return u;
  } catch {}
  try {
    const hc = localStorage.getItem("honeycore-sdk");
    if (hc) {
      const parsed = JSON.parse(hc);
      if (parsed && typeof parsed.uid === "string" && parsed.uid.length > 0)
        return parsed.uid;
    }
  } catch {}
  return null;
}

async function readCloud(uid: string): Promise<Task[]> {
  try {
    const col = collection(db, `users/${uid}/tasks`);
    const snap = await getDocs(col);
    const list: Task[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      list.push({
        id: data?.id || d.id,
        name: data?.name,
        description: data?.description,
        category: data?.category,
        priority: data?.priority,
        dueDate: data?.dueDate || undefined,
        status: data?.status || "todo",
        subTasks: data?.subTasks,
      } as Task);
    });
    return list;
  } catch {
    return [];
  }
}

async function writeCloud(uid: string, tasks: Task[]): Promise<void> {
  try {
    const base = `users/${uid}/tasks`;
    for (const t of tasks) {
      const id = String(t.id || `${t.name}|${t.dueDate || ""}`);
      await setDoc(
        doc(db, base, id),
        { ...t, id, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn("Failed to write tasks to Firestore", e);
  }
}

export function getTasksFromLocalStorage(): Task[] {
  if (typeof window === "undefined") return [];
  const tasks = readLocal();
  const uid = getUidFromLocal();
  if (uid) {
    // Background sync from cloud → local so next load is fresh
    void readCloud(uid).then((cloud) => {
      if (cloud && cloud.length) writeLocal(cloud);
    });
  }
  return tasks;
}

export function saveTasksToLocalStorage(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  writeLocal(tasks);
  const uid = getUidFromLocal();
  if (uid) void writeCloud(uid, tasks);
}
