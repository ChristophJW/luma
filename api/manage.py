#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# The single .env lives at the repo root and is shared by every service.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Couldn't import Django. Is the virtualenv active? Try `uv sync`."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
