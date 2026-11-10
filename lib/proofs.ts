import { supabaseBrowser } from "./supabase/client";
import type { TaskProof } from "./types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/url";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-80) || "file";
}

/**
 * Uploads one proof file to proofs/{userId}/{taskId}/... with progress,
 * then records it in task_proofs. Storage policies only allow writing
 * into the caller's own folder.
 */
export async function uploadProofFile(
  file: File,
  userId: string,
  taskId: string,
  onProgress: (fraction: number) => void,
): Promise<TaskProof> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 50 MB. Add it as a link instead.`);
  }
  const sb = supabaseBrowser();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error("Your session has expired. Sign in again.");

  const path = `${userId}/${taskId}/${Date.now()}-${safeName(file.name)}`;
  const url = `${SUPABASE_URL}/storage/v1/object/proofs/${path.split("/").map(encodeURIComponent).join("/")}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "Upload failed.";
      try {
        msg = JSON.parse(xhr.responseText).message || msg;
      } catch {}
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });

  const { data, error } = await sb
    .from("task_proofs")
    .insert({
      task_id: taskId,
      user_id: userId,
      kind: "file",
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) {
    await sb.storage.from("proofs").remove([path]);
    throw new Error(error.message);
  }
  return data as TaskProof;
}

export async function addProofLink(url: string, userId: string, taskId: string): Promise<TaskProof> {
  const { data, error } = await supabaseBrowser()
    .from("task_proofs")
    .insert({ task_id: taskId, user_id: userId, kind: "link", url })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TaskProof;
}

export async function removeProof(proof: TaskProof) {
  const sb = supabaseBrowser();
  const { error } = await sb.from("task_proofs").delete().eq("id", proof.id);
  if (error) throw new Error(error.message);
  if (proof.storage_path) await sb.storage.from("proofs").remove([proof.storage_path]);
}

/** Signed URLs (1 hour) for every file proof, keyed by storage path. */
export async function signProofs(proofs: TaskProof[]): Promise<Record<string, string>> {
  const paths = proofs.filter((p) => p.kind === "file" && p.storage_path).map((p) => p.storage_path!);
  if (!paths.length) return {};
  const { data } = await supabaseBrowser().storage.from("proofs").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}
