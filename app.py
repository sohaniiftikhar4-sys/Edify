# app.py - Complete Flask Backend for Edify MCQ Generator

from flask import Flask, request, jsonify, render_template
import os
import PyPDF2
import docx
import json
from dotenv import load_dotenv
import re
import traceback
from datetime import datetime

# ✅ Import Google GenAI package
try:
    from google import genai
    print("✅ Google GenAI package loaded successfully")
except ImportError as e:
    print(f"❌ Failed to import google.genai: {e}")
    print("💡 Run: pip install google-genai")
    exit(1)

# Load environment variables
load_dotenv()

app = Flask(__name__)

# ============================================
# CONFIGURATION
# ============================================
MAX_MCQS = 20
MIN_MCQS = 3
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt', 'md', 'rtf'}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

# ============================================
# GEMINI API SETUP
# ============================================
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')

if not GOOGLE_API_KEY:
    print("❌ GOOGLE_API_KEY not found in .env file")
    print("📝 Please create .env file with:")
    print("   GOOGLE_API_KEY=your_api_key_here")
    exit(1)

print(f"✅ API Key found: {GOOGLE_API_KEY[:8]}...")

# Initialize client
try:
    client = genai.Client(api_key=GOOGLE_API_KEY)
    print("✅ Gemini client initialized successfully")
except Exception as e:
    print(f"❌ Failed to initialize Gemini client: {e}")
    exit(1)

# ============================================
# GEMINI ACTIVE MODEL
# ============================================

ACTIVE_MODEL = 'gemini-3.5-flash'

working_models = [
    'gemini-3.5-flash',
    'gemini-3.6-flash'
]

print("\n" + "=" * 50)
print("✅ Gemini model configured")
print(f"🤖 Active Model: {ACTIVE_MODEL}")
print(f"📋 Working Models: {', '.join(working_models)}")
print("=" * 50 + "\n")

# ============================================
# FILE HANDLING FUNCTIONS
# ============================================

def allowed_file(filename):
    """Check if file extension is allowed"""
    if not filename or '.' not in filename:
        return False
    return filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_extension(filename):
    """Get file extension"""
    if not filename or '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[1].lower()

def extract_text_from_pdf(file_stream):
    """Extract text from PDF with error handling"""
    try:
        pdf_reader = PyPDF2.PdfReader(file_stream)
        if not pdf_reader.pages:
            return None
        
        text = ""
        for page_num, page in enumerate(pdf_reader.pages, 1):
            try:
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text += page_text.strip() + "\n"
                else:
                    print(f"   ⚠️ Page {page_num}: No text extracted")
            except Exception as e:
                print(f"   ⚠️ Page {page_num} error: {str(e)[:50]}")
                continue
        
        return text.strip() if text.strip() else None
    except Exception as e:
        print(f"PDF extraction error: {str(e)}")
        return None

def extract_text_from_docx(file_stream):
    """Extract text from DOCX with error handling"""
    try:
        doc = docx.Document(file_stream)
        if not doc.paragraphs:
            return None
        
        text = "\n".join([
            paragraph.text.strip() 
            for paragraph in doc.paragraphs 
            if paragraph.text.strip()
        ])
        return text.strip() if text.strip() else None
    except Exception as e:
        print(f"DOCX extraction error: {str(e)}")
        return None

def extract_text_from_txt(file_stream):
    """Extract text from TXT with error handling"""
    try:
        file_stream.seek(0)
        # Try different encodings
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        for encoding in encodings:
            try:
                file_stream.seek(0)
                text = file_stream.read().decode(encoding, errors='ignore')
                if text.strip():
                    return text.strip()
            except:
                continue
        
        # Fallback: read as binary and decode with replacement
        file_stream.seek(0)
        text = file_stream.read().decode('utf-8', errors='replace')
        return text.strip() if text.strip() else None
    except Exception as e:
        print(f"TXT extraction error: {str(e)}")
        return None

def extract_text_from_rtf(file_stream):
    """Extract text from RTF (basic)"""
    try:
        file_stream.seek(0)
        content = file_stream.read().decode('utf-8', errors='ignore')
        # Remove RTF formatting tags
        import re
        text = re.sub(r'\\[a-z]+', ' ', content)
        text = re.sub(r'\{.*?\}', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip() if text.strip() else None
    except Exception as e:
        print(f"RTF extraction error: {str(e)}")
        return None

def extract_text(file_stream, filename):
    """Extract text from file based on extension"""
    ext = get_file_extension(filename)
    
    print(f"📄 Processing: {filename} (Extension: {ext})")
    
    if ext == 'pdf':
        return extract_text_from_pdf(file_stream)
    elif ext == 'docx':
        return extract_text_from_docx(file_stream)
    elif ext in ['txt', 'md']:
        return extract_text_from_txt(file_stream)
    elif ext == 'rtf':
        return extract_text_from_rtf(file_stream)
    else:
        print(f"❌ Unsupported extension: {ext}")
        return None

def get_file_size(file_stream):
    """Get file size in bytes"""
    try:
        file_stream.seek(0, os.SEEK_END)
        size = file_stream.tell()
        file_stream.seek(0)
        return size
    except:
        return 0

# ============================================
# MCQ GENERATION FUNCTIONS
# ============================================

def generate_mcqs(text, num_questions=5):
    """Generate MCQs using active Gemini model"""
    try:
        # Limit text to prevent token overflow
        text = text[:3000]
        
        prompt = f"""Generate {num_questions} multiple choice questions from this text.

Text: {text}

Return ONLY a valid JSON array. No other text. Each question must have:
- "question": string (the question)
- "options": array of exactly 4 strings (A, B, C, D options)
- "correct_answer": string (must be exactly one of the options)
- "explanation": string (brief explanation of why this is correct)

Example:
[
  {{
    "question": "What is the main topic?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "explanation": "This is correct because..."
  }}
]

Make sure the correct_answer exactly matches one of the options strings."""

        response = client.models.generate_content(
            model=ACTIVE_MODEL,
            contents=prompt
        )
        
        if not response or not response.text:
            print("❌ No response from model")
            return None
        
        json_text = response.text.strip()
        print(f"📝 Raw response length: {len(json_text)} chars")
        
        # Clean the response
        json_text = re.sub(r'```json\s*', '', json_text)
        json_text = re.sub(r'```\s*', '', json_text)
        json_text = re.sub(r'^json\s*', '', json_text)
        
        # Find JSON array
        match = re.search(r'\[\s*\{.*?\}\s*\]', json_text, re.DOTALL)
        if match:
            json_text = match.group(0)
        
        # Parse JSON
        try:
            mcqs = json.loads(json_text)
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Attempted to parse: {json_text[:200]}...")
            return None
        
        # Validate MCQs
        validated = []
        for mcq in mcqs:
            if not isinstance(mcq, dict):
                continue
            if not all(key in mcq for key in ['question', 'options', 'correct_answer']):
                continue
            if not isinstance(mcq['options'], list) or len(mcq['options']) != 4:
                continue
            if mcq['correct_answer'] not in mcq['options']:
                # Try to find matching option (case insensitive)
                for opt in mcq['options']:
                    if opt.lower() == mcq['correct_answer'].lower():
                        mcq['correct_answer'] = opt
                        break
                if mcq['correct_answer'] not in mcq['options']:
                    continue
            if 'explanation' not in mcq:
                mcq['explanation'] = "Explanation not provided."
            validated.append(mcq)
        
        return validated if validated else None
        
    except Exception as e:
        print(f"MCQ generation error: {str(e)}")
        traceback.print_exc()
        return None

def generate_mcqs_alternative(text, num_questions=3):
    """Alternative MCQ generation with simpler format"""
    try:
        text = text[:2000]
        
        prompt = f"""Create {num_questions} multiple choice questions from this text.

Text: {text}

Format each question exactly like this:

Q1: [Question]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Answer: [The correct option text]
Explanation: [Brief explanation]

Make sure the answer text matches one of the options exactly."""

        response = client.models.generate_content(
            model=ACTIVE_MODEL,
            contents=prompt
        )
        
        if not response or not response.text:
            return None
        
        text_response = response.text
        print(f"📝 Alternative response: {text_response[:200]}...")
        
        # Parse manually
        mcqs = []
        lines = text_response.strip().split('\n')
        
        current_mcq = {}
        current_options = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            if line.startswith('Q') and ':' in line:
                if current_mcq and current_options:
                    if 'question' in current_mcq and len(current_options) == 4:
                        current_mcq['options'] = current_options
                        current_mcq['correct_answer'] = current_mcq.get('correct_answer', '')
                        if current_mcq['correct_answer'] in current_mcq['options']:
                            mcqs.append({
                                'question': current_mcq['question'],
                                'options': current_mcq['options'],
                                'correct_answer': current_mcq['correct_answer'],
                                'explanation': current_mcq.get('explanation', '')
                            })
                    current_mcq = {}
                    current_options = []
                
                question_text = line.split(':', 1)[1].strip()
                current_mcq['question'] = question_text
            
            elif re.match(r'^[A-D]\)', line):
                option_text = line[2:].strip()
                current_options.append(option_text)
            
            elif line.startswith('Answer:'):
                answer = line.split(':', 1)[1].strip()
                current_mcq['correct_answer'] = answer
            
            elif line.startswith('Explanation:'):
                explanation = line.split(':', 1)[1].strip()
                current_mcq['explanation'] = explanation
        
        # Save last MCQ
        if current_mcq and current_options:
            if 'question' in current_mcq and len(current_options) == 4:
                current_mcq['options'] = current_options
                current_mcq['correct_answer'] = current_mcq.get('correct_answer', '')
                if current_mcq['correct_answer'] in current_mcq['options']:
                    mcqs.append({
                        'question': current_mcq['question'],
                        'options': current_mcq['options'],
                        'correct_answer': current_mcq['correct_answer'],
                        'explanation': current_mcq.get('explanation', '')
                    })
        
        return mcqs if mcqs else None
        
    except Exception as e:
        print(f"Alternative generation error: {str(e)}")
        return None

# ============================================
# FLASK ROUTES
# ============================================

@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for JS"""
    return jsonify({
        'status': 'healthy',
        'active_model': ACTIVE_MODEL,
        'api_configured': True,
        'working_models': working_models,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/models', methods=['GET'])
def list_available_models():
    """List all available models and active model"""
    try:
        all_models = client.models.list()
        model_list = []
        for model in all_models:
            model_list.append({
                'name': model.name.replace('models/', ''),
                'display_name': getattr(model, 'display_name', 'N/A')
            })
        return jsonify({
            'success': True,
            'active_model': ACTIVE_MODEL,
            'available_models': model_list,
            'total_models': len(model_list),
            'working_models': working_models
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file upload and generate MCQs"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded. Please select a file.'
            }), 400
        
        file = request.files['file']
        
        # Check if file was selected
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected. Please choose a file.'
            }), 400
        
        # Check file type
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': f'File type not allowed. Supported types: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        # Check file size
        file_size = get_file_size(file)
        if file_size > MAX_FILE_SIZE:
            return jsonify({
                'success': False,
                'error': f'File size exceeds {MAX_FILE_SIZE // (1024*1024)}MB limit. Current size: {file_size // (1024*1024)}MB'
            }), 400
        
        if file_size == 0:
            return jsonify({
                'success': False,
                'error': 'File is empty. Please upload a non-empty file.'
            }), 400
        
        # Extract text from file
        print(f"\n📄 Processing file: {file.filename}")
        print(f"   Size: {file_size} bytes ({file_size // 1024} KB)")
        
        text = extract_text(file, file.filename)
        
        # Check if text was extracted
        if not text:
            return jsonify({
                'success': False,
                'error': 'Could not extract readable text from the file. Please ensure the file contains text.'
            }), 400
        
        if len(text) < 30:
            return jsonify({
                'success': False,
                'error': f'Extracted text is too short ({len(text)} characters). Please upload a file with more content.'
            }), 400
        
        print(f"   Text length: {len(text)} characters")
        print(f"   Preview: {text[:150]}...")
        
        # Determine number of questions
        num_questions = request.form.get('num_questions', type=int)
        
        if not num_questions:
            # Auto-detect based on text length
            if len(text) < 300:
                num_questions = 3
            elif len(text) < 500:
                num_questions = 5
            elif len(text) < 1000:
                num_questions = 8
            else:
                num_questions = 10
        else:
            # Validate user input
            num_questions = max(MIN_MCQS, min(MAX_MCQS, num_questions))
            # Reduce if text is short
            if len(text) < 300 and num_questions > 5:
                num_questions = 5
        
        print(f"   Generating {num_questions} questions...")
        
        # Generate MCQs
        mcqs = generate_mcqs(text, num_questions)
        
        # If JSON method fails, try with fewer questions
        if not mcqs:
            print("   ⚠️ JSON method failed, retrying with fewer questions...")
            mcqs = generate_mcqs(text, min(num_questions, 3))
        
        # If still fails, try a simpler prompt
        if not mcqs:
            print("   ⚠️ Trying with alternative prompt...")
            mcqs = generate_mcqs_alternative(text, min(num_questions, 3))
        
        if not mcqs or len(mcqs) == 0:
            return jsonify({
                'success': False,
                'error': 'Failed to generate MCQs from the file. Please try with a different file or fewer questions.'
            }), 500
        
        print(f"✅ Successfully generated {len(mcqs)} MCQs")
        
        return jsonify({
            'success': True,
            'message': f'Successfully generated {len(mcqs)} MCQs',
            'mcqs': mcqs,
            'num_questions': len(mcqs),
            'total_questions_requested': num_questions,
            'model_used': ACTIVE_MODEL,
            'file_name': file.filename,
            'text_length': len(text)
        })
        
    except Exception as e:
        print(f"❌ Upload error: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/chat', methods=['POST'])
def chat():
    """Chat with AI assistant"""
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing message'
            }), 400
        
        message = data['message'].strip()
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message cannot be empty'
            }), 400
        
        prompt = f"""You are Edify, an AI assistant for generating MCQs from documents.
User: {message}
Respond helpfully and concisely."""

        response = client.models.generate_content(
            model=ACTIVE_MODEL,
            contents=prompt
        )
        
        return jsonify({
            'success': True,
            'response': response.text if response and response.text else "I'm sorry, I couldn't process your request."
        })
        
    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================
# ERROR HANDLERS
# ============================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# ============================================
# MAIN
# ============================================

if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 EDIFY MCQ GENERATOR")
    print("="*50)
    print(f"📌 Active Model: {ACTIVE_MODEL}")
    print(f"📍 Local URL: http://127.0.0.1:5000")
    print(f"📍 Network URL: http://0.0.0.0:5000")
    print(f"📁 Supported files: {', '.join(ALLOWED_EXTENSIONS)}")
    print(f"📊 Max questions: {MAX_MCQS}")
    print(f"💾 Max file size: {MAX_FILE_SIZE // (1024*1024)}MB")
    print(f"🔧 Working models: {len(working_models)} found")
    print("="*50 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)