from celery import Celery,shared_task
from kombu import Queue
import time
import logging
import os 
import tempfile
import shutil

from .frame_extractor import FrameExtractor
from .s3_utils import *


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery Configuration
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6380/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6380/0')

celery = Celery(
    'tasks',
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

celery.conf.update(
    task_queues=(Queue('default'),),
    task_default_queue='default',
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


@celery.task(bind=True)
def frame_extraction_task(self, bucket_name:str, path:str):
    self.update_state(state='PENDING', meta={'status': 'Initializing...', 'progress': 0})
    temp_dir = tempfile.mkdtemp()
    try:
        s3 = get_s3_client()
        if not check_folder_exists_in_s3(bucket_name=bucket_name,folder_prefix=path):
            logger.info(f'No such folder like {path}')
            # Raise an exception for logical errors
            raise FileNotFoundError(f'No Data available')

        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=path)
        mp4_files = [
            obj['Key'] for obj in response.get('Contents', [])
            if obj['Key'].endswith('.mp4') and not obj['Key'].endswith('/')
        ]

        if not mp4_files:
            logger.info(f"No video in {path}")
            # Raise an exception for logical errors
            raise FileNotFoundError(f"No video in this path")

        video_s3_key = mp4_files[0]  # use the first .mp4 file
        logger.info(f"Found video file: {video_s3_key}")
        
        logger.info(f"Downloading video : {video_s3_key}")
        local_video_path = os.path.join(temp_dir, 'video.mp4')
        download_file_from_s3(bucket=bucket_name, s3_key=video_s3_key, local_path=local_video_path)
        logger.info(f"Downloaded..")
        
        logger.info(f"Extracting video : {video_s3_key}")
        extractor = FrameExtractor()
        s3_video_dir = os.path.dirname(video_s3_key)
        output_path = s3_video_dir.replace('/Raw-videos/','/Processed_Frames/')
        
        logger.info(f"save path : {output_path}")
        num_frames = extractor.extract_wagon_frames(video_path=local_video_path, s3_save_path=output_path, bucket_name=bucket_name, task=self)
        
        self.update_state(state='SUCCESS' , meta={'status': f'Analysis complete. Identified and saved {num_frames} unique wagons.', 'progress': 100})
        return {'status': 'Success', 's3_path': output_path, 'message': f"Identified and saved {num_frames} unique wagon frames."}
    except Exception as e:
        logger.error(f"Error during frame extraction: {str(e)}", exc_info=True)
        # Re-raise the exception. Celery will catch it, set the state to FAILURE,
        # and store the exception details correctly.
        raise e
    finally:
        # Ensure the temporary directory is always cleaned up
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)