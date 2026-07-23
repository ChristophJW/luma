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
