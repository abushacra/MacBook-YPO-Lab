"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Spinner } from "@/components/submit-button";

type Item = {
  key: string;
  fileName: string;
  previewUrl: string | null;
  status: "uploading" | "done" | "error";
  path?: string;
  error?: string;
};

type Props = {
  /** Name of the hidden inputs carrying finished storage paths to the action. */
  name: string;
  bucket: "service-photos" | "receipts";
  /** Label for the file-picker button, e.g. "Choose file". */
  browseLabel: string;
  multiple?: boolean;
  maxFiles?: number;
  accept?: string;
  onBusyChange?: (busy: boolean) => void;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

/**
 * Vercel refuses request bodies over 4.5MB, so anything that survives
 * downscaling has to be rejected here with a message rather than failing
 * halfway through the upload.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = "image/*";

/**
 * Phone cameras produce 3-5MB files, which crawl over a cellular connection.
 * Downscaling to 1600px in the browser keeps the upload small enough to finish
 * while the engineer is still typing the description. PDFs, HEIC and anything
 * else the browser cannot decode are sent through untouched.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function MediaUploader({
  name,
  bucket,
  browseLabel,
  multiple = false,
  maxFiles = 8,
  accept = "image/*,application/pdf",
  onBusyChange,
}: Props) {
  const inputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const objectUrls = useRef<string[]>([]);

  const busy = items.some((item) => item.status === "uploading");
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const upload = useCallback(
    async (key: string, file: File) => {
      const body = new FormData();
      body.append("bucket", bucket);
      body.append("file", file);

      try {
        const response = await fetch("/api/uploads", { method: "POST", body });
        const payload = (await response.json()) as { path?: string; error?: string };

        setItems((current) =>
          current.map((item) =>
            item.key !== key
              ? item
              : response.ok && payload.path
                ? { ...item, status: "done", path: payload.path }
                : { ...item, status: "error", error: payload.error ?? "Upload failed." },
          ),
        );
      } catch {
        setItems((current) =>
          current.map((item) =>
            item.key === key
              ? { ...item, status: "error", error: "No connection. Remove and try again." }
              : item,
          ),
        );
      }
    },
    [bucket],
  );

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const room = Math.max(0, (multiple ? maxFiles : 1) - items.length);
    const picked = Array.from(fileList).slice(0, room);

    for (const original of picked) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const file = await shrinkImage(original);
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) objectUrls.current.push(previewUrl);

      if (file.size > MAX_UPLOAD_BYTES) {
        setItems((current) => [
          ...current,
          {
            key,
            fileName: file.name,
            previewUrl,
            status: "error",
            error: `${formatSize(file.size)} — too big. Max 4MB.`,
          },
        ]);
        continue;
      }

      setItems((current) => [
        ...current,
        { key, fileName: file.name, previewUrl, status: "uploading" },
      ]);

      void upload(key, file);
    }
  }

  function remove(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  const atCapacity = items.length >= (multiple ? maxFiles : 1);

  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="relative aspect-square overflow-hidden rounded-xl border border-hairline bg-white"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview, never optimized
                <img src={item.previewUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <DocumentIcon />
                  <span className="line-clamp-2 text-[11px] font-semibold break-all text-muted">
                    {item.fileName}
                  </span>
                </div>
              )}

              {item.status !== "done" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/85 p-2 text-center">
                  {item.status === "uploading" ? (
                    <>
                      <Spinner className="size-5 text-brand-600" />
                      <span className="text-xs font-semibold text-muted">Uploading</span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-red-700">{item.error}</span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => remove(item.key)}
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-ink/75 text-lg leading-none font-bold text-white"
                aria-label={`Remove ${item.fileName}`}
              >
                &times;
              </button>

              {item.status === "done" && item.path && (
                <input type="hidden" name={name} value={item.path} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!atCapacity && (
        <div className="grid grid-cols-2 gap-2">
          {/* Two inputs rather than one: `capture` forces the camera and hides
              the photo library and file browser, so the browse path needs an
              input without it. */}
          <label htmlFor={`${inputId}-camera`} className="btn-secondary cursor-pointer">
            <CameraIcon />
            Take photo
          </label>
          <input
            id={`${inputId}-camera`}
            type="file"
            accept={IMAGE_TYPES}
            capture="environment"
            multiple={multiple}
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <label htmlFor={`${inputId}-browse`} className="btn-secondary cursor-pointer">
            <UploadIcon />
            {browseLabel}
          </label>
          <input
            id={`${inputId}-browse`}
            type="file"
            accept={accept}
            multiple={multiple}
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.3 4.7h5.4a1 1 0 0 1 .83.45l.94 1.4A1 1 0 0 0 17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.8" r="3.3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4M8 8l4-4 4 4M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
