from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, FileResponse
from app.api import process
import os
import uuid
import time
import random
from datetime import datetime, timedelta
from typing import Dict

app = FastAPI(title="ArmperID")

# Ensure uploads directory exists for temp processing
os.makedirs("uploads/temp", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# RAM-based storage for shared documents (Security First)
# Format: { share_id: { "title": str, "image": str, "fields": dict, "security_number": int, "options": [int], "expires_at": int } }
active_shares: Dict[str, dict] = {}

# Include routers
app.include_router(process.router, prefix="/api/process", tags=["process"])

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse(request, "index.html", {"request": request})

@app.post("/api/process/ai-search/")
async def ai_search_direct(data: dict):
    from app.services.ocr_service import ocr_service
    prompt = data.get("prompt")
    docs = data.get("documents", [])
    lang = data.get("lang", "en")
    result = await ocr_service.ai_ask_documents(prompt, docs, lang)
    return JSONResponse(result)

# --- Timed Sharing Endpoints ---

@app.post("/api/share/create")
async def create_share(data: dict):
    share_id = str(uuid.uuid4())
    minutes = int(data.get("minutes", 60))
    
    # Generate Security Number (Google Style)
    secure_num = random.randint(10, 99)
    # Generate 2 distractors
    distractors = random.sample([n for n in range(10,99) if n != secure_num], 2)
    options = distractors + [secure_num]
    random.shuffle(options)
    
    expires_at = int(time.time()) + (minutes * 60)
    
    active_shares[share_id] = {
        "title": data.get("title", "Document"),
        "image": data.get("image"), # Base64
        "fields": data.get("fields", {}),
        "security_number": secure_num,
        "options": options,
        "expires_at": expires_at
    }
    
    # Cleanup background check (simple)
    now = time.time()
    expired_keys = [k for k,v in active_shares.items() if v["expires_at"] < now]
    for k in expired_keys: del active_shares[k]
    
    return JSONResponse({
        "share_id": share_id,
        "security_number": secure_num,
        "expires_at": expires_at
    })

@app.get("/share/{share_id}")
async def public_share_page(request: Request, share_id: str):
    if share_id not in active_shares:
        return templates.TemplateResponse(request, "share_page.html", {"request": request, "error": "Not Found"})
    return templates.TemplateResponse(request, "share_page.html", {"request": request, "share_id": share_id})

@app.get("/api/share/init/{share_id}")
async def init_share(share_id: str):
    share = active_shares.get(share_id)
    if not share or share["expires_at"] < time.time():
        return JSONResponse({"error": "Expired"}, status_code=404)
    return JSONResponse({"options": share["options"]})

@app.post("/api/share/verify/{share_id}")
async def verify_share(share_id: str, data: dict):
    share = active_shares.get(share_id)
    if not share or share["expires_at"] < time.time():
        return JSONResponse({"error": "Expired"}, status_code=404)
    
    if int(data.get("security_number")) == share["security_number"]:
        # Success: Return the actual data
        return JSONResponse({
            "title": share["title"],
            "image": share["image"],
            "fields": share["fields"]
        })
    return JSONResponse({"error": "Invalid Code"}, status_code=403)

if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 for LAN access as requested
    uvicorn.run(app, host="0.0.0.0", port=8000)
