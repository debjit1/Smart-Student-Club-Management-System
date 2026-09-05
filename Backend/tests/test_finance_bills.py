"""Tests for real bill-file uploads on Self-Procured Expense line items
(app.routers.finance.upload_bill) -- both the Club Head's own upload and
a Volunteer holding the linked Bill Upload task, and that the uploaded
bytes actually land on disk and are servable back out."""
from app import models
from app.models import ROLE_CLUB_HEAD, ROLE_STUDENT, ROLE_VOLUNTEER
from tests.conftest import auth_headers, make_club, make_user


def _setup_expense(db_session, club_name="Dance Club"):
    club = make_club(db_session, name=club_name)
    head = make_user(
        db_session, student_id=f"CH-{club_name}", name="Head", email=f"head-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_CLUB_HEAD, club_id=club.id,
    )
    volunteer = make_user(
        db_session, student_id=f"VOL-{club_name}", name="Volunteer", email=f"vol-{club.id}@iit.ac.in",
        password="pass123", role=ROLE_VOLUNTEER, club_id=club.id,
    )
    eb = models.EventBudget(club_id=club.id, event_name="Fest", allotted=1000, status="Open")
    db_session.add(eb)
    db_session.commit()
    db_session.refresh(eb)
    exp = models.Expense(
        event_budget_id=eb.id, item_name="Banner", type="Self-Procured Expense",
        category="Media & Technology", approved_amount=1000, status="Awaiting Bill", source="proposal",
    )
    db_session.add(exp)
    db_session.commit()
    db_session.refresh(exp)
    return club, head, volunteer, eb, exp


def test_club_head_uploads_bill_file_and_it_persists_on_disk(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")

    resp = client.post(
        f"/expenses/{exp.id}/upload-bill",
        data={"bill_amount": "850"},
        files={"file": ("receipt.pdf", b"%PDF-1.4 fake receipt bytes", "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Draft"
    assert body["bill_file_name"] == "receipt.pdf"
    assert body["bill_file_url"].startswith("/uploads/bills/")

    # The real bytes land on disk (not just a filename string) -- static
    # serving of bill_file_url itself is registered once in app.main against
    # the real uploads/ directory, not the per-test tmp dir the `client`
    # fixture points UPLOAD_DIR at, so it's verified separately by hand/e2e.
    from app.routers import finance as finance_router
    stored_name = body["bill_file_url"].rsplit("/", 1)[-1]
    stored_path = finance_router.UPLOAD_DIR / stored_name
    assert stored_path.exists()
    assert stored_path.read_bytes() == b"%PDF-1.4 fake receipt bytes"


def test_upload_bill_amount_zero_marks_not_utilized_without_file(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")

    resp = client.post(f"/expenses/{exp.id}/upload-bill", data={"bill_amount": "0"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Not Utilized"
    assert resp.json()["bill_file_name"] is None


def test_unrelated_user_cannot_upload_bill(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    other_student = make_user(
        db_session, student_id="STU-X", name="Rando", email="rando@iit.ac.in",
        password="pass123", role=ROLE_STUDENT,
    )
    headers = auth_headers(client, "rando@iit.ac.in", "pass123")
    resp = client.post(f"/expenses/{exp.id}/upload-bill", data={"bill_amount": "500"}, headers=headers)
    assert resp.status_code == 403


def test_volunteer_with_linked_bill_task_can_upload(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    event = models.Event(club_id=club.id, name="Fest", event_date=None)
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    db_session.add(models.Task(
        event_id=event.id, club_id=club.id, assigned_to=volunteer.id, assigned_by=head.id,
        type="Bill Upload", title="Upload Bill: Banner", expense_id=exp.id, status="Assigned",
    ))
    db_session.commit()

    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")
    resp = client.post(
        f"/expenses/{exp.id}/upload-bill",
        data={"bill_amount": "700"},
        files={"file": ("bill.jpg", b"fake-image-bytes", "image/jpeg")},
        headers=vol_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["bill_file_name"] == "bill.jpg"


def test_volunteer_without_linked_task_cannot_upload(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    vol_headers = auth_headers(client, f"vol-{club.id}@iit.ac.in", "pass123")
    resp = client.post(f"/expenses/{exp.id}/upload-bill", data={"bill_amount": "700"}, headers=vol_headers)
    assert resp.status_code == 403


def test_upload_bill_non_editable_status_returns_409(client, db_session):
    club, head, volunteer, eb, exp = _setup_expense(db_session)
    exp.status = "Approved"
    db_session.commit()
    headers = auth_headers(client, f"head-{club.id}@iit.ac.in", "pass123")
    resp = client.post(f"/expenses/{exp.id}/upload-bill", data={"bill_amount": "500"}, headers=headers)
    assert resp.status_code == 409
