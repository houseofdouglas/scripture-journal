import { useCallback, useEffect, useState } from "react";
import type { FigurePayload } from "../../../types";
import { FigureBlock, assetUrl } from "./FigureBlock";
import { FigureViewerModal } from "../FigureViewerModal";

/** A figure is "scaled down" when it renders narrower than this fraction of its intrinsic width (FR-23). */
export const SCALED_THRESHOLD = 0.75;

/** True when `renderedWidth` is below the threshold. A zero width (not laid out / hidden) never counts. */
export function isScaledDown(renderedWidth: number, intrinsicWidth: number): boolean {
  return renderedWidth > 0 && renderedWidth < SCALED_THRESHOLD * intrinsicWidth;
}

interface Props {
  figure: FigurePayload;
  text: string;
}

/**
 * Wraps `FigureBlock` with the "View original size" behaviour (FR-23): measures the rendered
 * `<img>` with a `ResizeObserver` and offers the button only while the figure is scaled below
 * 75% of its intrinsic width. Without `ResizeObserver` the button is simply never shown.
 */
export function FigureWithOriginal({ figure, text }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scaled, setScaled] = useState(false);
  const [open, setOpen] = useState(false);
  const { assetKey, width, height } = figure;
  const original =
    figure.unavailable !== true && assetKey && width && height ? { src: assetUrl(assetKey), width, height } : null;
  const intrinsicWidth = original?.width ?? null;

  useEffect(() => {
    if (!img || intrinsicWidth === null || typeof ResizeObserver === "undefined") {
      setScaled(false);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const rendered = entry ? entry.contentRect.width : img.getBoundingClientRect().width;
      setScaled(isScaledDown(rendered, intrinsicWidth));
    });
    observer.observe(img);
    return () => observer.disconnect();
  }, [img, intrinsicWidth]);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <FigureBlock
        figure={figure}
        text={text}
        imgRef={setImg}
        // Keep the trigger mounted while the modal is open so focus can return to it on close.
        {...(original && (scaled || open) ? { onViewOriginal: handleOpen } : {})}
      />
      {open && original ? (
        <FigureViewerModal
          src={original.src}
          width={original.width}
          height={original.height}
          alt={figure.alt}
          caption={figure.caption}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}
