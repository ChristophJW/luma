from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "join_code", "status", "guest_capacity", "shots_per_guest")
    list_filter = ("status", "event_type", "face_lookup_enabled", "involves_minors")
    search_fields = ("title", "join_code", "public_slug")
    readonly_fields = ("created_at", "updated_at")
