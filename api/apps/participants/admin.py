from django.contrib import admin

from .models import Participant


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ("display_name", "event", "shot_limit", "shots_committed", "shots_reserved")
    search_fields = ("display_name", "email")
    list_filter = ("event",)
