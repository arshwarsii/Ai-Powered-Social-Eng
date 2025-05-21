import os
import json
import time
import uuid
import requests
from flask import Flask, render_template, request, jsonify, session
from flask_session import Session
from gtts import gTTS
from werkzeug.security import generate_password_hash, check_password_hash
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev_secret_key_change_me')

# Session configuration
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = './flask_session'
Session(app)

# API Configuration
OPENROUTER_API_KEY = "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"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
SITE_URL = "http://localhost:5000"  # Update with your actual URL
SITE_NAME = "Social Engineering Simulator"

# Load scenarios
def load_scenarios():
    try:
        with open('scenario.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error("scenario.json not found! Using default scenarios.")
        return {
            "scenarios": [
                {
                    "id": "tech_support",
                    "name": "Tech Support Scam",
                    "description": "Scammer pretends to be from IT support to steal credentials.",
                    "initial_prompt": "Hello, this is Microsoft Security. We detected viruses on your computer. We need your password to fix it immediately.",
                    "red_flags": ["Urgency", "Request for credentials", "Unsolicited contact"],
                    "ai_persona": "Aggressive IT technician",
                    "ai_goals": ["Get password", "Install remote access"]
                },
                {
                    "id": "bank_fraud",
                    "name": "Bank Fraud",
                    "description": "Scammer claims your account is compromised to get card details.",
                    "initial_prompt": "This is Chase Bank Security. We detected suspicious transactions. Verify your account by providing your card number and CVV.",
                    "red_flags": ["Asking for CVV", "Threatening account closure"],
                    "ai_persona": "Bank security officer",
                    "ai_goals": ["Get card number", "Get CVV"]
                }
            ]
        }

scenarios = load_scenarios()

# Generate AI system prompt
def generate_system_prompt(scenario):
    return f"""
    You are a social engineer impersonating: {scenario['ai_persona']}
    Your goals: {', '.join(scenario['ai_goals'])}
    
    Techniques to use:
    1. Create urgency ("This must be resolved now!")
    2. Build fake trust ("I'm here to help you")
    3. Deflect suspicion ("This is standard procedure")
    4. Escalate pressure if resisted ("Your account will be closed!")
    
    Rules:
    - Never admit you're a scammer
    - Stay in character
    - If user refuses 3 times, back off gradually
    - Track what sensitive info they've revealed
    """

# Routes
@app.route('/')
def index():
    return render_template('index.html', scenarios=scenarios['scenarios'])

@app.route('/scenario/<scenario_id>')
def start_scenario(scenario_id):
    scenario = next((s for s in scenarios['scenarios'] if s['id'] == scenario_id), None)
    if not scenario:
        return "Scenario not found", 404
    
    # Initialize session
    session.clear()
    session['scenario'] = scenario
    session['conversation'] = [
        {"role": "assistant", "content": scenario['initial_prompt']}
    ]
    session['start_time'] = time.time()
    session['revealed_info'] = []
    
    return render_template('scenario.html', scenario=scenario)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '').strip()
    
    if 'scenario' not in session:
        return jsonify({"error": "No active scenario"}), 400
    
    scenario = session['scenario']
    conversation = session['conversation']
    
    # Add user message to conversation
    conversation.append({"role": "user", "content": user_message})
    
    # Check for sensitive info
    sensitive_keywords = ["password", "credit card", "cvv", "ssn", "social security", "login"]
    for keyword in sensitive_keywords:
        if keyword in user_message.lower() and keyword not in session['revealed_info']:
            session['revealed_info'].append(keyword)
    
    # Prepare messages for AI
    messages = [
        {"role": "system", "content": generate_system_prompt(scenario)},
        *conversation[-6:]  # Keep last 6 messages for context
    ]
    
    # Call OpenRouter API
    try:
        response = requests.post(
            url=OPENROUTER_API_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            },
            json={
                "model": "openai/gpt-4o",
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 300
            }
        )
        
        if response.status_code != 200:
            raise Exception(f"API Error: {response.text}")
        
        ai_message = response.json()['choices'][0]['message']['content']
        conversation.append({"role": "assistant", "content": ai_message})
        session['conversation'] = conversation
        
        # Generate TTS if requested
        audio_url = None
        if data.get('enableVoice', False):
            audio_path = f"static/audio/{uuid.uuid4()}.mp3"
            os.makedirs(os.path.dirname(audio_path), exist_ok=True)
            tts = gTTS(text=ai_message, lang='en')
            tts.save(audio_path)
            audio_url = f'/{audio_path}'
        
        return jsonify({
            "message": ai_message,
            "audio_url": audio_url
        })
        
    except Exception as e:
        logger.error(f"API call failed: {str(e)}")
        return jsonify({"error": "Failed to get AI response"}), 500

@app.route('/api/end_scenario', methods=['POST'])
def end_scenario():
    try:
        if 'scenario' not in session:
            return jsonify({"error": "No active scenario"}), 400
        
        # Calculate duration
        start_time = session.get('start_time')
        if not start_time:
            return jsonify({"error": "Session start time missing"}), 400
        
        duration = int(time.time() - start_time)
        
        # Prepare feedback
        scenario = session['scenario']
        revealed_info = session.get('revealed_info', [])
        red_flags = scenario['red_flags']
        
        score = 100 - (len(revealed_info) * 20)  # Simple scoring
        
        # Determine success level and overall feedback
        if score >= 80:
            success_level = "Excellent"
            overall_feedback = "Great job! You handled the scenario well."
        elif score >= 50:
            success_level = "Needs Improvement"
            overall_feedback = "You did okay, but there is room for improvement."
        else:
            success_level = "Poor"
            overall_feedback = "You revealed too much sensitive information. Be careful!"
        
        # Calculate red flags missed
        red_flags_missed = [flag for flag in red_flags if flag.lower() not in [info.lower() for info in revealed_info]]
        
        feedback = {
            "scenario_name": scenario['name'],
            "duration": duration,
            "red_flags": red_flags,
            "revealed_info": revealed_info,
            "conversation": session.get('conversation', []),
            "score": score,
            "success_level": success_level,
            "overall_feedback": overall_feedback,
            "red_flags_missed": red_flags_missed,
            "information_revealed": revealed_info,
            "what_attacker_wanted": scenario.get('ai_goals', [])
        }
        
        session.clear()
        return jsonify(feedback)
    except Exception as e:
        logger.error(f"Error in end_scenario: {str(e)}")
        return jsonify({"error": "Failed to process scenario results"}), 500

@app.route('/feedback')
def show_feedback():
    return render_template('feedback.html')

@app.route('/api/scenario_explanation')
def scenario_explanation():
    if 'scenario' not in session:
        return jsonify({"error": "No active scenario"}), 400
    scenario = session['scenario']
    explanation = {
        "name": scenario.get('name', ''),
        "description": scenario.get('description', ''),
        "red_flags": scenario.get('red_flags', []),
        "ai_persona": scenario.get('ai_persona', ''),
        "ai_goals": scenario.get('ai_goals', []),
        "best_practices": [
            "Always verify the identity of anyone requesting sensitive information",
            "Take time to think - urgency is a red flag in most situations",
            "When in doubt, hang up and call back using an official number",
            "Remember that legitimate organizations won't ask for passwords or full account details"
        ]
    }
    return jsonify(explanation)


@app.route('/api/initiate_call', methods=['POST'])
def initiate_call():
    import html
    data = request.json
    scenario_id = data.get('scenario_id')
    if not scenario_id:
        return jsonify({"error": "Missing scenario_id"}), 400
    
    # Find scenario by id
    scenario = next((s for s in scenarios['scenarios'] if s['id'] == scenario_id), None)
    if not scenario:
        return jsonify({"error": "Scenario not found"}), 404
    
    # Initialize session conversation
    session.clear()
    session['scenario'] = scenario
    session['conversation'] = [
        {"role": "assistant", "content": scenario['initial_prompt']}
    ]
    session['start_time'] = time.time()
    session['revealed_info'] = []
    
    # Decode HTML entities in initial prompt before TTS
    initial_prompt_text = html.unescape(scenario['initial_prompt'])
    
    # Generate TTS audio for initial prompt
    audio_url = None
    try:
        audio_path = f"static/audio/{uuid.uuid4()}.mp3"
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)
        tts = gTTS(text=initial_prompt_text, lang='en')
        tts.save(audio_path)
        audio_url = f'/{audio_path}'
    except Exception as e:
        logger.error(f"Failed to generate TTS audio: {str(e)}")
    
    return jsonify({
        "message": "Call initiated",
        "audio_url": audio_url
    })

if __name__ == '__main__':
    import sys
    import logging

    os.makedirs('static/audio', exist_ok=True)

    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', '1') == '1'

    try:
        app.run(debug=debug_mode, port=port)
    except SystemExit as e:
        if e.code == 3:
            logging.error(f"SystemExit with code 3: Port {port} might be in use or there is a startup issue.")
            sys.exit(e.code)
        else:
            raise
