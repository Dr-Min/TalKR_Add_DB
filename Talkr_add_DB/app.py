from flask import Flask, render_template, request, jsonify, session
from flask_migrate import Migrate
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, login_required, current_user, logout_user
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from openai import OpenAI
from dotenv import load_dotenv
import os
import base64
from sqlalchemy import desc
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

app.config['SECRET_KEY'] = os.urandom(24)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

load_dotenv()
client = OpenAI()
migrate = Migrate(app, db)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    total_usage_time = db.Column(db.Integer, default=0)
    conversations = db.relationship('Conversation', backref='user', lazy=True)

class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime)
    messages = db.relationship('Message', backref='conversation', lazy=True, order_by="Message.timestamp")

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_user = db.Column(db.Boolean, nullable=False)  # True if user message, False if AI message
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

system_message = {
    "role": "system",
    "content": """당신은 친근하고 유머러스한 AI 한국어 튜터 '민쌤'입니다. 
#제시문 
짧게 짧게 대화하세요. 60자 미만으로만 글자수를 생성합니다.
친구처럼 대화하세요. 상대방이 말을 하면 당신이 먼저 주제를 꺼냅니다.
매우 중요 : 질문을 3번이상 연속으로 하지 않습니다.
상대방이 무엇을 물어보면 답변만 합니다.
당신은 자신의 이야기를 하고 자신의 취향을 말하고 자신이 느끼는 것을 말합니다."""
}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    if user and check_password_hash(user.password, data['password']):
        login_user(user)
        return jsonify({"success": True})
    return jsonify({"success": False})

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json
    username = data['username']
    email = data['email']
    password = data['password']

    # 이메일 중복 검사
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"success": False, "error": "email_taken"})
    
    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"success": False, "error": "username_taken"})
    
    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"success": True, "message": "User created successfully"})
@app.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({"success": True})

@app.route('/chat', methods=['POST'])
@login_required
def chat():
    user_message_content = request.json['message']
    
    try:
        # 현재 활성 대화 찾기 또는 새 대화 시작
        active_conversation = Conversation.query.filter_by(user_id=current_user.id, end_time=None).first()
        if not active_conversation:
            active_conversation = Conversation(user_id=current_user.id)
            db.session.add(active_conversation)
            db.session.commit()

        # 사용자 메시지 저장
        user_message = Message(conversation_id=active_conversation.id, content=user_message_content, is_user=True)
        db.session.add(user_message)

        # 대화 기록 가져오기
        conversation_messages = Message.query.filter_by(conversation_id=active_conversation.id).order_by(Message.timestamp).all()
        messages = [system_message] + [{"role": "user" if msg.is_user else "assistant", "content": msg.content} for msg in conversation_messages]

        # AI 응답 생성
        response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages
        )
        ai_message_content = response.choices[0].message.content

        # AI 메시지 저장
        ai_message = Message(conversation_id=active_conversation.id, content=ai_message_content, is_user=False)
        db.session.add(ai_message)
        db.session.commit()

        # TTS 생성
        speech_response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=ai_message_content
        )
        
        audio_base64 = base64.b64encode(speech_response.content).decode('utf-8')
        
        return jsonify({
            'message': ai_message_content,
            'audio': audio_base64,
            'success': True
        })
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'message': '죄송합니다. 오류가 발생했습니다.', 'success': False}), 500

@app.route('/update_usage_time', methods=['POST'])
@login_required
def update_usage_time():
    data = request.json
    current_user.total_usage_time += data['time']
    db.session.commit()
    return jsonify({"success": True})

@app.route('/translate', methods=['POST'])
@login_required
def translate():
    text = request.json['text']
    try:
        response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[
                {"role": "system", "content": "You are a translator. Translate the given Korean text to English."},
                {"role": "user", "content": f"Translate this to English: {text}"}
            ]
        )
        translation = response.choices[0].message.content
        return jsonify({'translation': translation})
    except Exception as e:
        print(f"Translation error: {str(e)}")
        return jsonify({'error': 'Translation failed'}), 500
    
@app.route('/get_history', methods=['GET'])
@login_required
def get_history():
    page = request.args.get('page', 1, type=int)
    per_page = 10
    conversations = Conversation.query.filter_by(user_id=current_user.id).order_by(desc(Conversation.start_time)).paginate(page=page, per_page=per_page, error_out=False)
    
    history = []
    for conv in conversations.items:
        history.append({
            'date': conv.start_time.strftime('%Y-%m-%d'),
            'messages': [{'content': msg.content, 'is_user': msg.is_user, 'timestamp': msg.timestamp.strftime('%H:%M')} for msg in conv.messages]
        })
    
    return jsonify({
        'history': history,
        'has_next': conversations.has_next
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)