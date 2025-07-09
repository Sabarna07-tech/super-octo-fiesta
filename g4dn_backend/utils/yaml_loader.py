import yaml


def load_yaml(path="config.yaml"):
    config = {}
    try:
        with open(path, 'r') as f:
            config = yaml.safe_load(f)
    except (FileNotFoundError, KeyError) as e:
        print("except")
        logger.error(f"Error loading configuration from {config_path}: {e}")
        # Provide default values as a fallback
        config = {'frame_extractor':{
                'CONFIDENCE_THRESHOLD': 0.6,
                'WAGON_CLASS_ID': 1,
                'CAPTURE_DELAY': 5,
                'MODEL_PATH': 'models/best_weights.pt',
                'TOP_MODEL_PATH' : 'models/topbest.pt',
                'TOP_MODEL_WAGON_ID' : 0
            },
            'app':{
                'port':5005
            }
        }
    return config
    