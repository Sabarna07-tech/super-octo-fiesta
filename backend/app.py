from flask import Flask
from flask_cors import CORS
from api.routes import api_bp
from config import Config
import os
from dotenv import load_dotenv
import logging
import redis

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    logging.basicConfig(level=logging.INFO)
    
    # Enable CORS for all /api/* routes from any origin (for local dev)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
        # --- Caching Implementation: Start ---
    # Initialize the Redis client.
    # This uses the REDIS_URL from your configuration, defaulting to a standard local Redis instance.
    # This same client can be used for caching and other Redis operations.
    try:
        redis_url = app.config.get('REDIS_URL', 'redis://redis:6379/0')
        logging.info("Redis url : "+redis_url)
        app.redis = redis.from_url(redis_url)
        # Ping the Redis server to check the connection on startup
        app.redis.ping()
        logging.info("Successfully connected to Redis.")
    except redis.exceptions.ConnectionError as e:
        logging.error(f"Could not connect to Redis: {e}")
        app.redis = None # Set to None if connection fails
    # --- Caching Implementation: End ---
    # FIX: Use the original UPPERCASE config key for Flask
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])

    app.register_blueprint(api_bp, url_prefix='/api')

    # Optional: Add a health check endpoint
    @app.route('/api/health')
    def health():
        return {"status": "ok"}, 200

    return app

if __name__ == '__main__':
    load_dotenv()
    app = create_app()
    if app.redis is None:
        logging.error("Flask application cannot start without a Redis connection.")
    else:
        app.run(debug=True)