from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuthSession, LoginCode, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["-date_joined"]
    list_display = ("email", "display_name", "email_verified_at", "is_staff", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "display_name")
    readonly_fields = ("date_joined", "last_login", "email_verified_at")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("display_name",)}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups")}),
        ("Dates", {"fields": ("date_joined", "last_login", "email_verified_at")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


@admin.register(LoginCode)
class LoginCodeAdmin(admin.ModelAdmin):
    list_display = ("email", "created_at", "expires_at", "consumed_at", "attempts")
    search_fields = ("email",)
    # The hash is deliberately not editable, and the plaintext code does not
    # exist anywhere to display.
    readonly_fields = ("code_hash", "ip_hash", "user_agent", "created_at")


@admin.register(AuthSession)
class AuthSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "last_used_at", "expires_at", "revoked_at")
    search_fields = ("user__email",)
    readonly_fields = ("token_hash", "created_at", "last_used_at")
