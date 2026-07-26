/**
 * The guest's own roll.
 *
 * A wall of images, and a fullscreen view to look properly and to delete.
 * Photographs sit edge to edge at radius 0 with 2px gutters — a photograph's
 * own edge is its frame (DESIGN.md §8).
 *
 * Motion follows the token scale: 240ms ease-out for the lightbox, 400ms for
 * a photograph arriving. Nothing bounces, nothing shimmers.
 */

import { useEffect, useState } from "preact/hooks";

import { type Photo, api } from "./api";
import { t } from "./i18n";
import { Mark } from "./Logo";

const SKELETON_TILES = 6;

export function Gallery({
  token,
  title,
  onClose,
}: {
  token: string;
  title: string;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .photos(token)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [token]);

  // Escape closes the lightbox — this runs on laptops too.
  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        setConfirming(false);
      }
      if (event.key === "ArrowLeft") setOpen((i) => (i && i > 0 ? i - 1 : i));
      if (event.key === "ArrowRight")
        setOpen((i) => (i !== null && photos && i < photos.length - 1 ? i + 1 : i));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, photos]);

  async function remove(photo: Photo) {
    setBusy(true);
    try {
      await api.deletePhoto(token, photo.id);
      const next = (photos ?? []).filter((entry) => entry.id !== photo.id);
      setPhotos(next);
      setConfirming(false);
      setOpen(next.length === 0 ? null : (index) => Math.min(index ?? 0, next.length - 1));
    } finally {
      setBusy(false);
    }
  }

  const current = open !== null && photos ? photos[open] : null;

  return (
    <div class="gallery">
      <header class="gallery-head">
        <button class="chrome-button" onClick={onClose} aria-label={t("gallery.back")}>
          <span class="back-glyph" aria-hidden="true" />
        </button>
        <div class="gallery-title">
          <span class="eyebrow">{title}</span>
          <h1 class="gallery-heading">{t("gallery.open")}</h1>
        </div>
        {photos ? (
          <span class="gallery-count">{photos.length}</span>
        ) : null}
        <Mark size={20} />
      </header>

      {photos === null ? (
        // Static blocks, never a shimmer — shimmer reads as urgency and this
        // product is not urgent. DESIGN.md §6.
        <div class="grid">
          {Array.from({ length: SKELETON_TILES }, (_, index) => (
            <div key={index} class="tile tile-skeleton" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div class="gallery-empty">
          <p class="body muted">{t("gallery.empty")}</p>
        </div>
      ) : (
        <div class="grid">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              class="tile"
              onClick={() => setOpen(index)}
              aria-label={t("gallery.openPhoto", { index: index + 1 })}
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                class={loaded.has(photo.id) ? "is-loaded" : ""}
                onLoad={() => setLoaded((current) => new Set(current).add(photo.id))}
              />
            </button>
          ))}
        </div>
      )}

      {current ? (
        <div class="lightbox" role="dialog" aria-modal="true">
          <img class="lightbox-image" src={current.url} alt="" />

          {/* Same scrim treatment as the viewfinder, so chrome stays legible
              over a bright photograph. */}
          <div class="scrim scrim-top" />
          <div class="scrim scrim-bottom" />

          <div class="lightbox-top">
            <button
              class="chrome-button"
              onClick={() => {
                setOpen(null);
                setConfirming(false);
              }}
              aria-label={t("gallery.close")}
            >
              <span class="close-glyph" aria-hidden="true" />
            </button>
            <span class="lightbox-position">
              {t("gallery.position", { position: open! + 1, total: photos!.length })}
            </span>
          </div>

          {/* Wide invisible targets down each edge: a thumb finds them without
              looking, and they never cover the middle of the photograph. */}
          {open! > 0 ? (
            <button
              class="step step-prev"
              onClick={() => setOpen(open! - 1)}
              aria-label={t("gallery.previous")}
            />
          ) : null}
          {open! < photos!.length - 1 ? (
            <button
              class="step step-next"
              onClick={() => setOpen(open! + 1)}
              aria-label={t("gallery.next")}
            />
          ) : null}

          <div class="lightbox-bottom">
            <button class="ghost-button" onClick={() => setConfirming(true)}>
              {t("gallery.delete")}
            </button>
          </div>

          {confirming ? (
            <div class="sheet-scrim" onClick={() => setConfirming(false)}>
              <div class="sheet" onClick={(event) => event.stopPropagation()}>
                <h2 class="sheet-title">{t("gallery.deleteConfirm")}?</h2>
                {/* Permanent, and it does not give the shot back. Said, not
                    implied — a guest should not discover that afterwards. */}
                <p class="body muted">{t("gallery.deleteWarning")}</p>
                <button
                  class="button button-danger"
                  disabled={busy}
                  onClick={() => void remove(current)}
                >
                  {t("gallery.deleteConfirm")}
                </button>
                <button class="button button-quiet" onClick={() => setConfirming(false)}>
                  {t("gallery.cancel")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
