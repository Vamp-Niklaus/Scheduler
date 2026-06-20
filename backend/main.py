from fastapi import FastAPI, HTTPException, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId

from database import init_db, revisions_collection, users_collection
from scheduler import calculate_fixed_schedule, calculate_load_balanced_schedule

app = FastAPI(title="Spaced Repetition Scheduler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# --- User Models ---
class UserRegister(BaseModel):
    name: str
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    name: str
    username: str

import urllib.request
import re

# --- Task Models ---
class RevisionTask(BaseModel):
    title: str = ""
    content_type: str = Field(..., description="url, text, or image")
    content: str
    stage: int = 0
    next_revision: Optional[datetime] = None
    username: Optional[str] = None # Ties task to user

class TaskResponse(RevisionTask):
    id: str
    bg_color: Optional[str] = None

# --- Auth Endpoints ---
@app.post("/register", response_model=UserResponse)
async def register(user: UserRegister):
    existing_user = await users_collection.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    user_dict = user.dict()
    await users_collection.insert_one(user_dict)
    return UserResponse(name=user.name, username=user.username)

@app.post("/login", response_model=UserResponse)
async def login(user: UserLogin):
    existing_user = await users_collection.find_one({"username": user.username, "password": user.password})
    if not existing_user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    return UserResponse(name=existing_user["name"], username=existing_user["username"])

def extract_title_from_url(url: str) -> str:
    """Extracts a readable title from supported URLs."""
    try:
        # LeetCode
        if "leetcode.com/problems/" in url:
            match = re.search(r'leetcode\.com/problems/([^/]+)', url)
            if match:
                return match.group(1).replace('-', ' ').title()
                
        # Code360 (Naukri)
        elif "naukri.com/code360/problems/" in url:
            match = re.search(r'naukri\.com/code360/problems/([^/_]+)', url)
            if match:
                return match.group(1).replace('-', ' ').title()
                
        # GeeksForGeeks
        elif "geeksforgeeks.org/problems/" in url:
            match = re.search(r'geeksforgeeks\.org/problems/([^/]+)', url)
            if match:
                return match.group(1).replace('-', ' ').title()
                
        # YouTube
        elif "youtube.com" in url or "youtu.be" in url:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3) as response:
                html = response.read().decode('utf-8', errors='ignore')
                match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
                if match:
                    title = match.group(1).replace('- YouTube', '').strip()
                    return title if title else "YouTube Video"
            return "YouTube Video"
            
    except Exception as e:
        print(f"Title extraction error: {e}")
        
    return "Untitled Link"

# --- Task Endpoints ---
def format_task(doc) -> TaskResponse:
    title = doc["title"]
    content = doc.get("content", "").lower()
    content_type = doc.get("content_type", "")
    bg_color = "#1E293B" # Default slate
    
    if content_type == "url":
        if "leetcode.com" in content:
            title = f"👨‍💻 {title}"
            bg_color = "#FFA116"
        elif "youtube.com" in content or "youtu.be" in content:
            title = f"▶️ {title}"
            bg_color = "#FF0000"
        elif "geeksforgeeks.org" in content:
            title = f"🤓 {title}"
            bg_color = "#2F8D46"
        elif "naukri.com" in content:
            title = f"🥷 {title}"
            bg_color = "#2563EB"
        elif "github.com" in content:
            title = f"🐙 {title}"
            bg_color = "#333333"
        else:
            title = f"🌐 {title}"
            bg_color = "#0F172A"
    elif content_type == "text":
        title = f"📝 {title}"
        bg_color = "#6366F1"
    elif content_type == "image":
        title = f"🖼️ {title}"
        bg_color = "#8B5CF6"

    return TaskResponse(
        id=str(doc["_id"]),
        title=title,
        content_type=doc["content_type"],
        content=doc["content"],
        stage=doc["stage"],
        next_revision=doc["next_revision"],
        username=doc.get("username", ""),
        bg_color=bg_color
    )

@app.post("/tasks", response_model=TaskResponse)
async def create_task(task: RevisionTask, x_username: str = Header(...)):
    # Verify user exists
    user = await users_collection.find_one({"username": x_username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Auto-extract title if missing
    if not task.title.strip() and task.content_type == "url":
        task.title = extract_title_from_url(task.content)
    elif not task.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    task.username = x_username
    task.next_revision = calculate_fixed_schedule(0)
    task.stage = 0
    
    result = await revisions_collection.insert_one(task.dict())
    created_task = await revisions_collection.find_one({"_id": result.inserted_id})
    return format_task(created_task)

@app.get("/tasks/next")
async def get_next_task(username: Optional[str] = None, x_username: Optional[str] = Header(None)):
    target_username = username or x_username
    if not target_username:
        raise HTTPException(status_code=401, detail="Username required via query param or x-username header")

    now = datetime.utcnow()
    task = await revisions_collection.find_one(
        {"username": target_username, "next_revision": {"$lte": now}},
        sort=[("next_revision", 1)]
    )
    if task:
        return format_task(task)
    
    # Return dummy task so KWGT doesn't crash on null
    return {
        "id": "",
        "title": "All caught up!",
        "content_type": "text",
        "content": "",
        "stage": -1,
        "bg_color": "#00000000"
    }

@app.post("/tasks/{task_id}/done", response_model=TaskResponse)
async def mark_task_done(task_id: str, x_username: str = Header(...)):
    task = await revisions_collection.find_one({"_id": ObjectId(task_id), "username": x_username})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or does not belong to you")

    current_stage = task["stage"]
    now = datetime.utcnow()

    if current_stage < 2:
        new_stage = current_stage + 1
        next_date = calculate_fixed_schedule(new_stage)
    elif current_stage == 2:
        new_stage = 3
        next_date = calculate_fixed_schedule(new_stage)
    else:
        new_stage = current_stage + 1
        next_date = await calculate_load_balanced_schedule(revisions_collection, now)

    await revisions_collection.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": {
            "stage": new_stage,
            "next_revision": next_date
        }}
    )
    
    updated_task = await revisions_collection.find_one({"_id": ObjectId(task_id)})
    return format_task(updated_task)

@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str, x_username: str = Header(...)):
    task = await revisions_collection.find_one({"_id": ObjectId(task_id), "username": x_username})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or does not belong to you")
        
    await revisions_collection.delete_one({"_id": ObjectId(task_id)})
    return {"status": "success", "detail": "Task deleted successfully"}
