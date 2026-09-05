"""Epic 2 -- Venue Booking & Asset Management.

Story 2.1 (Conflict-Free Venue Booking): the system must check existing
confirmed bookings for the same venue + date before a booking is created,
so double-bookings are caught before an event proposal is approved.
"""
import csv
import datetime
import io
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import require_roles

router = APIRouter(tags=["Venues, Inventory & Bookings"])


# ── Venues ──────────────────────────────────────────────────────────
@router.post(
    "/venues",
    response_model=schemas.VenueOut,
    status_code=status.HTTP_201_CREATED,
)
def create_venue(
    payload: schemas.VenueCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    venue = models.Venue(**payload.model_dump())
    db.add(venue)
    db.commit()
    db.refresh(venue)
    return venue


@router.get("/venues", response_model=list[schemas.VenueOut])
def list_venues(db: Session = Depends(get_db)):
    return db.query(models.Venue).all()


@router.patch(
    "/venues/{venue_id}",
    response_model=schemas.VenueOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"},
        404: {"model": schemas.ErrorOut, "description": "Venue not found"},
    },
)
def update_venue(
    venue_id: int,
    payload: schemas.VenueUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(venue, field, value)
    db.commit()
    db.refresh(venue)
    return venue


@router.delete(
    "/venues/{venue_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"},
        404: {"model": schemas.ErrorOut, "description": "Venue not found"},
        409: {"model": schemas.ErrorOut, "description": "Venue is referenced by a booking or an event proposal"},
    },
)
def delete_venue(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if db.query(models.Booking).filter(models.Booking.venue_id == venue_id).first():
        raise HTTPException(
            status_code=409, detail="Venue is referenced by a booking and cannot be deleted"
        )
    if db.query(models.EventProposal).filter(models.EventProposal.venue_id == venue_id).first():
        raise HTTPException(
            status_code=409, detail="Venue is referenced by an event proposal and cannot be deleted"
        )
    db.delete(venue)
    db.commit()


@router.get(
    "/venues/{venue_id}/availability",
    responses={404: {"model": schemas.ErrorOut, "description": "Venue not found"}},
)
def check_venue_availability(venue_id: int, booking_date: str, db: Session = Depends(get_db)):
    """Story 2.1: reports whether `venue_id` is free on `booking_date`
    (YYYY-MM-DD) by looking for an existing non-Released booking.
    """
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    conflict = (
        db.query(models.Booking)
        .filter(
            models.Booking.venue_id == venue_id,
            models.Booking.booking_date == booking_date,
            models.Booking.status != "Released",
        )
        .first()
    )
    return {
        "venue_id": venue_id,
        "booking_date": booking_date,
        "available": conflict is None,
        "conflicting_booking_id": conflict.id if conflict else None,
    }


def _booking_to_schema(b: models.Booking) -> schemas.BookingOut:
    reqs = []
    if b.requirements:
        reqs = [r.strip() for r in b.requirements.split(",") if r.strip()]
    return schemas.BookingOut(
        id=b.id,
        venue_id=b.venue_id,
        event_id=b.event_id,
        club_id=b.club_id,
        club_name=b.club.name if b.club else None,
        venue_name=b.venue.name if b.venue else None,
        event_name=b.event_name or (b.event.name if b.event else None),
        booking_date=b.booking_date,
        time_slot=b.time_slot,
        requirements=reqs,
        status=b.status,
    )


# ── Bookings (conflict-checked) ──────────────────────────────────────
@router.post(
    "/bookings",
    response_model=schemas.BookingOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Venue or event not found"},
        409: {"model": schemas.ErrorOut, "description": "Venue already booked for this date"},
    },
)
def create_booking(
    payload: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    venue = db.query(models.Venue).filter(models.Venue.id == payload.venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    if payload.event_id:
        event = db.query(models.Event).filter(models.Event.id == payload.event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

    conflict = (
        db.query(models.Booking)
        .filter(
            models.Booking.venue_id == payload.venue_id,
            models.Booking.booking_date == payload.booking_date,
            models.Booking.status.not_in(["Released", "Cancelled"]),
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Venue is already booked on {payload.booking_date} (booking #{conflict.id})",
        )

    reqs_str = None
    if payload.requirements:
        if isinstance(payload.requirements, list):
            reqs_str = ", ".join(payload.requirements)
        else:
            reqs_str = str(payload.requirements)

    booking = models.Booking(
        venue_id=payload.venue_id,
        event_id=payload.event_id,
        club_id=payload.club_id,
        event_name=payload.event_name,
        booking_date=payload.booking_date,
        time_slot=payload.time_slot,
        requirements=reqs_str,
        status=payload.status or "Confirmed",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return _booking_to_schema(booking)


@router.get("/bookings", response_model=list[schemas.BookingOut])
def list_bookings(venue_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Booking)
    if venue_id:
        query = query.filter(models.Booking.venue_id == venue_id)
    bookings = query.all()
    return [_booking_to_schema(b) for b in bookings]


@router.patch("/bookings/{booking_id}", response_model=schemas.BookingOut)
def update_booking_status(
    booking_id: int,
    payload: schemas.BookingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = payload.status
    db.commit()
    db.refresh(booking)
    return _booking_to_schema(booking)


@router.post(
    "/bookings/{booking_id}/release",
    response_model=schemas.BookingOut,
    responses={404: {"model": schemas.ErrorOut, "description": "Booking not found"}},
)
def release_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = "Released"
    db.commit()
    db.refresh(booking)
    return _booking_to_schema(booking)


# ── Inventory ─────────────────────────────────────────────────────
@router.post(
    "/inventory",
    response_model=schemas.InventoryItemOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": schemas.ErrorOut, "description": "Item code already exists"}},
)
def create_inventory_item(
    payload: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    if db.query(models.InventoryItem).filter(models.InventoryItem.code == payload.code).first():
        raise HTTPException(status_code=409, detail="An item with this code already exists")
    item = models.InventoryItem(
        code=payload.code,
        name=payload.name,
        category=payload.category,
        total_stock=payload.total_stock,
        available_stock=payload.total_stock,
        status="In Stock",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/inventory", response_model=list[schemas.InventoryItemOut])
def list_inventory(db: Session = Depends(get_db)):
    return db.query(models.InventoryItem).all()


@router.patch(
    "/inventory/{item_id}",
    response_model=schemas.InventoryItemOut,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"},
        404: {"model": schemas.ErrorOut, "description": "Inventory item not found"},
    },
)
def update_inventory_item(
    item_id: int,
    payload: schemas.InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    updates = payload.model_dump(exclude_unset=True)
    # Keep the delta between total and available stock constant when the
    # total changes (i.e. items already checked out stay checked out).
    if "total_stock" in updates and updates["total_stock"] != item.total_stock:
        if "available_stock" not in updates:
            delta = item.total_stock - item.available_stock
            updates["available_stock"] = max(updates["total_stock"] - delta, 0)

    for field, value in updates.items():
        setattr(item, field, value)

    item.available_stock = min(max(item.available_stock, 0), item.total_stock)
    item.status = "Out of Stock" if item.available_stock == 0 else (
        "Low Stock" if item.available_stock < item.total_stock * 0.2 else "In Stock"
    )
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/inventory/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"},
        404: {"model": schemas.ErrorOut, "description": "Inventory item not found"},
        409: {"model": schemas.ErrorOut, "description": "Item is referenced by inventory usage"},
    },
)
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if db.query(models.InventoryUsage).filter(models.InventoryUsage.item_id == item_id).first():
        raise HTTPException(
            status_code=409, detail="Item is referenced by inventory usage and cannot be deleted"
        )
    db.delete(item)
    db.commit()


@router.post(
    "/inventory/{item_id}/checkout",
    response_model=schemas.InventoryItemOut,
    responses={
        404: {"model": schemas.ErrorOut, "description": "Item or event not found"},
        409: {"model": schemas.ErrorOut, "description": "Not enough available stock"},
    },
)
def checkout_inventory(
    item_id: int,
    event_id: int,
    quantity: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if quantity <= 0:
        raise HTTPException(status_code=422, detail="quantity must be positive")
    if item.available_stock < quantity:
        raise HTTPException(status_code=409, detail="Not enough available stock")

    item.available_stock -= quantity
    item.status = "Out of Stock" if item.available_stock == 0 else (
        "Low Stock" if item.available_stock < item.total_stock * 0.2 else "In Stock"
    )
    db.add(models.InventoryUsage(
        event_id=event_id, item_id=item_id, quantity=quantity
    ))
    db.commit()
    db.refresh(item)
    return item


def _inventory_usage_to_schema(u: models.InventoryUsage) -> schemas.InventoryUsageOut:
    return schemas.InventoryUsageOut(
        id=u.id,
        item_id=u.item_id,
        item_name=u.item.name if u.item else None,
        event_id=u.event_id,
        club_id=u.club_id,
        club_name=u.club.name if u.club else None,
        event_name=u.event_name or (u.event.name if u.event else None),
        venue_id=u.venue_id,
        location=(u.venue.name if u.venue else None) or u.location,
        quantity=u.quantity,
        booking_date=u.booking_date,
        time_slot=u.time_slot,
        checked_out_at=u.checked_out_at,
        returned_at=u.returned_at,
        status=u.status or "Booked",
    )


@router.get("/inventory/usage", response_model=list[schemas.InventoryUsageOut])
def list_inventory_usage(db: Session = Depends(get_db)):
    usage_list = db.query(models.InventoryUsage).all()
    return [_inventory_usage_to_schema(u) for u in usage_list]


@router.post(
    "/inventory/usage",
    response_model=schemas.InventoryUsageOut,
    status_code=status.HTTP_201_CREATED,
)
def create_inventory_usage(
    payload: schemas.InventoryUsageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if payload.quantity > 0:
        item.available_stock = max(item.available_stock - payload.quantity, 0)
        item.status = "Out of Stock" if item.available_stock == 0 else (
            "Low Stock" if item.available_stock < item.total_stock * 0.2 else "In Stock"
        )

    status_value = payload.status or "Booked"
    usage = models.InventoryUsage(
        item_id=payload.item_id,
        event_id=payload.event_id,
        club_id=payload.club_id,
        event_name=payload.event_name,
        venue_id=payload.venue_id,
        location=payload.location,
        quantity=payload.quantity,
        booking_date=payload.booking_date,
        time_slot=payload.time_slot,
        # Only actually "in use" allocations (e.g. a direct volunteer handover)
        # get a checked_out_at timestamp at creation time -- a plain "Booked"
        # reservation hasn't been handed out yet, so it stays null until
        # /inventory/usage/{id}/mark-in-use is called.
        checked_out_at=datetime.datetime.utcnow() if status_value == "In Use" else None,
        status=status_value,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return _inventory_usage_to_schema(usage)


@router.post("/inventory/usage/{usage_id}/mark-in-use", response_model=schemas.InventoryUsageOut)
def mark_inventory_usage_in_use(
    usage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    usage = db.query(models.InventoryUsage).filter(models.InventoryUsage.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail="Inventory usage record not found")

    if usage.status not in ("In Use", "Returned"):
        usage.status = "In Use"
        usage.checked_out_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(usage)
    return _inventory_usage_to_schema(usage)


@router.post("/inventory/usage/{usage_id}/return", response_model=schemas.InventoryUsageOut)
def return_inventory_usage(
    usage_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.ROLE_CLUB_HEAD, models.ROLE_CLUB_PRESIDENT, models.ROLE_FACULTY_COORDINATOR)
    ),
):
    usage = db.query(models.InventoryUsage).filter(models.InventoryUsage.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail="Inventory usage record not found")

    if usage.status != "Returned":
        usage.returned_at = datetime.datetime.utcnow()
        usage.status = "Returned"
        item = db.query(models.InventoryItem).filter(models.InventoryItem.id == usage.item_id).first()
        if item:
            item.available_stock = min(item.available_stock + usage.quantity, item.total_stock)
            item.status = "In Stock" if item.available_stock > item.total_stock * 0.2 else (
                "Low Stock" if item.available_stock > 0 else "Out of Stock"
            )
        db.commit()
        db.refresh(usage)
    return _inventory_usage_to_schema(usage)


# ── Bulk Setup Endpoints (Faculty Coordinator Only) ───────────────
# ── Bulk Setup Endpoints (Faculty Coordinator Only) ───────────────
@router.post(
    "/venues/bulk",
    response_model=schemas.BulkVenueOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
@router.post(
    "/venues/bulk-import",
    response_model=schemas.BulkVenueOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
async def create_venues_bulk(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[List[schemas.VenueCreate]] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    items_to_process: List[schemas.VenueCreate] = []

    if file and file.filename:
        content = file.file.read().decode("utf-8")
        csv_reader = csv.DictReader(io.StringIO(content))
        for row in csv_reader:
            cap_val = row.get("capacity", "").strip()
            capacity = int(cap_val) if cap_val.isdigit() else 0
            items_to_process.append(
                schemas.VenueCreate(
                    name=row.get("name", "").strip(),
                    capacity=capacity,
                    location=row.get("location", "").strip() or None,
                    facilities=row.get("facilities", "").strip() or None,
                    requirements=row.get("requirements", "").strip() or None,
                )
            )
    elif payload:
        items_to_process = payload
    else:
        try:
            body_json = await request.json()
            if isinstance(body_json, list):
                items_to_process = [schemas.VenueCreate(**item) for item in body_json]
        except Exception:
            pass

    results = []
    created_count = 0
    failed_count = 0

    for idx, v in enumerate(items_to_process, start=1):
        if not v.name or (v.capacity is not None and v.capacity <= 0):
            failed_count += 1
            results.append(
                schemas.BulkVenueItemResult(
                    index=idx,
                    name=v.name or "Unnamed",
                    status="error",
                    venue=None,
                    error="Venue name cannot be empty and capacity must be > 0",
                )
            )
            continue

        existing = db.query(models.Venue).filter(models.Venue.name == v.name).first()
        if existing:
            failed_count += 1
            results.append(
                schemas.BulkVenueItemResult(
                    index=idx,
                    name=v.name,
                    status="error",
                    venue=None,
                    error=f"Venue with name '{v.name}' already exists",
                )
            )
            continue

        try:
            venue = models.Venue(
                name=v.name,
                capacity=v.capacity,
                location=v.location,
                facilities=v.facilities,
                requirements=v.requirements,
            )
            db.add(venue)
            db.commit()
            db.refresh(venue)
            created_count += 1
            results.append(
                schemas.BulkVenueItemResult(
                    index=idx,
                    name=venue.name,
                    status="success",
                    venue=schemas.VenueOut.model_validate(venue),
                    error=None,
                )
            )
        except Exception as e:
            db.rollback()
            failed_count += 1
            results.append(
                schemas.BulkVenueItemResult(
                    index=idx,
                    name=v.name,
                    status="error",
                    venue=None,
                    error=str(e),
                )
            )

    return schemas.BulkVenueOut(
        total=len(items_to_process),
        created=created_count,
        failed=failed_count,
        results=results,
    )


@router.post(
    "/inventory/bulk",
    response_model=schemas.BulkInventoryOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
@router.post(
    "/inventory/bulk-import",
    response_model=schemas.BulkInventoryOut,
    status_code=status.HTTP_200_OK,
    responses={403: {"model": schemas.ErrorOut, "description": "Faculty Coordinator role required"}},
)
async def create_inventory_bulk(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[List[schemas.InventoryItemCreate]] = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.ROLE_FACULTY_COORDINATOR)),
):
    items_to_process: List[schemas.InventoryItemCreate] = []

    if file and file.filename:
        content = file.file.read().decode("utf-8")
        csv_reader = csv.DictReader(io.StringIO(content))
        for idx, row in enumerate(csv_reader, start=1):
            code = row.get("code", "").strip() or f"INV-ITEM-{idx:03d}"
            name = row.get("name", "").strip()
            cat = row.get("category", "").strip() or "General"
            tot_val = row.get("total_stock", "").strip()
            total_stock = int(tot_val) if tot_val.isdigit() else 0
            avail_val = row.get("available_stock", "").strip()
            available_stock = int(avail_val) if avail_val.isdigit() else total_stock

            items_to_process.append(
                schemas.InventoryItemCreate(
                    code=code,
                    name=name,
                    category=cat,
                    total_stock=total_stock,
                    available_stock=available_stock,
                )
            )
    elif payload:
        items_to_process = payload
    else:
        try:
            body_json = await request.json()
            if isinstance(body_json, list):
                items_to_process = []
                for idx, item in enumerate(body_json, start=1):
                    code = item.get("code") or f"INV-ITEM-{idx:03d}"
                    name = item.get("name", "")
                    cat = item.get("category") or "General"
                    tot = item.get("total_stock", 0)
                    avail = item.get("available_stock", tot)
                    items_to_process.append(
                        schemas.InventoryItemCreate(
                            code=code,
                            name=name,
                            category=cat,
                            total_stock=tot,
                            available_stock=avail,
                        )
                    )
        except Exception:
            pass

    results = []
    created_count = 0
    failed_count = 0

    for idx, item_data in enumerate(items_to_process, start=1):
        if not item_data.name or item_data.total_stock < 0:
            failed_count += 1
            results.append(
                schemas.BulkInventoryItemResult(
                    index=idx,
                    name=item_data.name or "Unnamed",
                    status="error",
                    inventory_item=None,
                    error="Item name cannot be empty and total_stock must be >= 0",
                )
            )
            continue

        existing = db.query(models.InventoryItem).filter(models.InventoryItem.code == item_data.code).first()
        if existing:
            failed_count += 1
            results.append(
                schemas.BulkInventoryItemResult(
                    index=idx,
                    name=item_data.name,
                    status="error",
                    inventory_item=None,
                    error=f"Inventory item with code '{item_data.code}' already exists",
                )
            )
            continue

        try:
            avail = item_data.available_stock if item_data.available_stock is not None else item_data.total_stock
            item = models.InventoryItem(
                code=item_data.code,
                name=item_data.name,
                category=item_data.category or "General",
                total_stock=item_data.total_stock,
                available_stock=avail,
                status="In Stock" if avail > 0 else "Out of Stock",
            )
            db.add(item)
            db.commit()
            db.refresh(item)
            created_count += 1
            results.append(
                schemas.BulkInventoryItemResult(
                    index=idx,
                    name=item.name,
                    status="success",
                    inventory_item=schemas.InventoryItemOut.model_validate(item),
                    error=None,
                )
            )
        except Exception as e:
            db.rollback()
            failed_count += 1
            results.append(
                schemas.BulkInventoryItemResult(
                    index=idx,
                    name=item_data.name,
                    status="error",
                    inventory_item=None,
                    error=str(e),
                )
            )

    return schemas.BulkInventoryOut(
        total=len(items_to_process),
        created=created_count,
        failed=failed_count,
        results=results,
    )

