/**
 * The viewfinder. DESIGN.md §7.
 *
 * The user is standing in a dim room, holding a phone in one hand and a drink
 * in the other, surrounded by noise. Everything interactive lives in the
 * bottom quarter, nothing is smaller than 44pt, and the counter never leaves.
 */

import { useEffect, useRef, useState } from "react";

import { t } from "./i18n";
import { queue } from "./queue";
import { drain } from "./uploader";

type Facing = "environment" | "user";

export function Camera({
  token,
  taken,
  total,
  onCaptured,
  onOpenGallery,
  pending,
}: {
  token: string;
  taken: number;
  total: number;
  onCaptured: () => void;
  onOpenGallery: () => void;
  pending: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          // Ask for something print-worthy; the browser gives what it can.
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      if (cancelled) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        // `playsinline` is set on the element too — without it iOS Safari
        // takes the video fullscreen and the chrome disappears.
        await video.current.play().catch(() => undefined);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  const remaining = total - taken;
  const low = remaining <= 3 && remaining > 0;

  async function capture() {
    const element = video.current;
    if (!element || !ready || remaining <= 0) return;

    // Three confirmations, because a wedding is loud and dark: the flash, a
    // haptic tap, and the counter moving.
    setFlash(true);
    setTimeout(() => setFlash(false), 80);
    navigator.vibrate?.(12);

    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    if (facing === "user") {
      // A front-camera preview is mirrored, so the capture must be too —
      // otherwise the photograph does not match what the person just saw.
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(element, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) return;

    // Re-encoding through a canvas drops every EXIF tag, including GPS —
    // which is the stripping requirement, done before the bytes ever leave
    // the device rather than server-side afterwards.
    await queue.add({
      id: crypto.randomUUID(),
      blob,
      createdAt: Date.now(),
      attempts: 0,
    });

    onCaptured();
    void drain(token);
  }

  return (
    <div class="viewfinder">
      <video ref={video} class="feed" autoPlay playsInline muted />

      {/* Scrims are mandatory: unprotected white text vanishes the moment the
          lens points at a tablecloth. */}
      <div class="scrim scrim-top" />
      <div class="scrim scrim-bottom" />

      <div class="hud-top">
        <div>
          <span class={low ? "counter is-low" : "counter"}>{taken}</span>
          <span class="counter-total"> / {total}</span>
        </div>
        <span class="counter-label">
          {low ? t("camera.shotsLeft", { count: remaining }) : t("camera.of", { taken, total })}
        </span>
      </div>

      {pending > 0 ? <div class="queued">{t("camera.queued", { count: pending })}</div> : null}

      <div class="hud-bottom">
        <button
          class="chrome-button"
          onClick={() => setFacing((current) => (current === "user" ? "environment" : "user"))}
          aria-label={t("camera.flip")}
        >
          <span class="flip-glyph" aria-hidden="true" />
        </button>

        <button
          class="shutter"
          onClick={capture}
          disabled={!ready || remaining <= 0}
          aria-label={t("camera.shutter")}
        />

        <button class="chrome-button" onClick={onOpenGallery} aria-label={t("gallery.open")}>
          <span class="grid-glyph" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        </button>
      </div>

      {flash ? <div class="flash" /> : null}
    </div>
  );
}
