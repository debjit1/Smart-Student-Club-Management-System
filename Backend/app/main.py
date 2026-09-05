import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from app import models
from app.database import Base, SessionLocal, engine
from app.routers import (
    attendance,
    auth,
    certificates,
    chat,
    clubs,
    events,
    finance,
    llm,
    notifications,
    reports,
    students,
    tasks,
    venues,
)
from app.seed import seed_demo_data

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SSCMS API",
    description=(
        "Smart Student Club Management System -- Backend Sprint 1 (Milestone 3) covered "
        "Epics 1-3: Role-Based Portal Access & Onboarding, Venue Booking & Asset Management, "
        "and Event Lifecycle & Approval Workflows. Backend Sprint 2 (Milestone 4) adds Epics "
        "4-6: Task Management & Volunteer Workflows, QR Attendance & Live Execution, and "
        "Certification & Budget Analytics."
    ),
    version="1.1.0",
)
# Pin to OpenAPI 3.0.3 (rather than FastAPI's 3.1 default) for maximum
# compatibility with Swagger UI / Swagger Editor tooling per the sprint brief.
app.openapi_version = "3.0.3"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(clubs.router)
app.include_router(venues.router)
app.include_router(events.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(finance.router)
app.include_router(tasks.router)
app.include_router(attendance.router)
app.include_router(certificates.router)
app.include_router(students.router)
app.include_router(llm.router)
app.include_router(reports.router)

# Serves uploaded bill files back out (see app.routers.finance.UPLOAD_DIR) --
# real files on disk, not just a filename string in the DB.
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")


@app.on_event("startup")
def on_startup():
    if os.environ.get("SSCMS_SKIP_SEED") == "1":
        return
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}
