import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a-default-secret-key-for-development'
    
    # Upload and Model Paths
    UPLOAD_FOLDER = 'uploads'
    
    # S3 Configuration
    S3_BUCKET = os.getenv('S3_BUCKET_NAME', 'aispry-project')
    S3_REGION = os.getenv('AWS_REGION', 'us-east-1')
    S3_UPLOAD_FOLDER = os.getenv('S3_UPLOAD_FOLDER', '2024_Oct_CR_WagonDamageDetection/Wagon_H')

    # Celery and Redis Configuration
    REDIS_HOST = os.environ.get('REDIS_HOST', '127.0.0.1')
    CELERY_BROKER_URL = f"redis://{REDIS_HOST}:6379/0"
    CELERY_RESULT_BACKEND = f"redis://{REDIS_HOST}:6379/0"

    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'a-secure-jwt-secret-key'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    
    # NEW: Frame Extractor configuration from YAML, now centralized here
    FRAME_EXTRACTOR_CONFIG = {
        'CONFIDENCE_THRESHOLD': 0.6,
        'WAGON_CLASS_ID': 1,
        'CAPTURE_DELAY': 5,
        'MODEL_PATH': 'models/best_weights.pt', # Using existing model path
        'CENTER_TOLERANCE_PX': 80,
        # DeepSort parameters can be added here if needed
        'DEEPSORT_MAX_AGE': 150 
    }