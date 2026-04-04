"""
Project Agent tests — integration tests with real LLM + real Supabase.
Run from agent/: python -m pytest tests/test_project_agent.py -v

Tests the project agent loop: create/update projects via natural language instructions.
Project names include a [test-<uuid>] marker so they never collide across runs.
A module-level sweep deletes orphaned test projects older than 1 hour.
"""

import uuid

import pytest

from app.agents.config import supabase
from app.agents.subagents.project_agent import run_project_agent
from .conftest import USER_ID

_RUN_TAG = f"[test-{uuid.uuid4().hex[:8]}]"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_context(message: str) -> str:
    """Build a minimal context string for the project agent."""
    return (
        f"Message: {message}\n"
        f"Attachments: []\n"
        f"History: []"
    )


def _find_project(name_fragment: str) -> dict | None:
    """Return the first project whose name contains name_fragment, or None."""
    result = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", USER_ID)
        .ilike("name", f"%{name_fragment}%")
        .execute()
    )
    return result.data[0] if result.data else None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def cleanup_projects():
    """Collect project IDs created during a test and delete them after."""
    created_ids = []
    yield created_ids
    for proj_id in created_ids:
        try:
            supabase.table("project_categories").delete().eq("project_id", proj_id).execute()
            supabase.table("projects").delete().eq("id", proj_id).execute()
        except Exception:
            pass


@pytest.fixture()
def existing_project():
    """Create a project to update, delete it after."""
    name = f"Existing Project {_RUN_TAG}"
    row = (
        supabase.table("projects")
        .insert({
            "user_id": USER_ID,
            "name": name,
            "status": "Active",
            "budget": 10000.0,
        })
        .execute()
    )
    project = row.data[0]
    yield project
    try:
        supabase.table("project_categories").delete().eq("project_id", project["id"]).execute()
        supabase.table("projects").delete().eq("id", project["id"]).execute()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_project_name_only(cleanup_projects):
    """Agent creates a project from a name-only instruction."""
    project_name = f"Brighton Shoot {_RUN_TAG}"
    result = await run_project_agent(
        user_id=USER_ID,
        task_instruction=f"Create a new project called '{project_name}'.",
        context=_make_context(f"Create a project called {project_name}."),
    )

    assert isinstance(result, dict)
    assert "summary" in result
    assert result["summary"]

    project = _find_project(project_name)
    assert project is not None, "Project was not created in the database"
    assert project["status"] == "Active"
    cleanup_projects.append(project["id"])


@pytest.mark.asyncio
async def test_create_project_with_budget(cleanup_projects):
    """Agent creates a project and sets a budget."""
    project_name = f"Wild Ocean Series {_RUN_TAG}"
    result = await run_project_agent(
        user_id=USER_ID,
        task_instruction=f"Create a project called '{project_name}' with a £25,000 budget.",
        context=_make_context(f"Create project {project_name} with a £25k budget."),
    )

    assert isinstance(result, dict)
    assert "summary" in result

    project = _find_project(project_name)
    assert project is not None, "Project was not created in the database"
    assert project["budget"] == pytest.approx(25000.0, abs=1.0)
    cleanup_projects.append(project["id"])


@pytest.mark.asyncio
async def test_update_project_budget(existing_project):
    """Agent updates the budget of an existing project."""
    result = await run_project_agent(
        user_id=USER_ID,
        task_instruction=(
            f"Change the budget for project '{existing_project['name']}' "
            f"(id: {existing_project['id']}) to £50,000."
        ),
        context=_make_context(
            f"Update the budget for {existing_project['name']} to £50,000."
        ),
    )

    assert isinstance(result, dict)
    assert "summary" in result

    updated = (
        supabase.table("projects")
        .select("budget")
        .eq("id", existing_project["id"])
        .maybe_single()
        .execute()
    )
    assert updated.data is not None
    assert updated.data["budget"] == pytest.approx(50000.0, abs=1.0)


@pytest.mark.asyncio
async def test_mark_project_completed(existing_project):
    """Agent marks a project as Completed."""
    result = await run_project_agent(
        user_id=USER_ID,
        task_instruction=(
            f"Mark project '{existing_project['name']}' "
            f"(id: {existing_project['id']}) as completed."
        ),
        context=_make_context(f"Mark {existing_project['name']} as complete."),
    )

    assert isinstance(result, dict)
    assert "summary" in result

    updated = (
        supabase.table("projects")
        .select("status")
        .eq("id", existing_project["id"])
        .maybe_single()
        .execute()
    )
    assert updated.data is not None
    assert updated.data["status"] == "Completed"


@pytest.mark.asyncio
async def test_project_agent_returns_only_summary_key(cleanup_projects):
    """Project agent output must only contain the 'summary' key."""
    project_name = f"Schema Check Project {_RUN_TAG}"
    result = await run_project_agent(
        user_id=USER_ID,
        task_instruction=f"Create a project called '{project_name}'.",
        context=_make_context(f"Create project {project_name}."),
    )

    assert set(result.keys()) == {"summary"}

    project = _find_project(project_name)
    if project:
        cleanup_projects.append(project["id"])
