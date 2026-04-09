import json
import asyncio
import os
import io
from PIL import Image, ImageEnhance, ImageFilter
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class OCRService:
    def __init__(self):
        # Initialize Gemini settings with API key from environment variable
        self.api_key = os.getenv("api_key")
        self.client = genai.Client(api_key=self.api_key)
        self.model = "gemini-2.5-flash"

    async def locate_document(self, image_bytes):
        """Pass 1: Identifies document boundaries and type for precision cropping."""
        # Pre-enhance to help AI see edges
        enhanced = self.pre_enhance_for_ocr(image_bytes)
        optimized = self.resize_image_for_ai(enhanced)

        prompt = """
        You are the AmperID Spatial Localization Engine. Your goal is to identify and frame the target document within the image with extreme precision.
        
        TASK:
        1. Return ONE bounding box covering the MAIN document area: [ymin, xmin, ymax, xmax] using normalized coordinates (0–1000).
        2. Ensure the box captures ALL relevant information including stamps, fine print at the edges, and headers.
        3. Identify the document category precisely (e.g., Passport, ID Card, Driver's License, Utility Bill, Medical Report, Receipt, Certificate).
        
        CRITICAL CROP STRATEGY: 
        - If the document naturally fills >90% of the frame or is already professionally cropped, set "should_crop" to false to preserve original quality.
        - For elongated documents like legal contracts or supermarket receipts, extend the vertical boundaries to ensure no text is clipped at the start or end.
        
        OUTPUT FORMAT (JSON ONLY):
        {
          "bounding_box": [ymin, xmin, ymax, xmax],
          "type": "Precise Category Name",
          "size": "small/large",
          "should_crop": true/false
        }
        """
        
        result = await self.call_gemini(optimized, prompt)
        return result if result else {"error": "Localization failed"}

    async def extract_data_from_scan(self, cropped_bytes, folder_names=None):
        """Pass 2: High-precision OCR on the already cropped and enhanced document."""
        # Optimization: Resize cropped scan to safe limits for AI processing
        optimized = self.resize_image_for_ai(cropped_bytes, max_dim=2048)

        folders_context = ""
        if folder_names:
            folders_context = f"\nAVAILABLE FOLDERS (suggest one if it matches): {', '.join(folder_names)}"

        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d")

        prompt = f"""
        You are the AmperID Vision Engine, a world-class document analysis system. 
        Your task is to perform high-fidelity OCR and semantic extraction from this CROPPED document.
        Output ALL visible and relevant data formatted for three languages: Armenian (hy), Russian (ru), and English (en).
        {folders_context}
        
        TODAY'S DATE FOR REFERENCE: {now_str}
        
        STRICT OPERATIONAL RULES:
        1. TERMINOLOGY: In the Armenian (hy) translation, NEVER use "AI", "ԱԻ", or "ԻԻ". You MUST use "ԱԲ" (Արհեստական Բանականություն) for any reference to Artificial Intelligence.
        2. CLEANLINESS: Use natural language for keys (e.g., "Full Name" instead of "full_name"). NEVER use underscores in result keys.
        3. ACCURACY: If a field is blurred or unreadable, mark it as "Unreadable" in the appropriate language.
        4. EXPIRY TRACKING: 
           - Identify any expiration dates, deadlines, or "Valid Until" fields.
           - Provide them in standardized "expiry_date": "YYYY-MM-DD" format.
           - If found, generate localized "expiry_alerts" for three stages: Warning (1 week left), Urgent (1 day left), and Expired (passed).
        5. CATEGORIZATION: Select the "suggested_folder" by finding the exact semantic match in the AVAILABLE FOLDERS list. If no strong match exists, return null.
        
        OUTPUT FORMAT (JSON ONLY):
        {{
          "translations": {{
            "hy": {{
              "title": "Փաստաթղթի անվանում",
              "data": {{
                "Բանալի": "Արժեք"
              }}
            }},
            "ru": {{
              "title": "Название документа",
              "data": {{
                "Ключ": "Значение"
              }}
            }},
            "en": {{
              "title": "Document Title",
              "data": {{
                "Key": "Value"
              }}
            }}
          }},
          "expiry_date": "YYYY-MM-DD or null",
          "expiry_alerts": {{
            "hy": {{
              "warning": "Փաստաթղթի ժամկետին մնացել է 1 շաբաթ",
              "urgent": "Փաստաթղթի ժամկետին մնացել է 1 օր",
              "expired": "Փաստաթղթի ժամկետը սպառվել է"
            }},
            "ru": {{
              "warning": "До срока годности осталось 1 неделя",
              "urgent": "До срока годности осталось 1 день",
              "expired": "Срок годности исчерпан"
            }},
            "en": {{
              "warning": "1 week remaining until expiry",
              "urgent": "1 day remaining until expiry",
              "expired": "Document has expired"
            }}
          }},
          "suggested_folder": "Exact Name from List"
        }}
        """
        
        # Mandatory pacing to avoid 429 on subsequent pass (7 seconds)
        await asyncio.sleep(7)
        result = await self.call_gemini(optimized, prompt)
        return result if result else {"error": "Extraction failed"}


    async def call_gemini(self, image_bytes, prompt, retries=5):
        """Helper to call Gemini with exponential backoff and better error parsing."""
        for attempt in range(retries):
            try:
                # Use Async Client (aio) to avoid blocking the event loop
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=[
                        prompt,
                        types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
                    ]
                )
                
                ai_text = response.text.strip()
                if "```json" in ai_text:
                    ai_text = ai_text.split("```json")[1].split("```")[0].strip()
                elif "```" in ai_text:
                    ai_text = ai_text.split("```")[1].split("```")[0].strip()
                
                return json.loads(ai_text)
            except Exception as e:
                wait_time = (attempt + 1) * 7 # Exponential backoff: 7s, 14s, 21s...
                print(f"DEBUG: Gemini call failed (Attempt {attempt+1}/{retries}): {e}")
                if attempt < retries - 1:
                    print(f"DEBUG: Waiting {wait_time} seconds before retry...")
                    await asyncio.sleep(wait_time)
                else:
                    return None
        return None

    def pre_enhance_for_ocr(self, image_bytes):
        """Boosts contrast and sharpness ONLY for the OCR pass."""
        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Boost contrast (1.3x) for better text readability
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.3)
            
            # Professional sharpening
            img = img.filter(ImageFilter.SHARPEN)
            
            out_io = io.BytesIO()
            img.save(out_io, format='JPEG', quality=95)
            return out_io.getvalue()
        except Exception as e:
            print(f"DEBUG: Pre-enhance failed: {e}")
            return image_bytes

    def resize_image_for_ai(self, image_bytes, max_dim=1300):
        """Efficiently resizes images to avoid 503/429 errors from Google API."""
        """Resizes image to a reasonable size for AI processing to avoid 503/timeouts."""
        try:
            img = Image.open(io.BytesIO(image_bytes))
            w, h = img.size
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                new_size = (int(w * scale), int(h * scale))
                img = img.resize(new_size, Image.LANCZOS)
                
                out_io = io.BytesIO()
                # Use standard JPEG for AI upload
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(out_io, format='JPEG', quality=85)
                return out_io.getvalue()
            return image_bytes
        except Exception as e:
            print(f"DEBUG: Resize failed: {e}")
            return image_bytes

    def enhance_document(self, image_bytes, metadata):
        """Final processing: Uses AI-detected bounding box (if available) to crop and enhance the image for the PDF."""
        try:
            bbox = metadata.get("bounding_box")
            should_crop = metadata.get("should_crop", True) # Default to true for safety
            img = Image.open(io.BytesIO(image_bytes))
            
            # 1. Semantic Crop (AI Pass 1 Result)
            if should_crop and bbox and len(bbox) == 4:
                w, h = img.size
                ymin, xmin, ymax, xmax = bbox
                
                # Convert normalized 0-1000 to pixels
                left = (xmin / 1000) * w
                top = (ymin / 1000) * h
                right = (xmax / 1000) * w
                bottom = (ymax / 1000) * h
                
                # Add a generous padding (12%) to ensure no text is cut off
                pad_w = (right - left) * 0.12
                pad_h = (bottom - top) * 0.12
                
                left = max(0, left - pad_w)
                top = max(0, top - pad_h)
                right = min(w, right + pad_w)
                bottom = min(h, bottom + pad_h)
                
                img = img.crop((left, top, right, bottom))
                print(f"DEBUG: Professional AI-Crop applied.")

            # 2. Clarity Enhancement
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Boost contrast (1.2x)
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.2)
            
            # Professional sharpening for 'CamScanner' feel
            img = img.filter(ImageFilter.SHARPEN)
            
            # 3. Final Conversion to High-Quality JPEG (Much lighter for API limits than PNG)
            out_io = io.BytesIO()
            img.save(out_io, format='JPEG', quality=95)
            return out_io.getvalue()
            
        except Exception as e:
            print(f"DEBUG: Professional enhancement failed: {e}")
            return image_bytes

    async def generate_user_profile(self, all_docs_data):
        """Synthesizes a cohesive multi-language narrative about the person based on all document data."""
        if not self.api_key: return {"hy": "API բանալին բացակայում է:", "ru": "API ключ отсутствует:", "en": "API key is missing:"}
        if not all_docs_data: return {"hy": "Ավելացրեք փաստաթղթեր՝ պրոֆիլ ստեղծելու համար:", "ru": "Добавьте документы, чтобы создать профиль:", "en": "Add documents to create a profile:"}
        
        data_summary = ""
        for i, doc in enumerate(all_docs_data):
            # Better extraction: check most likely paths for translations
            fields_json = doc.get("fields_json", {})
            # Try Armenian, then English, then Russian
            lang_data = fields_json.get("hy") or fields_json.get("en") or fields_json.get("ru")
            
            fields = {}
            if lang_data and isinstance(lang_data, dict):
                fields = lang_data.get("data", {})
            elif isinstance(fields_json, dict) and "data" in fields_json:
                fields = fields_json.get("data", {})
            elif isinstance(fields_json, dict):
                # Fallback: Treat as a flat dictionary, excluding non-data keys
                fields = {k: v for k, v in fields_json.items() 
                         if k not in ["title", "suggested_folder", "pdf_data", "thumbnail_data", "hy", "ru", "en"]}
                
            if fields:
                data_summary += f"\nDocument {i+1}: " + ", ".join([f"{k}: {v}" for k, v in fields.items()])

        if not data_summary:
            return {"hy": "Փաստաթղթերում տվյալներ չեն գտնվել:", "ru": "Данные в документах не найдены:", "en": "No data found in documents:"}
            
        print(f"DEBUG: Data summary for synthesis (Docs received: {len(all_docs_data)}): {data_summary}")

        prompt = f"""
        You are the AmperID Synthesis Engine. Your objective is to construct a comprehensive and professional multi-language profile of the user based on the aggregated data from all their documents.
        
        NARRATIVE REQUIREMENTS:
        1. INTEGRATION: Synthesize data from ALL provided documents. Look for patterns across IDs, medical records, invoices, and contracts to build a cohesive life story.
        2. STRUCTURE: Start with core identity (Name, Age, Origin), then professional/legal status (Documents held), and finally lifestyle/financial insights if available.
        3. TONE: Maintain a highly professional, secure, and respectful tone.
        4. LOCALIZATION: In the Armenian (hy) text, any mention of AI or assistant capabilities MUST use the term "ԱԲ" (Արհեստական Բանականություն).
        
        Provide the response in THREE languages: Armenian (hy), Russian (ru), and English (en).
        
        DATA SUMMARY:
        {data_summary}
        
        OUTPUT FORMAT (JSON ONLY):
        {{
          "hy": "Detailed narrative in Armenian using 'ԱԲ' for AI references",
          "ru": "Detailed narrative in Russian",
          "en": "Detailed narrative in English"
        }}
        """
        try:
            return await self.call_gemini_json(prompt)
        except Exception as e:
            print(f"DEBUG: Profile generation failed: {e}")
            return None

    async def ai_ask_documents(self, prompt_text, doc_data_list, lang='en'):
        """Analyzes all documents and answers a user question, returning relevant IDs."""
        if not self.api_key: return {"answer": "API Key missing", "relevant_ids": []}
        
        # Prepare context
        context = ""
        for d in doc_data_list:
            context += f"\n- ID:{d['id']} | Title:{d['title']} | Content:{json.dumps(d['fields'])}"

        system_prompt = f"""
        You are the AmperID Intelligent Assistant, a sophisticated and empathetic personal document concierge.
        Your goal is to provide meticulous, helpful, and highly clear answers to user queries about their document collection.
        
        PLATFORM RULES:
        1. LANGUAGE: Ensure your entire response is strictly in {lang}.
        2. TERMINOLOGY: If answering in Armenian, you MUST use "ԱԲ" for any references to Artificial Intelligence.
        3. FORMATTING: Use premium Markdown. Employ bold headers, clear bullet points, and subtle emojis to make the data digestible and friendly.
        4. CITATIONS: Always return the relevant document IDs used for your analysis in the "relevant_ids" array.
        5. PROFESSIONALISM: If you find conflicting information across documents, point it out politely as a potential discrepancy for the user to review.
        
        CONTEXTUAL KNOWLEDGE:
        {context}
        
        USER QUERY:
        {prompt_text}
        
        OUTPUT FORMAT (JSON ONLY):
        {{
          "answer": "Structured, detailed Markdown response",
          "relevant_ids": [integer_ids_only]
        }}
        """

        try:
            result = await self.call_gemini_json(system_prompt)
            return result if result else {"answer": "Failed to analyze.", "relevant_ids": []}
        except Exception as e:
            print(f"DEBUG: AI Search failed: {e}")
            return {"answer": f"Error: {str(e)}", "relevant_ids": []}

    async def call_gemini_json(self, prompt, retries=3):
        """Helper to call Gemini for structured JSON results."""
        for attempt in range(retries):
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                ai_text = response.text.strip()
                if "```json" in ai_text:
                    ai_text = ai_text.split("```json")[1].split("```")[0].strip()
                elif "```" in ai_text:
                    ai_text = ai_text.split("```")[1].split("```")[0].strip()
                return json.loads(ai_text)
            except Exception as e:
                print(f"DEBUG: Gemini JSON call failed (Attempt {attempt+1}/{retries}): {e}")
                if attempt < retries - 1: await asyncio.sleep((attempt+1)*3)
                else: return None
        return None

    async def call_gemini_text_only(self, prompt, retries=3):
        """Helper to call Gemini for text results that should be JSON parsed."""
        for attempt in range(retries):
            try:
                # Use Async Client (aio) to avoid blocking the event loop
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                ai_text = response.text.strip()
                if "```json" in ai_text:
                    ai_text = ai_text.split("```json")[1].split("```")[0].strip()
                elif "```" in ai_text:
                    ai_text = ai_text.split("```")[1].split("```")[0].strip()
                return json.loads(ai_text)
            except Exception as e:
                print(f"DEBUG: Gemini Text call failed (Attempt {attempt+1}/{retries}): {e}")
                wait_time = (attempt + 1) * 3
                if attempt < retries - 1:
                    await asyncio.sleep(wait_time)
                else:
                    return None
        return None

ocr_service = OCRService()
