"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  Layers,
  List,
  MoreHorizontal,
  PenLine,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createBoard,
  createFolder,
  deleteBoard,
  deleteFolder,
  exportBoard,
  importBoard,
  listBoards,
  listFolders,
  renameFolder,
  updateBoard,
} from "@/lib/boards/api";
import type { BoardFolder, BoardSummary, BoardType } from "@/lib/boards/types";
import Dropdown, { MenuDivider, MenuItem } from "@/components/app/Dropdown";
import BoardThumb from "./BoardThumb";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  buttonClass,
  formatDate,
  relativeTime,
} from "@/components/app/ui";

type TypeFilter = "all" | BoardType;
type SortKey = "updated" | "created" | "name";
type View = "grid" | "list";

const VIEW_KEY = "livepresentation:boardsView";

type Dialog =
  | { kind: "newFolder" }
  | { kind: "manageFolders" }
  | { kind: "rename"; board: BoardSummary }
  | { kind: "move"; board: BoardSummary }
  | { kind: "delete"; board: BoardSummary };

export default function BoardsLibrary() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [folders, setFolders] = useState<BoardFolder[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [folderFilter, setFolderFilter] = useState<string>(() => searchParams.get("folder") ?? "all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<View>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([listBoards(token), listFolders(token)])
      .then(([list, folderList]) => {
        setBoards(list);
        setFolders(folderList);
      })
      .catch(() => setError("Could not load your boards. Is the server running?"));
  }, [token]);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // per-viewer convenience only
    }
  }

  // Folder counts come from the server once; keep them honest locally as
  // boards move, get created or deleted.
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of boards ?? []) if (b.folderId) counts.set(b.folderId, (counts.get(b.folderId) ?? 0) + 1);
    return counts;
  }, [boards]);

  // Folder + search narrow the set first, so the type tab counts describe
  // what's actually in view rather than the whole library.
  const inScope = useMemo(() => {
    if (!boards) return null;
    const q = search.trim().toLowerCase();
    return boards
      .filter((b) => {
        if (folderFilter === "all") return true;
        if (folderFilter === "ungrouped") return !b.folderId;
        return b.folderId === folderFilter;
      })
      .filter((b) => !q || b.title.toLowerCase().includes(q));
  }, [boards, search, folderFilter]);

  const visible = useMemo(() => {
    if (!inScope) return null;
    const list = inScope.filter((b) => typeFilter === "all" || b.type === typeFilter);
    return [...list].sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [inScope, typeFilter, sort]);

  const folderName = (id: string | null) => (id ? folders.find((f) => f.id === id)?.name : undefined);
  const activeFolder = folders.find((f) => f.id === folderFilter);

  async function handleCreate(type: BoardType) {
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      const board = await createBoard(token, {
        type,
        data:
          type === "whiteboard"
            ? { pages: [{ id: crypto.randomUUID(), title: "Page 1", strokes: [] }] }
            : { slides: [] },
        folderId: activeFolder ? activeFolder.id : null,
      });
      router.push(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a new board.");
      setCreating(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setImporting(true);
    setError(null);
    try {
      const board = await importBoard(token, file);
      router.push(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file isn't a valid board export.");
      setImporting(false);
    }
  }

  async function handleExport(board: BoardSummary) {
    if (!token) return;
    try {
      await exportBoard(token, board.id, board.title);
    } catch {
      setError("Could not export that board.");
    }
  }

  const patchBoard = (id: string, patch: Partial<BoardSummary>) =>
    setBoards((prev) => prev?.map((b) => (b.id === id ? { ...b, ...patch } : b)) ?? prev);

  const typeTabs: { key: TypeFilter; label: string; count: number | undefined }[] = [
    { key: "all", label: "All", count: inScope?.length },
    { key: "whiteboard", label: "Whiteboards", count: inScope?.filter((b) => b.type === "whiteboard").length },
    { key: "presentation", label: "Presentations", count: inScope?.filter((b) => b.type === "presentation").length },
  ];

  return (
    <>
      <PageHeader
        title={activeFolder ? activeFolder.name : "My Boards"}
        description={
          activeFolder ? (
            <button onClick={() => setFolderFilter("all")} className="cursor-pointer text-[var(--lp-primary)] hover:text-[var(--lp-text)]">
              ← All boards
            </button>
          ) : (
            "Whiteboards and presentations you've saved."
          )
        }
        actions={
          <>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Upload size={15} /> {importing ? "Importing…" : "Import"}
            </Button>
            <Button onClick={() => setDialog({ kind: "newFolder" })}>
              <FolderPlus size={15} /> New folder
            </Button>
            <Dropdown
              label="Create new"
              width="w-52"
              trigger={() => (
                <span className={buttonClass("dark")}>
                  <Plus size={15} /> {creating ? "Creating…" : "New"} <ChevronDown size={14} />
                </span>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    disabled={creating}
                    onClick={() => {
                      close();
                      void handleCreate("whiteboard");
                    }}
                  >
                    <PenLine size={15} className="text-[var(--lp-text-muted)]" /> Whiteboard
                  </MenuItem>
                  <MenuItem
                    disabled={creating}
                    onClick={() => {
                      close();
                      void handleCreate("presentation");
                    }}
                  >
                    <Layers size={15} className="text-[var(--lp-text-muted)]" /> Presentation
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </>
        }
      />

      {/* ---------- Toolbar ---------- */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--lp-border)]">
          {typeTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              aria-pressed={typeFilter === tab.key}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2.5 text-sm transition-colors ${
                typeFilter === tab.key
                  ? "border-[var(--lp-text)] font-medium text-[var(--lp-text)]"
                  : "border-transparent text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-xs text-[var(--lp-text-faint)]">{tab.count}</span>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-faint)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards"
              aria-label="Search boards"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Folder"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="sm:w-48"
          >
            <option value="all">All folders</option>
            <option value="ungrouped">Not in a folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({folderCounts.get(f.id) ?? 0})
              </option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="sm:w-44">
            <option value="updated">Last edited</option>
            <option value="created">Date created</option>
            <option value="name">Name</option>
          </Select>
          <Button
            variant="ghost"
            onClick={() => setDialog({ kind: "manageFolders" })}
            disabled={folders.length === 0}
            title="Manage folders"
          >
            <Settings2 size={15} /> <span className="hidden sm:inline">Folders</span>
          </Button>
          <div className="flex rounded-lg border border-[var(--lp-border-strong)] bg-white p-0.5" role="group" aria-label="View">
            {(
              [
                { key: "grid", icon: LayoutGrid, label: "Grid view" },
                { key: "list", icon: List, label: "List view" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => changeView(key)}
                aria-label={label}
                aria-pressed={view === key}
                className={`grid h-8 w-8 cursor-pointer place-items-center rounded-md transition-colors ${
                  view === key ? "bg-[var(--lp-text)] text-white" : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
                }`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* ---------- Results ---------- */}
      {visible === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--lp-surface-3)] text-[var(--lp-text-muted)]">
            <Folder size={20} />
          </span>
          <p className="mt-4 text-sm font-medium text-[var(--lp-text)]">
            {boards && boards.length > 0 ? "No boards match these filters" : "No boards yet"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-[var(--lp-text-muted)]">
            {boards && boards.length > 0
              ? "Try a different search, type or folder."
              : "Create a whiteboard or presentation, or import a board you exported earlier."}
          </p>
          {boards && boards.length > 0 ? (
            <Button
              className="mt-5"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setFolderFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : (
            <div className="mt-5 flex gap-2">
              <Button onClick={() => handleCreate("whiteboard")} disabled={creating}>
                <Plus size={15} /> Whiteboard
              </Button>
              <Button onClick={() => handleCreate("presentation")} disabled={creating}>
                <Plus size={15} /> Presentation
              </Button>
            </div>
          )}
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((board) => (
            <div
              key={board.id}
              className="group relative overflow-hidden rounded-xl border border-[var(--lp-border)] bg-white transition-[border-color,box-shadow] hover:border-[var(--lp-primary)] hover:shadow-[0_8px_24px_-12px_rgba(24,24,26,.18)]"
            >
              <Link href={`/boards/${board.id}`} className="block text-[var(--lp-text)] hover:text-[var(--lp-text)]" aria-label={`Open ${board.title}`}>
                <BoardThumb id={board.id} type={board.type} className="aspect-[16/10] border-b border-[var(--lp-border)]" />
              </Link>
              <div className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/boards/${board.id}`}
                    className="block truncate text-sm font-medium text-[var(--lp-text)] hover:text-[var(--lp-primary)]"
                  >
                    {board.title}
                  </Link>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[var(--lp-text-muted)]">
                    {board.type === "whiteboard" ? <PenLine size={12} /> : <Layers size={12} />}
                    {relativeTime(board.updatedAt)}
                    {folderName(board.folderId) && folderFilter === "all" && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{folderName(board.folderId)}</span>
                      </>
                    )}
                  </p>
                </div>
                <BoardMenu board={board} onAction={setDialog} onExport={handleExport} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--lp-text-muted)]">
                <th className="w-[40%] px-4 py-2.5 font-medium">Name</th>
                <th className="w-[15%] px-4 py-2.5 font-medium">Type</th>
                <th className="w-[17%] px-4 py-2.5 font-medium">Folder</th>
                <th className="w-[13%] px-4 py-2.5 font-medium">Last edited</th>
                <th className="w-[15%] px-4 py-2.5 font-medium">Created</th>
                <th className="w-14 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lp-border-subtle)] border-t border-[var(--lp-border-subtle)]">
              {visible.map((board) => (
                <tr key={board.id} className="hover:bg-[var(--lp-surface-2)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/boards/${board.id}`} className="flex items-center gap-3 font-medium text-[var(--lp-text)] hover:text-[var(--lp-primary)]">
                      <BoardThumb id={board.id} type={board.type} className="h-9 w-14 flex-none rounded-md border border-[var(--lp-border)]" />
                      <span className="truncate">{board.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={board.type === "whiteboard" ? "green" : "blue"}>
                      {board.type === "whiteboard" ? "Whiteboard" : "Presentation"}
                    </Badge>
                  </td>
                  <td className="truncate px-4 py-2.5 text-[var(--lp-text-muted)]">{folderName(board.folderId) ?? <span className="text-[var(--lp-text-faint)]">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[var(--lp-text-muted)]">{relativeTime(board.updatedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[var(--lp-text-muted)]">{formatDate(board.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <BoardMenu board={board} onAction={setDialog} onExport={handleExport} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ---------- Dialogs ---------- */}
      {token && dialog?.kind === "newFolder" && (
        <NameDialog
          title="New folder"
          label="Folder name"
          submitLabel="Create folder"
          initial=""
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const folder = await createFolder(token, name);
            setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
            setDialog(null);
          }}
        />
      )}

      {token && dialog?.kind === "rename" && (
        <NameDialog
          title="Rename board"
          label="Board name"
          submitLabel="Save"
          initial={dialog.board.title}
          onClose={() => setDialog(null)}
          onSubmit={async (title) => {
            await updateBoard(token, dialog.board.id, { title });
            patchBoard(dialog.board.id, { title });
            setDialog(null);
          }}
        />
      )}

      {token && dialog?.kind === "move" && (
        <MoveDialog
          board={dialog.board}
          folders={folders}
          onClose={() => setDialog(null)}
          onSubmit={async (folderId) => {
            await updateBoard(token, dialog.board.id, { folderId });
            patchBoard(dialog.board.id, { folderId });
            setDialog(null);
          }}
        />
      )}

      {token && dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete board?"
          confirmLabel="Delete board"
          body={
            <>
              <strong className="font-medium text-[var(--lp-text)]">{dialog.board.title}</strong> will be permanently deleted.
              This can&apos;t be undone.
            </>
          }
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteBoard(token, dialog.board.id);
            setBoards((prev) => prev?.filter((b) => b.id !== dialog.board.id) ?? prev);
            setDialog(null);
          }}
        />
      )}

      {token && dialog?.kind === "manageFolders" && (
        <ManageFoldersDialog
          folders={folders}
          counts={folderCounts}
          onClose={() => setDialog(null)}
          onRename={async (id, name) => {
            const updated = await renameFolder(token, id, name);
            setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: updated.name } : f)).sort((a, b) => a.name.localeCompare(b.name)));
          }}
          onDelete={async (id) => {
            await deleteFolder(token, id);
            setFolders((prev) => prev.filter((f) => f.id !== id));
            // Boards in a deleted folder become ungrouped on the server.
            setBoards((prev) => prev?.map((b) => (b.folderId === id ? { ...b, folderId: null } : b)) ?? prev);
            if (folderFilter === id) setFolderFilter("all");
          }}
        />
      )}
    </>
  );
}

function BoardMenu({
  board,
  onAction,
  onExport,
}: {
  board: BoardSummary;
  onAction: (dialog: Dialog) => void;
  onExport: (board: BoardSummary) => void;
}) {
  return (
    <Dropdown
      label={`Actions for ${board.title}`}
      width="w-48"
      trigger={(open) => (
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
            open ? "bg-[var(--lp-border)] text-[var(--lp-text)]" : "text-[var(--lp-text-muted)] hover:bg-[var(--lp-border-subtle)] hover:text-[var(--lp-text)]"
          }`}
        >
          <MoreHorizontal size={16} />
        </span>
      )}
    >
      {(close) => {
        const pick = (fn: () => void) => () => {
          close();
          fn();
        };
        return (
          <>
            <MenuItem onClick={pick(() => onAction({ kind: "rename", board }))}>
              <Pencil size={15} className="text-[var(--lp-text-muted)]" /> Rename
            </MenuItem>
            <MenuItem onClick={pick(() => onAction({ kind: "move", board }))}>
              <FolderInput size={15} className="text-[var(--lp-text-muted)]" /> Move to folder
            </MenuItem>
            <MenuItem onClick={pick(() => onExport(board))}>
              <Download size={15} className="text-[var(--lp-text-muted)]" /> Export (JSON)
            </MenuItem>
            <MenuDivider />
            <MenuItem danger onClick={pick(() => onAction({ kind: "delete", board }))}>
              <Trash2 size={15} /> Delete
            </MenuItem>
          </>
        );
      }}
    </Dropdown>
  );
}

function NameDialog({
  title,
  label,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  submitLabel: string;
  initial: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="dark" type="submit" form="name-dialog" disabled={busy || !value.trim()}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      <form id="name-dialog" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label={label}>
          <Input autoFocus maxLength={120} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function MoveDialog({
  board,
  folders,
  onClose,
  onSubmit,
}: {
  board: BoardSummary;
  folders: BoardFolder[];
  onClose: () => void;
  onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const [folderId, setFolderId] = useState(board.folderId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={`Move “${board.title}”`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="dark"
            disabled={busy || folderId === (board.folderId ?? "")}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit(folderId || null);
              } catch {
                setError("Could not move that board.");
                setBusy(false);
              }
            }}
          >
            {busy ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Folder" hint={folders.length === 0 ? "You don't have any folders yet — create one first." : undefined}>
          <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Not in a folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--lp-text-muted)]">{body}</p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Modal>
  );
}

function ManageFoldersDialog({
  folders,
  counts,
  onClose,
  onRename,
  onDelete,
}: {
  folders: BoardFolder[];
  counts: Map<string, number>;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Manage folders" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {folders.length === 0 ? (
        <p className="text-sm text-[var(--lp-text-muted)]">No folders yet.</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {folders.map((folder) => {
            const count = counts.get(folder.id) ?? 0;
            return (
              <li key={folder.id} className="rounded-lg px-1 py-2">
                {editingId === folder.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = draft.trim();
                      if (!name) return;
                      void run(folder.id, async () => {
                        await onRename(folder.id, name);
                        setEditingId(null);
                      });
                    }}
                  >
                    <Input autoFocus maxLength={80} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Folder name" />
                    <Button type="submit" size="md" variant="dark" disabled={busyId === folder.id || !draft.trim()}>
                      Save
                    </Button>
                    <Button onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : confirmingId === folder.id ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--lp-danger-soft)] px-3 py-2">
                    <span className="text-sm text-[var(--lp-danger-strong)]">
                      Delete “{folder.name}”?{count > 0 ? ` Its ${count} board${count === 1 ? "" : "s"} will be kept, just not in a folder.` : ""}
                    </span>
                    <span className="flex gap-2">
                      <Button size="sm" onClick={() => setConfirmingId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === folder.id}
                        onClick={() =>
                          run(folder.id, async () => {
                            await onDelete(folder.id);
                            setConfirmingId(null);
                          })
                        }
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Folder size={16} className="flex-none text-[var(--lp-text-faint)]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--lp-text)]">{folder.name}</span>
                    <span className="text-xs text-[var(--lp-text-muted)]">
                      {count} board{count === 1 ? "" : "s"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setConfirmingId(null);
                        setEditingId(folder.id);
                        setDraft(folder.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setConfirmingId(folder.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
