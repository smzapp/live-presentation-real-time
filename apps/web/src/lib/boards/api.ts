import { API_URL } from "@/lib/room/api";
import type { Board, BoardSummary, BoardType } from "./types";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function listBoards(token: string, type?: BoardType): Promise<BoardSummary[]> {
  const qs = type ? `?type=${type}` : "";
  const res = await fetch(`${API_URL}/boards${qs}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Could not load boards");
  return res.json();
}

export async function getBoard(token: string, id: string): Promise<Board> {
  const res = await fetch(`${API_URL}/boards/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Could not load board");
  return res.json();
}

export async function createBoard(
  token: string,
  input: { type: BoardType; title?: string; data: Board["data"] },
): Promise<Board> {
  const res = await fetch(`${API_URL}/boards`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Could not create board");
  return res.json();
}

export async function updateBoard(
  token: string,
  id: string,
  input: { title?: string; data?: Board["data"] },
): Promise<Board> {
  const res = await fetch(`${API_URL}/boards/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Could not save board");
  return res.json();
}

export async function deleteBoard(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/boards/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) throw new Error("Could not delete board");
}

export async function exportBoard(token: string, id: string, title: string): Promise<void> {
  const res = await fetch(`${API_URL}/boards/${id}/export`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Could not export board");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "board"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importBoard(token: string, file: File): Promise<Board> {
  const text = await file.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON");
  }
  const res = await fetch(`${API_URL}/boards/import`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("That file isn't a valid board export");
  return res.json();
}
