from fpdf import FPDF
from PIL import Image, ImageFile
import io

# Enable robust loading of slightly corrupted/incomplete images
ImageFile.LOAD_TRUNCATED_IMAGES = True

class PDFService:
    def create_pdf_from_images(self, image_metadata_list):
        """
        image_metadata_list: List of dicts with {bytes, size, type}
        """
        pdf = FPDF(orientation='P', unit='mm', format='A4')
        for item in image_metadata_list:
            try:
                img_bytes = item['bytes']
                doc_size = item['size']
                
                img = Image.open(io.BytesIO(img_bytes))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                w, h = img.size
                
                # Intelligent Orientation Logic
                # If it's a small object (card/receipt) and it's portrait, 
                # rotate it to landscape for better top-of-page layout.
                if doc_size == "small" and h > w:
                    # Rotate 270 degrees (90 clockwise) so bottom faces LEFT
                    img = img.rotate(270, expand=True)
                    w, h = img.size

                aspect = h / w
                pdf.add_page()
                
                # Temporary save for FPDF (High Quality JPEG for smaller PDF size)
                temp_img = io.BytesIO()
                img.save(temp_img, format="JPEG", quality=95)
                temp_img.seek(0)
                
                # A4 is 210 x 297 mm
                if doc_size == "small":
                    # Maximum width 190mm, maximum height 135mm (fills top part)
                    target_w = 190
                    target_h = target_w * aspect
                    if target_h > 135:
                        target_h = 135
                        target_w = target_h / aspect
                    
                    x_pos = (210 - target_w) / 2
                    y_pos = 10 # Pinned to top
                    pdf.image(temp_img, x=x_pos, y=y_pos, w=target_w, h=target_h)
                else:
                    # Large documents: Fully vertical layout
                    # Maximize width (190mm) and height (277mm)
                    target_w = 190
                    target_h = target_w * aspect
                    if target_h > 277:
                        target_h = 277
                        target_w = target_h / aspect
                    
                    x_pos = (210 - target_w) / 2
                    y_pos = 10 
                    pdf.image(temp_img, x=x_pos, y=y_pos, w=target_w, h=target_h)
                    
            except Exception as e:
                print(f"DEBUG: PDF layout error for item: {e}")
                continue
            
        return pdf.output()

pdf_service = PDFService()
