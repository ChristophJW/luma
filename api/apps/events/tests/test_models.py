import pytest
from django.db import IntegrityError, transaction

from apps.events.models import Event, generate_join_code


@pytest.mark.django_db
def test_minors_event_cannot_enable_face_lookup_via_save():
    """save() forces the flag off — the model refuses the combination."""
    event = Event.objects.create(
        title="School party",
        public_slug="school-party",
        involves_minors=True,
        face_lookup_enabled=True,
    )
    event.refresh_from_db()
    assert event.face_lookup_enabled is False


@pytest.mark.django_db
def test_minors_constraint_is_enforced_by_the_database():
    """Bypassing save() must still fail. This is a legal constraint (CONCEPT.md §8)."""
    event = Event.objects.create(title="School party", public_slug="school-party-2")
    with pytest.raises(IntegrityError), transaction.atomic():
        # update() skips save(), so only the CheckConstraint can catch this.
        Event.objects.filter(pk=event.pk).update(involves_minors=True, face_lookup_enabled=True)


def test_join_code_alphabet_excludes_ambiguous_characters():
    """The code gets printed on a table card and read aloud in a noisy room."""
    codes = "".join(generate_join_code() for _ in range(200))
    assert not set(codes) & set("01OIL")
    assert len(generate_join_code()) == 6


@pytest.mark.django_db
def test_blurring_children_is_independent_of_face_lookup():
    """Different purposes, different rules.

    Lookup identifies a person and is forbidden for minors. Blurring detects
    and destroys, and is exactly what you want at an event with children.
    """
    event = Event.objects.create(
        title="Kita-Sommerfest",
        public_slug="kita-sommerfest",
        involves_minors=True,
        blur_child_faces=True,
    )
    event.refresh_from_db()

    assert event.blur_child_faces is True
    assert event.face_lookup_enabled is False


@pytest.mark.django_db
def test_blurring_is_cleared_when_no_children_are_declared():
    event = Event.objects.create(
        title="Firmenfeier",
        public_slug="firmenfeier",
        involves_minors=False,
        blur_child_faces=True,
    )
    event.refresh_from_db()

    assert event.blur_child_faces is False


@pytest.mark.django_db
def test_database_rejects_blurring_without_declared_minors():
    """save() normalises it; bypassing save() must still fail."""
    event = Event.objects.create(title="Firmenfeier", public_slug="firmenfeier-2")

    with pytest.raises(IntegrityError), transaction.atomic():
        Event.objects.filter(pk=event.pk).update(involves_minors=False, blur_child_faces=True)
