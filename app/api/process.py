from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import os
import uuid
import base64
import asyncio
from app.services.ocr_service import ocr_service
from app.services.pdf_service import pdf_service

router = APIRouter()

@router.post("/process-doc")
async def process_document(
    files: List[UploadFile] = File(...),
    folder_names: Optional[str] = Form(None)
):
    """
    Stateless processing: 
    1. Receive images.
    2. OCR the first image for metadata.
    3. Generate PDF from all.
    4. Return JSON + Base64 PDF.
    5. No local storage.
    """
    try:
        processed_images = []
        primary_fields = {}
        
        for i, file in enumerate(files):
            # Pacing between documents to avoid 429 (Increased to 5s as requested)
            if i > 0: await asyncio.sleep(5)
            
            raw_content = await file.read()
            
            # 1. AI Pass 1: Locate Document (Bounding Box & Type)
            meta_result = await ocr_service.locate_document(raw_content)
            
            if not meta_result or "error" in meta_result:
                return JSONResponse({"status": "error", "detail": "Document localization failed."}, status_code=503)

            # 2. Professional Scanning: Crop & Enhance (Pillow)
            # This creates the zoomed-in, high-quality scan for the next pass
            clean_content = ocr_service.enhance_document(raw_content, meta_result)

            # 3. AI Pass 2: OCR on the CROPPED/ENHANCED image for max precision
            # Parse folder names if provided
            folder_list = folder_names.split(',') if folder_names else None
            vision_result = await ocr_service.extract_data_from_scan(clean_content, folder_names=folder_list)
            
            if not vision_result or "error" in vision_result:
                return JSONResponse({"status": "error", "detail": "OCR extraction failed."}, status_code=503)

            # If it's the first image, keep its fields as primary metadata
            if i == 0:
                print(f"DEBUG: Professional Results (Crop + OCR): {vision_result}")
                primary_fields = vision_result.get("տվյալներ", {})
                primary_fields["առաջարկվող_անվանում"] = vision_result.get("առաջարկվող_անվանում", "Doc")
                # Keep the AI suggestion
                primary_fields["suggested_folder"] = vision_result.get("suggested_folder")
            
            # 4. Store processed image for PDF
            doc_size = meta_result.get("size", "large")
            doc_type = meta_result.get("type", "")
            
            processed_images.append({
                "bytes": clean_content,
                "size": doc_size,
                "type": doc_type
            })

        if not processed_images:
            return JSONResponse({"status": "error", "detail": "All documents failed to process due to API limits."}, status_code=503)

        # 4. Generate Smart PDF from the clean scans
        pdf_bytes = pdf_service.create_pdf_from_images(processed_images)
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        # 5. Generate thumbnail from first page (clean scan)
        thumbnail_base64 = base64.b64encode(processed_images[0]["bytes"]).decode('utf-8')
        
        return JSONResponse({
            "status": "success",
            "extracted_fields": primary_fields,
            "raw_text": "Vision processing used (Smart A4 Layout Enabled)",
            "pdf_base64": pdf_base64,
            "thumbnail_base64": thumbnail_base64
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-profile")
async def generate_profile(data: List[dict]):
    """Receives a list of dicts (from all documents) and returns a synthesized bio."""
    bio = await ocr_service.generate_user_profile(data)
    return {"status": "success", "profile": bio}
