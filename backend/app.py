from flask import Flask
from flask_cors import CORS
from api.routes import api_bp
from config import Config
import os
from dotenv import load_dotenv
import logging

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    logging.basicConfig(level=logging.INFO)
    
    # Enable CORS for all routes
    CORS(app)

    # FIX: Use the original UPPERCASE config key for Flask
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])

    app.register_blueprint(api_bp, url_prefix='/api')

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)