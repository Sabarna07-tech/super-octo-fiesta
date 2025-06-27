import logging
import os
from celery import Celery
from kombu import Exchange, Queue

# Import your task-specific logic
from .frame_extractor import FrameExtractor
from .s3_utils import list_videos_in_folder
from .compare import run_comparison

# --- Basic Configuration ---
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get Redis configuration from environment variables for flexibility
REDIS_HOST = os.environ.get('REDIS_HOST', 'redis')
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', f'redis://{REDIS_HOST}:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', f'redis://{REDIS_HOST}:6379/0')


# --- Celery App Initialization ---
celery = Celery(
    'tasks',
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

# --- Celery Configuration for Task Routing ---
# Here we define our two queues:
# - 'gpu_queue': For heavy, GPU-intensive tasks like frame extraction.
# - 'cpu_queue': For general, less intensive tasks like damage comparison.
celery.conf.update(
    task_queues=(
        Queue('gpu_queue', Exchange('gpu'), routing_key='gpu.task'),
        Queue('cpu_queue', Exchange('cpu'), routing_key='cpu.task'),
    ),
    # Set the default queue to 'cpu_queue'. Any task without a specified
    # queue will be sent here.
    task_default_queue='cpu_queue',
    task_default_exchange='cpu',
    task_default_routing_key='cpu.task',
    
    # Standard Celery settings
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_connection_retry_on_startup=True,
)


# --- Celery Task Definitions ---

@celery.task(bind=True, name='tasks.process_single_s3_video_task')
def process_single_s3_video_task(self, bucket_name, s3_key):
    """
    Celery task to extract frames from a single video on S3.
    This task is intended for the 'gpu_queue'.
    """
    try:
        self.update_state(state='PROGRESS', meta={'status': f'Initializing for {os.path.basename(s3_key)}', 'progress': 0})
        
        # Construct output path based on the input key
        s3_key_parts = s3_key.strip('/').split('/')
        if len(s3_key_parts) < 7:
            raise ValueError(f"S3 key '{s3_key}' is not in the expected format.")

        base_folder = os.path.join(s3_key_parts[0], s3_key_parts[1])
        date_folder = s3_key_parts[2]
        client_name_folder = s3_key_parts[3]
        camera_angle_folder = s3_key_parts[5]
        video_type_folder = s3_key_parts[6]
        video_filename = s3_key_parts[-1]
        video_name_without_ext = os.path.splitext(video_filename)[0]

        output_prefix = os.path.join(
            base_folder,
            date_folder,
            client_name_folder,
            'Processed Frames',
            camera_angle_folder,
            video_type_folder,
            video_name_without_ext
        ).replace("\\", "/")

        extractor = FrameExtractor()
        
        # Pass 'self' (the task instance) to the processing function for progress updates
        result = extractor.extract_frames_from_video_s3(
            s3_key=s3_key,
            bucket_name=bucket_name,
            output_prefix=output_prefix,
            task=self
        )

        if not result.get('success'):
            raise RuntimeError(result.get('error', 'Frame extraction failed.'))
        
        final_result = {
            'status': 'Completed',
            'progress': 100,
            'count': result.get('count', 0),
            'result': result.get('frame_urls', [])
        }
        self.update_state(state='SUCCESS', meta=final_result)
        return final_result

    except Exception as e:
        logger.error(f"Error in frame extraction task for video '{s3_key}': {e}", exc_info=True)
        self.update_state(state='FAILURE', meta={'status': 'Failed', 'error': str(e)})
        # It's good practice to re-raise the exception if you want Celery to know it was a hard failure
        raise e


@celery.task(bind=True, name='tasks.run_comparison_task')
def run_comparison_task(self, bucket_name, relative_path):
    """
    Celery task to run the damage comparison logic.
    This task is intended for the 'cpu_queue'.
    """
    self.update_state(state='PROGRESS', meta={'status': 'Initializing comparison...', 'progress': 0})
    try:
        logger.info(f"Running comparison task for: {relative_path} in bucket {bucket_name}")
        
        # Simulate some work and update progress
        self.update_state(state='PROGRESS', meta={'status': 'Comparing images...', 'progress': 50})
        
        status, msg = run_comparison(bucket_name, relative_path)
        
        if not status:
             raise RuntimeError(msg)

        final_result = {'status': 'Completed', 'message': msg, 'progress': 100}
        self.update_state(state='SUCCESS', meta=final_result)
        return final_result

    except Exception as e:
        logger.error(f"Error during comparison task for '{relative_path}': {str(e)}", exc_info=True)
        # Update state with the failure details
        self.update_state(state='FAILURE', meta={'status': 'Failed', 'error': str(e)})
        raise e
