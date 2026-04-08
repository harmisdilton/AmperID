from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, FileResponse
from app.api import process
import os

app = FastAPI(title="ArmperID")

# Ensure uploads directory exists for temp processing
os.makedirs("uploads/temp", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

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

if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 for LAN access as requested
    uvicorn.run(app, host="0.0.0.0", port=8000)
