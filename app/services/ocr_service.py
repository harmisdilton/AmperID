import io
import json
import asyncio
import os
from PIL import Image, ImageEnhance, ImageFilter
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class OCRService:
    def __init__(self):
        # Initialize Gemini settings with API key from environment variable
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key)
        self.model = "gemini-2.5-flash"

    async def locate_document(self, image_bytes):
        """Pass 1: Identifies document boundaries and type for precision cropping."""
        # Pre-enhance to help AI see edges
        enhanced = self.pre_enhance_for_ocr(image_bytes)
        optimized = self.resize_image_for_ai(enhanced)

        prompt = """
        Return ONE bounding box covering the MAIN document area: [ymin, xmin, ymax, xmax] (0–1000).
        Also identify the document type and size.
        
        OUTPUT FORMAT (JSON ONLY):
        {
          "bounding_box": [ymin, xmin, ymax, xmax],
          "type": "Passport/ID Card/Receipt/etc",
          "size": "small/large"
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

        prompt = f"""
        You are AmperID Vision Engine. Extract ALL visible data from this CROPPED document.
        Output everything in THREE languages: Armenian (hy), Russian (ru), and English (en).
        {folders_context}
        
        STRICT RULES:
        1. NEVER use underscores (_) in keys. Use natural spaces.
        2. Pick the suggested_folder name ENTIRELY from the AVAILABLE FOLDERS list if it matches.
        3. For 'translations', provide equivalent keys and values for each language.
        
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
          "suggested_folder": "Pick exact match from AVAILABLE FOLDERS list, otherwise null"
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
                response = self.client.models.generate_content(
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
            img = Image.open(io.BytesIO(image_bytes))
            
            # 1. Semantic Crop (AI Pass 1 Result)
            if bbox and len(bbox) == 4:
                w, h = img.size
                ymin, xmin, ymax, xmax = bbox
                
                # Convert normalized 0-1000 to pixels
                left = (xmin / 1000) * w
                top = (ymin / 1000) * h
                right = (xmax / 1000) * w
                bottom = (ymax / 1000) * h
                
                # Add a small padding (5%)
                pad_w = (right - left) * 0.05
                pad_h = (bottom - top) * 0.05
                
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
            # Use Armenian for context summary as a base
            fields = doc.get("fields_json", {}).get("hy", {}).get("data", {})
            if fields:
                data_summary += f"\nDocument {i+1}: " + ", ".join([f"{k}: {v}" for k, v in fields.items()])

        if not data_summary:
            return {"hy": "Փաստաթղթերում տվյալներ չեն գտնվել:", "ru": "Данные в документах не найдены:", "en": "No data found in documents:"}

        prompt = f"""
        Based on the following document data, compose a concise and professional biography of this person.
        Provide the response in THREE languages: Armenian (hy), Russian (ru), and English (en).
        Format the response as a JSON object only. No titles or headers in the text.
        
        Data: {data_summary}
        
        OUTPUT FORMAT (JSON ONLY):
        {{
          "hy": "Biography text in Armenian",
          "ru": "Biography text in Russian",
          "en": "Biography text in English"
        }}
        """

        try:
            result = await self.call_gemini_text_only(prompt)
            return result if result else {"hy": "Սխալ:", "ru": "Ошибка:", "en": "Error:"}
        except Exception as e:
            print(f"DEBUG: Profile generation failed: {e}")
            return {"hy": "Պրոֆիլի թարմացումը ձախողվեց:", "ru": "Не удалось обновить профиль:", "en": "Failed to update profile:"}

    async def call_gemini_text_only(self, prompt, retries=5):
        """Helper to call Gemini for text results that should be JSON parsed."""
        for attempt in range(retries):
            try:
                response = self.client.models.generate_content(
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
                wait_time = (attempt + 1) * 7
                if attempt < retries - 1:
                    await asyncio.sleep(wait_time)
                else:
                    return None
        return None

ocr_service = OCRService()
