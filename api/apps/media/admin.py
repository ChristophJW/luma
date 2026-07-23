from django.contrib import admin

from .models import MediaAsset


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ("id", "event", "participant", "processing_status", "moderation_status")
    list_filter = ("processing_status", "moderation_status")
