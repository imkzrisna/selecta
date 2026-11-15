export type PhotoKind = "image" | "pdf" | "video";

export type PhotoEntry = {
  path: string;
  name: string;
  kind: PhotoKind;
};

export type Stage = "setup" | "preparing" | "sorting" | "review" | "export" | "done";

export type ExitDirection = "left" | "right" | null;

export type HistoryEntry = { type: "reject" | "select"; photo: PhotoEntry };

export type Toast = { id: number; message: string };
