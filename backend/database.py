import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "scheduler")

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]
revisions_collection = db.get_collection("revisions")

async def init_db():
    # Ensure indexes for quick sorting and finding tasks
    await revisions_collection.create_index([("next_revision", 1)])
