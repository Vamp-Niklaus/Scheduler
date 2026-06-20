import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import HumanMessage, SystemMessage

load_dotenv()

def calculate_fixed_schedule(current_stage: int) -> datetime:
    """Calculates the next revision date using fixed math for stages 0 to 3."""
    now = datetime.utcnow()
    
    if current_stage == 0:
        offset = 1
    elif current_stage == 1:
        offset = 3
    elif current_stage == 2:
        offset = 7
    else:
        offset = 21

    return now + timedelta(days=offset)

async def calculate_load_balanced_schedule(db_collection, now: datetime) -> datetime:
    """
    Uses Langchain and Gemini to analyze the workload between [now + 21 days] 
    and [now + 35 days] and picks the optimal day.
    """
    # 1. Define our window (21 to 35 days)
    start_window = now + timedelta(days=21)
    end_window = now + timedelta(days=35)

    # 2. Query MongoDB for all tasks scheduled in this window
    cursor = db_collection.find({
        "next_revision": {"$gte": start_window, "$lte": end_window}
    })
    tasks = await cursor.to_list(length=100)

    # 3. Create a simple "calendar" of loads
    load_calendar = { (21 + i): 0 for i in range(15) } # Days 21 to 35
    
    for t in tasks:
        task_time = t.get("next_revision")
        delta_days = (task_time - now).days
        if 21 <= delta_days <= 35:
            load_calendar[delta_days] += 1

    # 4. Use Langchain LLM to pick the best day
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_google_gemini_api_key_here":
        print("No Gemini API key, falling back to math load balancer.")
        best_day = min(load_calendar, key=load_calendar.get)
        return now + timedelta(days=best_day)

    try:
        llm = ChatGoogleGenerativeAI(model="gemini-pro", google_api_key=api_key)
        
        system_prompt = SystemMessage(content="You are an intelligent load-balancing scheduler. Your job is to return ONLY a single integer representing the best day to schedule a new task.")
        
        user_prompt = HumanMessage(content=f"""
        Here is my current revision workload from day 21 to day 35. 
        Format: {{day: number_of_tasks_scheduled}}
        {load_calendar}
        
        I need to schedule a new revision in this window. To keep my workload balanced, pick the day with the absolute lowest number of tasks. 
        If there is a tie, pick the earliest day available.
        Return ONLY the integer day (e.g. 24). Do not return any other text.
        """)

        response = llm.invoke([system_prompt, user_prompt])
        best_day_str = response.content.strip()
        best_day = int(best_day_str)
        
        # Safety check
        if best_day < 21 or best_day > 35:
            best_day = 21

        return now + timedelta(days=best_day)

    except Exception as e:
        print(f"Langchain error: {e}")
        # Fallback to python math
        best_day = min(load_calendar, key=load_calendar.get)
        return now + timedelta(days=best_day)
