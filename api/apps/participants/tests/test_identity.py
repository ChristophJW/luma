"""One account type, roles per event.

See CONCEPT.md, "One account, roles per event".
"""

import uuid

import pytest
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.events.models import Event
from apps.participants.models import Participant


def make_event(title: str) -> Event:
    return Event.objects.create(title=title, public_slug=f"{title.lower()}-{uuid.uuid4().hex[:6]}")


def make_participant(event: Event, **kwargs) -> Participant:
    return Participant.objects.create(
        event=event,
        display_name=kwargs.pop("display_name", "Guest"),
        anonymous_session_id=kwargs.pop("session", uuid.uuid4().hex),
        shot_limit=kwargs.pop("shot_limit", 20),
        **kwargs,
    )


@pytest.mark.django_db
def test_participation_never_requires_an_account():
    """DESIGN.md non-negotiable #1 — the guest path has no login in it."""
    participant = make_participant(make_event("Anna und Ben"))
    assert participant.user is None
    assert participant.shots_remaining == 20


@pytest.mark.django_db
def test_one_person_can_host_one_event_and_attend_another():
    """The role belongs to the event, not to the person."""
    christoph = User.objects.create_user(email="christoph@example.com")

    own_wedding = make_event("Anna und Ben")
    friends_wedding = make_event("Mira und Jonas")

    # Hosting is not modelled as a Participant — it is ownership of the event.
    # Attending is.
    guest_role = make_participant(friends_wedding, user=christoph, display_name="Christoph")

    assert guest_role.user == christoph
    assert christoph.participations.count() == 1
    assert own_wedding.participants.count() == 0


@pytest.mark.django_db
def test_an_account_joins_an_event_only_once():
    christoph = User.objects.create_user(email="christoph@example.com")
    event = make_event("Firmenfeier")

    make_participant(event, user=christoph)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_participant(event, user=christoph)


@pytest.mark.django_db
def test_anonymous_participants_are_not_constrained_against_each_other():
    """The uniqueness rule is partial — it must not collapse anonymous guests,
    who all have user=None."""
    event = make_event("Anna und Ben")

    make_participant(event, display_name="Someone")
    make_participant(event, display_name="Someone else")

    assert event.participants.count() == 2


@pytest.mark.django_db
def test_claiming_links_an_existing_participation_rather_than_creating_one():
    event = make_event("Anna und Ben")
    participant = make_participant(event, display_name="Christoph")
    christoph = User.objects.create_user(email="christoph@example.com")

    participant.user = christoph
    participant.save(update_fields=["user"])

    assert event.participants.count() == 1
    assert christoph.participations.get() == participant


@pytest.mark.django_db
def test_deleting_an_account_keeps_the_photographs_but_drops_the_link():
    """Account deletion must not delete the host's album. CONCEPT.md §3."""
    event = make_event("Anna und Ben")
    christoph = User.objects.create_user(email="christoph@example.com")
    participant = make_participant(event, user=christoph)

    christoph.delete()
    participant.refresh_from_db()

    assert participant.user is None
    assert Participant.objects.filter(pk=participant.pk).exists()
