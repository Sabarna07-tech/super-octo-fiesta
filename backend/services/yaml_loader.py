import yaml
import logging
from logging import getLogger, Logger
logger = logging.getLogger(__name__)
def load_yaml(path="config.yaml"):
    config = {}
    try:
        with open(path, 'r') as f:
            config = yaml.safe_load(f)['frame_extractor']
    except (FileNotFoundError, KeyError) as e:
        logger.error(f"Error loading configuration from {path}: {e}")
        # Provide default values as a fallback
        config = {
            'CONFIDENCE_THRESHOLD': 0.6,
            'WAGON_CLASS_ID': 1,
            'CAPTURE_DELAY': 5,
            'MODEL_PATH': 'models/best_weights.pt'
        }
    return config
    