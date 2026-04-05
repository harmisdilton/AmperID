from fastapi.responses import JSONResponse, FileResponse
from app.api import process
import os

app = FastAPI(title="ArmperID")

# Serve manifest and sw from root
@app.get("/manifest.json")
async def get_manifest():
    return FileResponse("static/manifest.json")

@app.get("/sw.js")
async def get_sw():
    return FileResponse("static/sw.js")

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

if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 for LAN access as requested
    uvicorn.run(app, host="0.0.0.0", port=8000)
