# app/api/routes/projects.py

import logging
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.db import crud
from app.models.schemas import (
    MessageResponse,
    ProjectCreateRequest,
    ProjectResponse,
    ProjectUpdateRequest,
)

router = APIRouter(prefix="/projects", tags=["projects"])
log    = logging.getLogger(__name__)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    _user = Depends(get_current_user),
):
    """Return all projects ordered by name."""
    return crud.get_projects()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreateRequest,
    _user = Depends(get_current_user),
):
    """Create a new project."""
    # Ensure name is unique
    existing = crud.get_projects()
    if any(p["name"].lower() == body.name.strip().lower() for p in existing):
        raise HTTPException(status_code=409, detail=f"Project '{body.name}' already exists")

    row = crud.add_project(
        name=body.name.strip(),
        budget=body.budget,
        status=body.status,
    )
    return row


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    _user = Depends(get_current_user),
):
    """Update name, budget, or status of a project."""
    projects = crud.get_projects()
    existing = next((p for p in projects if p["id"] == project_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")

    # Merge incoming fields with current values
    name   = body.name.strip()   if body.name   is not None else existing["name"]
    budget = body.budget          if body.budget is not None else existing["budget"]
    status = body.status          if body.status is not None else existing["status"]

    row = crud.update_project(project_id, name=name, budget=budget, status=status)
    # update_project returns the raw Supabase row; re-fetch for consistency
    updated = next(
        (p for p in crud.get_projects() if p["id"] == project_id),
        row,
    )
    return updated


@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(
    project_id: str,
    _user = Depends(get_current_user),
):
    """
    Delete a project. Invoices assigned to it will have their project_id
    set to NULL (Unassigned) by the Supabase foreign key ON DELETE SET NULL.
    """
    projects = crud.get_projects()
    if not any(p["id"] == project_id for p in projects):
        raise HTTPException(status_code=404, detail="Project not found")

    crud.delete_project(project_id)
    return {"message": f"Project {project_id} deleted"}
