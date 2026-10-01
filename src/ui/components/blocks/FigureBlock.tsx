import type { Ref } from "react";
import type { FigurePayload } from "../../../types";

/**
 * Public URL of a stored asset. Content is served same-origin via CloudFront, exactly like
 * article JSON (`/content/articles/<id>.json`), so an asset key maps to `/<assetKey>`.
 */
export function assetUrl(assetKey: string): string {
  return `/${assetKey}`;
}

interface Props {
  figure: FigurePayload;
  /** Flattened block text; used for the placeholder label when there is no caption or alt. */
  text: string;
  /** Extension point (RAB-19): ref to the rendered `<img>`, for measuring rendered vs intrinsic width. */
  imgRef?: Ref<HTMLImageElement>;
  /**
   * Extension point (RAB-19): when provided, a "View original size" button is rendered and
   * calls this. The caller decides when to pass it (the < 75% rendered-width rule, FR-23).
   */
  onViewOriginal?: () => void;
}

/**
 * Renders a figure block (FR-22): the image at its original aspect ratio, never wider than its
 * intrinsic width and never cropped, plus its caption. Unavailable figures (FR-13) — or any
 * figure missing its asset/dimensions, since stored JSON is not re-validated client-side —
 * show an "Image unavailable" placeholder with the caption.
 */
export function FigureBlock({ figure, text, imgRef, onViewOriginal }: Props) {
  const { assetKey, width, height, alt, caption } = figure;
  const captionEl = caption ? (
    <figcaption className="mt-2 text-sm text-gray-600 dark:text-gray-400">{caption}</figcaption>
  ) : null;

  if (figure.unavailable === true || !assetKey || !width || !height) {
    const label = caption || alt || text;
    return (
      <figure>
        <div
          role="img"
          aria-label={label ? `Image unavailable: ${label}` : "Image unavailable"}
          className="flex min-h-24 items-center justify-center rounded border border-dashed border-gray-400 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"
        >
          Image unavailable
        </div>
        {captionEl}
      </figure>
    );
  }

  return (
    <figure>
      <div data-figure-frame="">
        <img
          ref={imgRef}
          src={assetUrl(assetKey)}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={{
            display: "block",
            aspectRatio: `${width} / ${height}`,
            width: `min(100%, ${width}px)`,
            height: "auto",
          }}
        />
      </div>
      {onViewOriginal ? (
        <button
          type="button"
          onClick={onViewOriginal}
          className="mt-1 text-sm text-blue-600 underline hover:no-underline dark:text-blue-400"
        >
          View original size
        </button>
      ) : null}
      {captionEl}
    </figure>
  );
}
