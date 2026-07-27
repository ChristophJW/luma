"""Run the child-face blur on a local image, so you can eyeball the result.

The album pipeline runs this same detector inside a Celery task against bytes
in object storage. This command is the shortcut for testing the blurring
itself: point it at an image file, get the blurred version back on disk. No
S3, no Celery, no event — just the detector.

    uv run --directory api python manage.py blur_image path/to/photo.jpg
    uv run --directory api python manage.py blur_image photo.jpg -o out.jpg

Needs the model weights present (scripts/fetch-face-models.sh); without them it
says so rather than failing obscurely.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.faces import detector


class Command(BaseCommand):
    help = "Blur children's faces in a local image file (detector test tool)."

    def add_arguments(self, parser):
        parser.add_argument("input", help="Path to the image to blur.")
        parser.add_argument(
            "-o",
            "--out",
            default=None,
            help="Where to write the blurred image (default: <input>.blurred.jpg).",
        )

    def handle(self, *args, **options):
        source = Path(options["input"])
        if not source.is_file():
            raise CommandError(f"No such file: {source}")

        data = source.read_bytes()

        try:
            blurred, stats = detector.detect_and_blur(data)
        except detector.FaceModelsMissing as exc:
            raise CommandError(
                f"{exc}\nModel weights are missing — run ./scripts/fetch-face-models.sh first."
            ) from exc
        except ValueError as exc:
            raise CommandError(f"Could not process image: {exc}") from exc

        dest = Path(options["out"]) if options["out"] else source.with_suffix(".blurred.jpg")
        dest.write_bytes(blurred)

        self.stdout.write(
            self.style.SUCCESS(
                f"Detected {stats['detected']} face(s), blurred {stats['blurred']}."
            )
        )
        if stats["detected"] and stats["blurred"] == 0:
            self.stdout.write(
                self.style.WARNING(
                    "Faces were found but none were blurred — they read as adults. "
                    "Lower FACE_MAX_CHILD_AGE or raise the fail-safe if that's wrong."
                )
            )
        self.stdout.write(f"Wrote {dest}")
