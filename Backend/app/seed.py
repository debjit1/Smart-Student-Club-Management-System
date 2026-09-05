"""Seeds demo data mirroring Frontend/shared/js/seed-data.js so the live
API returns the same clubs/venues/inventory the static frontend prototype
shipped with, replacing what used to be hardcoded on the frontend. Safe to
call multiple times -- it no-ops if data already exists.

Dummy login accounts (per the sprint's role-based-login spec):
  * Faculty Coordinator -- 1 account:    facultycoord@iitm.in
  * Club President      -- 1 account:    studentpresident@iitm.in (oversees all clubs)
  * Club Head           -- 1 per club, auto-created here exactly like
                            `routers.clubs.provision_club_head` does for any
                            club created later via POST /clubs:
                            <clubname-slug>@iitm.in / <clubname-slug>123
  * Students            -- 5 accounts:   <student_id>@iitm.in / student@123
"""
import datetime

from sqlalchemy.orm import Session

from app import models
from app.routers.clubs import provision_club_head
from app.security import hash_password

DEMO_VENUES = [
    {"name": "Auditorium", "capacity": 450, "location": "Block A, 1st Floor",
     "facilities": "Stage sound system, projector screen, central AC, backstage greenrooms.",
     "requirements": "Stage Sound System, Projector Screen, Podium Microphone"},
    {"name": "Open Stage", "capacity": 1000, "location": "Main Ground East",
     "facilities": "Concrete platform, high-voltage power boxes, chairs, temporary tents.",
     "requirements": "PA Sound System, Power Distribution Boxes"},
    {"name": "Seminar Hall 2", "capacity": 120, "location": "Block B, Ground Floor",
     "facilities": "Ceiling projector, whiteboard, 30 workstations.",
     "requirements": "Ceiling Projector, Computer Workstations"},
    {"name": "Exhibition Hall", "capacity": 250, "location": "Block C, Ground Floor",
     "facilities": "Spotlight tracks, movable partitions, Wi-Fi access points.",
     "requirements": "High-Density Spotlight System, Display Panels"},
    {"name": "Main Lawn", "capacity": 1500, "location": "Campus Central Lawn",
     "facilities": "Open lawn, high voltage hookups, temporary stage platforms.",
     "requirements": "Stage Platform Setup, PA Speaker System"},
]

DEMO_INVENTORY = [
    {"code": "AV-MIC-01", "name": "Wireless Collar Mics", "category": "Media & Technology", "total_stock": 8},
    {"code": "AV-PROJ-03", "name": "HD Laser Projector", "category": "Media & Technology", "total_stock": 3},
    {"code": "LOG-CHAIR-01", "name": "Plastic Chairs", "category": "Venue & Infrastructure", "total_stock": 500},
    {"code": "LOG-BOARD-02", "name": "Extension Power Boards", "category": "Venue & Infrastructure", "total_stock": 25},
    {"code": "LAB-SOLD-01", "name": "Soldering Stations", "category": "Materials & Consumables", "total_stock": 20},
]

# Recruitment domains opened per club -- mirrors Frontend/shared/js/seed-data.js DEFAULT_STATE.domains
DOMAIN_TITLES = [
    ("Events & Operations", True),
    ("Design & Media", False),
    ("Outreach & Sponsorship", False),
    ("Finance & Documentation", False),
]

DEMO_CLUBS = [
    {
        "name": "Dance Club", "category": "Cultural",
        "description": "Training, choreography and performance across contemporary, hip-hop and classical styles.",
        "history": "Formed in 2018 by a group of choreography enthusiasts.",
        "achievements": ["Champions, Inter-University Dance Battle 2025"],
        "first_domain": "Choreography & Rehearsals",
        "members": [
            ("Aarav Sharma", "IIT2026501", "Civil", "2nd Year"),
            ("Isha Verma", "IIT2026502", "CSE", "3rd Year"),
            ("Vivaan Iyer", "IIT2026503", "ECE", "4th Year"),
        ],
    },
    {
        "name": "Coding Club", "category": "Technical",
        "description": "A community of programmers building projects, running bootcamps and competing in hackathons.",
        "history": "Founded in 2019 by a group of first-year CS students.",
        "achievements": ["Winners, National Collegiate Hackathon 2025", "50+ students placed via referral network"],
        "first_domain": "Development & Technical",
        "members": [
            ("Kabir Reddy", "IIT2026530", "Design", "3rd Year"),
            ("Riya Nair", "IIT2026531", "Civil", "4th Year"),
        ],
    },
    {
        "name": "Robotix Club", "category": "Technical",
        "description": "Design, build, and program robots with hands-on lab access.",
        "history": "Started as a lab study group in 2020, formalized as a club in 2021.",
        "achievements": ["2nd Place, Inter-College Robowars 2025", "Built the campus tour-guide robot prototype"],
        "first_domain": "Technical & R&D",
        "members": [
            ("Arjun Menon", "IIT2026557", "ECE", "2nd Year"),
            ("Meera Kapoor", "IIT2026558", "Mechanical", "3rd Year"),
        ],
    },
    {
        "name": "Music Club", "category": "Cultural",
        "description": "For vocalists, instrumentalists and music lovers.",
        "history": "One of the oldest cultural clubs on campus, active since 2015.",
        "achievements": ["Headlined the university cultural fest 3 years running"],
        "first_domain": "Music & Performance",
        "members": [
            ("Rohan Joshi", "IIT2026584", "Design", "1st Year"),
            ("Tanvi Malhotra", "IIT2026585", "Civil", "2nd Year"),
        ],
    },
    {
        "name": "Green Club", "category": "Social",
        "description": "Campus sustainability drives - tree plantation, waste segregation and clean-energy awareness.",
        "history": "Founded in 2022 in response to a student sustainability petition.",
        "achievements": ["Reduced campus single-use plastic by 40% in 2025"],
        "first_domain": "Sustainability Projects",
        "members": [
            ("Aditya Chauhan", "IIT2026611", "ECE", "4th Year"),
            ("Sneha Bansal", "IIT2026612", "Mechanical", "1st Year"),
        ],
    },
]

# Pending volunteer applications shown to the Dance Club Head on first login.
DEMO_VOLUNTEER_APPLICANTS = [
    ("Priyanka Joshi", "IIT2026089", "Trained in contemporary and hip-hop dance for 5 years."),
    ("Rahul Verma", "IIT2025210", "Coordinated backstage logistics for last year's dance fest."),
]

FACULTY_COORDINATOR = {
    "student_id": "FAC-001", "name": "Dr. Ananth Rao", "email": "facultycoord@iitm.in",
    "password": "faculty123", "department": "Student Affairs", "year": None,
}

CLUB_PRESIDENT = {
    "student_id": "PRES-001", "name": "Meera Krishnan", "email": "studentpresident@iitm.in",
    "password": "president123", "department": "CSE", "year": "4th Year",
}

# Student logins follow the same convention as CSV/manual adds: email
# <student_id>@iitm.in, default password student@123.
DEMO_STUDENTS = [
    {"student_id": "STU-001", "name": "Ishaan Kapoor", "email": "stu-001@iitm.in",
     "password": "student@123", "department": "CSE", "year": "1st Year"},
    {"student_id": "STU-002", "name": "Diya Malhotra", "email": "stu-002@iitm.in",
     "password": "student@123", "department": "ECE", "year": "2nd Year"},
    {"student_id": "STU-003", "name": "Aryan Chatterjee", "email": "stu-003@iitm.in",
     "password": "student@123", "department": "Mechanical", "year": "3rd Year"},
    {"student_id": "STU-004", "name": "Zara Sheikh", "email": "stu-004@iitm.in",
     "password": "student@123", "department": "IT", "year": "4th Year"},
    {"student_id": "STU-005", "name": "Kunal Bhatt", "email": "stu-005@iitm.in",
     "password": "student@123", "department": "Design", "year": "1st Year"},
]


def _make_user(db, *, student_id, name, email, password, department=None, year=None):
    user = models.User(
        student_id=student_id, name=name, email=email,
        password_hash=hash_password(password), department=department, year=year,
    )
    db.add(user)
    db.flush()
    return user


def seed_demo_data(db: Session) -> None:
    if db.query(models.User).count() > 0:
        return  # already seeded (users exist, do not re-seed demo clubs)

    # -- Faculty Coordinator (1 account, oversees all clubs) --
    faculty = _make_user(db, **{k: v for k, v in FACULTY_COORDINATOR.items() if k != "password"},
                          password=FACULTY_COORDINATOR["password"])
    db.add(models.UserRole(user_id=faculty.id, role=models.ROLE_FACULTY_COORDINATOR, club_id=None))
    db.commit()

    # -- Club President (1 account, oversees all clubs) --
    president = _make_user(db, **{k: v for k, v in CLUB_PRESIDENT.items() if k != "password"},
                            password=CLUB_PRESIDENT["password"])
    db.commit()

    # -- Venues & inventory (shared campus pool) --
    for v in DEMO_VENUES:
        db.add(models.Venue(**v))
    for i in DEMO_INVENTORY:
        db.add(models.InventoryItem(**i, available_stock=i["total_stock"], status="In Stock"))
    db.commit()

    # -- Clubs, each auto-provisioning its Club Head login exactly like
    #    POST /clubs does, plus a small member roster and recruitment domains --
    for club_def in DEMO_CLUBS:
        club = models.Club(
            name=club_def["name"],
            category=club_def["category"],
            description=club_def["description"],
            history=club_def["history"],
            achievements="|".join(club_def["achievements"]),
            status="Approved",
            president_id=president.id,
            faculty_coordinator_id=faculty.id,
        )
        db.add(club)
        db.commit()
        db.refresh(club)

        # President oversees every club -- one UserRole row per club.
        db.add(models.UserRole(user_id=president.id, role=models.ROLE_CLUB_PRESIDENT, club_id=club.id))
        db.commit()

        provision_club_head(db, club)

        domain_titles = [club_def["first_domain"]] + [t for t, _ in DOMAIN_TITLES]
        recruitment_open_flags = [True] + [open_ for _, open_ in DOMAIN_TITLES]
        domain_ids = []
        for title, is_open in zip(domain_titles, recruitment_open_flags):
            domain = models.Domain(
                club_id=club.id, title=title, recruitment_open=is_open,
                opened_on=datetime.date.today() if is_open else None,
            )
            db.add(domain)
            db.commit()
            db.refresh(domain)
            domain_ids.append(domain.id)

        for idx, (name, student_id, department, year) in enumerate(club_def["members"]):
            member_user = _make_user(
                db, student_id=student_id, name=name,
                email=f"{name.lower().replace(' ', '.')}@iitm.in",
                password="member123", department=department, year=year,
            )
            db.commit()
            db.add(models.ClubMember(
                club_id=club.id, user_id=member_user.id, status="Active",
                joined_on=datetime.date.today(),
            ))
            db.add(models.UserRole(user_id=member_user.id, role=models.ROLE_STUDENT, club_id=None))
        db.commit()

        if club_def["name"] == "Dance Club":
            for name, student_id, note in DEMO_VOLUNTEER_APPLICANTS:
                applicant = _make_user(
                    db, student_id=student_id, name=name,
                    email=f"{name.lower().replace(' ', '.')}@iitm.in",
                    password="member123",
                )
                db.commit()
                db.add(models.VolunteerApplication(
                    club_id=club.id, domain_id=domain_ids[0], applicant_id=applicant.id,
                    applied_on=datetime.date.today(), status="Pending", note=note,
                ))
            db.commit()

    # -- Students (5 accounts, not affiliated with any club yet) --
    for s in DEMO_STUDENTS:
        student = _make_user(db, **{k: v for k, v in s.items() if k != "password"}, password=s["password"])
        db.add(models.UserRole(user_id=student.id, role=models.ROLE_STUDENT, club_id=None))
    db.commit()

    # -- Faculty master budget pool (singleton) -- mirrors what
    #    Frontend/shared/js/seed-data.js used to hardcode locally.
    if db.query(models.FacultyBudgetPool).count() == 0:
        db.add(models.FacultyBudgetPool(total=200000))
        db.commit()

    # -- Initial Demo Venue Bookings --
    if db.query(models.Booking).count() == 0:
        auditorium = db.query(models.Venue).filter(models.Venue.name == "Auditorium").first()
        dance_club = db.query(models.Club).filter(models.Club.name == "Dance Club").first()
        if auditorium and dance_club:
            db.add(
                models.Booking(
                    venue_id=auditorium.id,
                    club_id=dance_club.id,
                    event_name="Annual Choreography Night",
                    booking_date=datetime.date.today() + datetime.timedelta(days=5),
                    time_slot="18:00 - 21:00",
                    requirements="Stage Sound System, Projector Screen",
                    status="Confirmed",
                )
            )
            db.commit()
