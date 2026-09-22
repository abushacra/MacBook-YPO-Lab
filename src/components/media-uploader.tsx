"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Spinner } from "@/components/submit-button";

type Item = {
  key: string;
  fileName: string;
  previewUrl: string | null;
  isPdf: boolean;
  status: "uploading" | "done" | "error";
  path?: string;
  error?: string;
};

type Props = {
  /** Name of the hidden inputs carrying finished storage paths to the action. */
  name: string;
  bucket: "service-photos" | "receipts";
  addLabel: string;
  multiple?: boolean;
  maxFiles?: number;
  accept?: string;
  onBusyChange?: (busy: boolean) => void;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

/**
 * Phone cameras produce 3-5MB files, which crawl over a cellular connection.
 * Downscaling to 1600px in the browser keeps the upload small enough to finish
 * while the engineer is still typing the description. HEIC and anything the
 * browser cannot decode is sent through untouched.
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

export function MediaUploader({
  name,
  bucket,
  addLabel,
  multiple = false,
  maxFiles = 8,
  accept = "image/*",
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
              ? { ...item, status: "error", error: "No connection. Tap to retry." }
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
    const files = Array.from(fileList).slice(0, room);

    for (const original of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const file = await shrinkImage(original);
      const isPdf = file.type === "application/pdf";
      const previewUrl = isPdf ? null : URL.createObjectURL(file);
      if (previewUrl) objectUrls.current.push(previewUrl);

      setItems((current) => [
        ...current,
        { key, fileName: file.name, previewUrl, isPdf, status: "uploading" },
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
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center p-2 text-center text-xs font-semibold break-all text-muted">
                  {item.fileName}
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
        <>
          <label htmlFor={inputId} className="btn-secondary w-full cursor-pointer">
            <CameraIcon />
            {addLabel}
          </label>
          <input
            id={inputId}
            type="file"
            accept={accept}
            capture="environment"
            multiple={multiple}
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </>
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
