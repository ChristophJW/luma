import os
from pathlib import Path

from celery import Celery
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("luma")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self) -> str:
    return f"ok: {self.request!r}"
