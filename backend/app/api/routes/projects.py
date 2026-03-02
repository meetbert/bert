# app/api/routes/projects.py

import logging
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_auth
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
async def list_projects(user: dict = Depends(require_auth)):
    return crud.get_projects(user["id"])


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreateRequest,
    user: dict = Depends(require_auth),
):
    existing = crud.get_projects(user["id"])
    if any(p["name"].lower() == body.name.strip().lower() for p in existing):
        raise HTTPException(status_code=409, detail=f"Project '{body.name}' already exists")

    return crud.add_project(
        name=body.name.strip(),
        budget=body.budget,
        status=body.status,
        user_id=user["id"],
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    user: dict = Depends(require_auth),
):
    projects = crud.get_projects(user["id"])
    existing = next((p for p in projects if p["id"] == project_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")

    name   = body.name.strip()   if body.name   is not None else existing["name"]
    budget = body.budget          if body.budget is not None else existing["budget"]
    status = body.status          if body.status is not None else existing["status"]

    crud.update_project(project_id, name=name, budget=budget, status=status)
    updated = next(
        (p for p in crud.get_projects(user["id"]) if p["id"] == project_id),
        existing,
    )
    return updated


@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(
    project_id: str,
    user: dict = Depends(require_auth),
):
    projects = crud.get_projects(user["id"])
    if not any(p["id"] == project_id for p in projects):
        raise HTTPException(status_code=404, detail="Project not found")

    crud.delete_project(project_id)
    return {"message": f"Project {project_id} deleted"}
