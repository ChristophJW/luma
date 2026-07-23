/**
 * Guest camera translations.
 *
 * Its own dictionaries rather than the host app's, so the camera bundle never
 * carries strings about billing and moderation.
 *
 * Voice: warm, spare, human. Errors never blame — a guest whose upload failed
 * has done nothing wrong and can do nothing about it. DESIGN.md §10.
 */

import { type Translations, createTranslator, resolveLocale } from "@luma/i18n";

export const en = {
  "cover.invitedTo": "You're invited to",
  "cover.shotsToSpend": "shots to spend",
  "cover.scarcity": "Take them when they matter. You can't take more.",
  "cover.start": "Start",
  "cover.notYet": "Cameras open {when}.",
  "cover.notYetToday": "Cameras open today at {time}.",
  "cover.ended": "The cameras have closed. Your host will share the album.",
  "cover.closed": "This event isn't open for photos right now.",

  "join.nameLabel": "What should we call you?",
  "join.namePlaceholder": "Your name",
  "join.consent": "I understand my photos are shared with everyone at this event.",
  "join.continue": "Continue",

  "camera.of": "{taken} of {total}",
  "camera.shotsLeft": "{count} shots left",
  "camera.lastShot": "1 shot left",
  "camera.flip": "Switch camera",
  "camera.shutter": "Take a photo",
  "camera.uploading": "{count} uploading",
  "camera.queued": "{count} photos waiting",

  "permission.heading": "Luma needs your camera",
  "permission.body": "Only to take photographs for this event. Nothing is recorded until you press the button.",
  "permission.allow": "Allow camera",
  "permission.deniedHeading": "The camera is blocked",
  "permission.deniedBody": "Your browser is blocking the camera for this page. Open the site settings, allow the camera, then reload.",
  "permission.retry": "Try again",

  "browser.heading": "Open this in your browser",
  "browser.body": "This app's built-in browser can't use the camera. Tap the menu and choose Open in Safari or Open in Chrome.",
  "browser.copy": "Copy link",
  "browser.copied": "Copied",

  "gallery.open": "Your photos",
  "gallery.back": "Back to the camera",
  "gallery.close": "Close",
  "gallery.count": "{count} photos",
  "gallery.empty": "Nothing here yet. Your photos will appear as you take them.",
  "gallery.openPhoto": "Open photo {index}",
  "gallery.position": "{position} of {total}",
  "gallery.previous": "Previous photo",
  "gallery.next": "Next photo",
  "gallery.delete": "Delete this photo",
  "gallery.deleteWarning": "This cannot be undone, and it does not give the shot back.",
  "gallery.deleteConfirm": "Delete",
  "gallery.cancel": "Keep it",

  "roll.heading": "That's the roll.",
  "roll.body": "You've used all {total} shots.",

  "waiting.captured": "{taken} of {total} moments captured",
  "waiting.developing": "Your photos are developing.",
  "waiting.opensAt": "The album opens {when}.",
  "waiting.opensSoon": "The album opens soon.",

  "error.offline": "Couldn't reach Luma. Your photos are safe and will upload automatically.",
  "error.notFound": "This event isn't here. The code may have changed — ask your host for a fresh QR code.",
  "error.full": "This event is full. Ask your host to make room.",
  "error.generic": "Something went wrong. Try again.",
} as const;

export type GuestDictionary = typeof en;

export const de: Translations<GuestDictionary> = {
  "cover.invitedTo": "Du bist eingeladen zu",
  "cover.shotsToSpend": "Aufnahmen für dich",
  "cover.scarcity": "Nutz sie, wenn es zählt. Mehr gibt es nicht.",
  "cover.start": "Los geht's",
  "cover.notYet": "Die Kameras öffnen {when}.",
  "cover.notYetToday": "Die Kameras öffnen heute um {time} Uhr.",
  "cover.ended": "Die Kameras sind geschlossen. Deine Gastgeber teilen gleich das Album.",
  "cover.closed": "Dieses Event ist gerade nicht für Fotos geöffnet.",

  "join.nameLabel": "Wie sollen wir dich nennen?",
  "join.namePlaceholder": "Dein Name",
  "join.consent": "Mir ist klar, dass meine Fotos mit allen auf diesem Event geteilt werden.",
  "join.continue": "Weiter",

  "camera.of": "{taken} von {total}",
  "camera.shotsLeft": "Noch {count} Aufnahmen",
  "camera.lastShot": "Noch 1 Aufnahme",
  "camera.flip": "Kamera wechseln",
  "camera.shutter": "Foto aufnehmen",
  "camera.uploading": "{count} werden geladen",
  "camera.queued": "{count} Fotos warten",

  "permission.heading": "Luma braucht deine Kamera",
  "permission.body": "Nur um Fotos für dieses Event aufzunehmen. Es wird nichts aufgezeichnet, bis du auf den Auslöser drückst.",
  "permission.allow": "Kamera erlauben",
  "permission.deniedHeading": "Die Kamera ist blockiert",
  "permission.deniedBody": "Dein Browser blockiert die Kamera für diese Seite. Öffne die Seiteneinstellungen, erlaube die Kamera und lade neu.",
  "permission.retry": "Nochmal versuchen",

  "browser.heading": "Öffne das im Browser",
  "browser.body": "Der eingebaute Browser dieser App kann die Kamera nicht nutzen. Tipp auf das Menü und wähle In Safari öffnen oder In Chrome öffnen.",
  "browser.copy": "Link kopieren",
  "browser.copied": "Kopiert",

  "gallery.open": "Deine Fotos",
  "gallery.back": "Zurück zur Kamera",
  "gallery.close": "Schließen",
  "gallery.count": "{count} Fotos",
  "gallery.empty": "Noch nichts da. Deine Fotos erscheinen hier, sobald du sie machst.",
  "gallery.openPhoto": "Foto {index} öffnen",
  "gallery.position": "{position} von {total}",
  "gallery.previous": "Vorheriges Foto",
  "gallery.next": "Nächstes Foto",
  "gallery.delete": "Dieses Foto löschen",
  "gallery.deleteWarning": "Das lässt sich nicht rückgängig machen — und du bekommst die Aufnahme nicht zurück.",
  "gallery.deleteConfirm": "Löschen",
  "gallery.cancel": "Behalten",

  "roll.heading": "Das war der Film.",
  "roll.body": "Du hast alle {total} Aufnahmen genutzt.",

  "waiting.captured": "{taken} von {total} Momenten festgehalten",
  "waiting.developing": "Deine Fotos entwickeln sich.",
  "waiting.opensAt": "Das Album öffnet sich {when}.",
  "waiting.opensSoon": "Das Album öffnet sich bald.",

  "error.offline": "Wir erreichen Luma nicht. Deine Fotos sind sicher und werden automatisch hochgeladen.",
  "error.notFound": "Dieses Event gibt es hier nicht. Vielleicht hat sich der Code geändert — frag deine Gastgeber nach einem neuen QR-Code.",
  "error.full": "Dieses Event ist voll. Bitte deine Gastgeber, Platz zu schaffen.",
  "error.generic": "Da ist etwas schiefgelaufen. Versuch es noch einmal.",
};

export const locale = resolveLocale(
  typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]),
);

export const t = createTranslator<GuestDictionary>({ en, de }, locale);
