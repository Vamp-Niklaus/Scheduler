from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import asyncio
from bson import ObjectId

from database import init_db, revisions_collection
from scheduler import calculate_fixed_schedule, calculate_load_balanced_schedule

app = FastAPI(title="Spaced Repetition Scheduler API")

# Allow Frontend to communicate with Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/ping")
async def keep_alive():
    """Dummy endpoint to keep the Render server awake."""
    return {"status": "awake", "timestamp": datetime.utcnow().isoformat()}

# Models
class RevisionTask(BaseModel):
    title: str
    content_type: str = Field(..., description="url, text, or image")
    content: str
    stage: int = 0
    next_revision: Optional[datetime] = None

class TaskResponse(RevisionTask):
    id: str

# Helper to format MongoDB document
def format_task(doc) -> TaskResponse:
    return TaskResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        content_type=doc["content_type"],
        content=doc["content"],
        stage=doc["stage"],
        next_revision=doc["next_revision"]
    )

@app.post("/tasks", response_model=TaskResponse)
async def create_task(task: RevisionTask):
    # Calculate initial 3-day (15s) schedule
    task.next_revision = calculate_fixed_schedule(0)
    task.stage = 0
    
    result = await revisions_collection.insert_one(task.dict())
    created_task = await revisions_collection.find_one({"_id": result.inserted_id})
    return format_task(created_task)

@app.get("/tasks/next", response_model=Optional[TaskResponse])
async def get_next_task():
    """Gets the single task that is due earliest."""
    now = datetime.utcnow()
    # Find a task where next_revision is in the past (i.e. due)
    task = await revisions_collection.find_one(
        {"next_revision": {"$lte": now}},
        sort=[("next_revision", 1)]
    )
    if task:
        return format_task(task)
    return None

@app.post("/tasks/{task_id}/done", response_model=TaskResponse)
async def mark_task_done(task_id: str):
    """Marks a task as done, increments its stage, and schedules the next revision."""
    task = await revisions_collection.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    current_stage = task["stage"]
    now = datetime.utcnow()

    # Determine next schedule
    if current_stage < 2:
        # Stages 0 (New->3d), 1 (3d->7d)
        new_stage = current_stage + 1
        next_date = calculate_fixed_schedule(new_stage)
    elif current_stage == 2:
        # Stage 2 (7d->21d)
        new_stage = 3
        next_date = calculate_fixed_schedule(new_stage)
    else:
        # Stage 3+ (Load balanced in 21-35d window)
        new_stage = current_stage + 1
        next_date = await calculate_load_balanced_schedule(revisions_collection, now)

    # Update in DB
    await revisions_collection.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": {
            "stage": new_stage,
            "next_revision": next_date
        }}
    )
    
    updated_task = await revisions_collection.find_one({"_id": ObjectId(task_id)})
    return format_task(updated_task)

# Run with: uvicorn main:app --reload
