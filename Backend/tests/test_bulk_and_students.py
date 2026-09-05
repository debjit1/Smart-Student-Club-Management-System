"""Tests for /users/bulk-import, /students, /venues/bulk, /inventory/bulk, and /finance/transactions."""
import io
from app.models import ROLE_CLUB_PRESIDENT, ROLE_FACULTY_COORDINATOR, ROLE_STUDENT
from tests.conftest import auth_headers, make_user


def test_bulk_import_users_success(client, db_session):
    fc = make_user(db_session, student_id="FC101", name="Prof FC", email="fc@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(fc)

    payload = [
        {"student_id": "STU101", "name": "Alice", "email": "alice@iitm.in", "password": "pass123", "role": "Student"},
        {"student_id": "STU102", "name": "Bob", "email": "bob@iitm.in", "password": "pass123", "role": "Student"},
    ]
    resp = client.post("/users/bulk-import", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["imported"] == 2
    assert body["failed"] == 0
    assert len(body["results"]) == 2


def test_bulk_import_users_partial_failure(client, db_session):
    fc = make_user(db_session, student_id="FC102", name="Prof FC2", email="fc2@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(fc)

    # First register user STU103
    make_user(db_session, student_id="STU103", name="Charlie", email="charlie@iitm.in", role=ROLE_STUDENT)

    payload = [
        {"student_id": "STU103", "name": "Charlie Duplicate", "email": "charlie@iitm.in", "role": "Student"},
        {"student_id": "STU104", "name": "David", "email": "david@iitm.in", "role": "Student"},
    ]
    resp = client.post("/users/bulk-import", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["imported"] == 1
    assert body["failed"] == 1
    assert body["results"][0]["status"] == "error"
    assert body["results"][1]["status"] == "success"


def test_bulk_import_csv_file(client, db_session):
    fc = make_user(db_session, student_id="FC103", name="Prof FC3", email="fc3@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(fc)

    csv_data = "student_id,name,email,password,role\nSTU105,Eve,eve@iitm.in,pass123,Student\n"
    files = {"file": ("students.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/users/bulk-import", files=files, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1


def test_get_students_aggregated_view(client, db_session):
    fc = make_user(db_session, student_id="FC104", name="Prof FC4", email="fc4@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    make_user(db_session, student_id="STU106", name="Frank", email="frank@iitm.in", role=ROLE_STUDENT)

    headers = auth_headers(fc)
    resp = client.get("/students", headers=headers)
    assert resp.status_code == 200
    students = resp.json()
    assert isinstance(students, list)
    assert any(s["email"] == "frank@iitm.in" for s in students)


def test_get_students_unauthorized_for_student(client, db_session):
    student = make_user(db_session, student_id="STU107", name="Grace", email="grace@iitm.in", role=ROLE_STUDENT)
    headers = auth_headers(student)
    resp = client.get("/students", headers=headers)
    assert resp.status_code == 403


def test_create_student_manual(client, db_session):
    fc = make_user(db_session, student_id="FC104B", name="Prof FC4B", email="fc4b@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc4b@iitm.in", "secret123")

    payload = {
        "student_id": "STU999",
        "name": "Manual Student",
        "email": "manual@iitm.in",
        "password": "password123",
        "department": "CSE",
        "year": "2nd Year",
    }
    resp = client.post("/students", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["student_id"] == "STU999"
    assert data["name"] == "Manual Student"
    assert data["created_at"] is not None


def test_bulk_venues_csv_import(client, db_session):
    fc = make_user(db_session, student_id="FC105B", name="Prof FC5B", email="fc5b@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc5b@iitm.in", "secret123")

    csv_data = "name,capacity,location,facilities,requirements\nAuditorium CSV,400,Block C,Projector,Mic\n"
    files = {"file": ("venues.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/venues/bulk-import", files=files, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["created"] == 1


def test_bulk_inventory_csv_import(client, db_session):
    fc = make_user(db_session, student_id="FC106B", name="Prof FC6B", email="fc6b@iitm.in", role=ROLE_FACULTY_COORDINATOR)
    headers = auth_headers(client, "fc6b@iitm.in", "secret123")

    csv_data = "code,name,category,total_stock,available_stock\nINV101,Speakers,Audio,10,10\n"
    files = {"file": ("inventory.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    resp = client.post("/inventory/bulk-import", files=files, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["created"] == 1
