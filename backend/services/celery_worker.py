from celery import Celery
from kombu import Queue
import time
import logging
import os

from .frame_extractor import FrameExtractor
from .s3_utils import list_videos_in_folder
from config import config  # Import the config object

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Celery Configuration
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')

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
def process_single_s3_video_task(self, bucket_name, s3_key):
    """
    Celery task to extract frames from a single video on S3.
    """
    try:
        self.update_state(state='PROGRESS', meta={'status': f'Initializing for {os.path.basename(s3_key)}', 'progress': 0})

        # Construct output path based on the input key
        s3_key_parts = s3_key.strip('/').split('/')
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

        extractor = FrameExtractor(config)  # Pass the config object here

        # Pass 'self' (the task instance) to the processing function
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
        logger.error(f"Error in Celery task for single video: {e}", exc_info=True)
        self.update_state(state='FAILURE', meta={'status': str(e)})
        return {'status': 'Failed', 'error': str(e)}


@celery.task(bind=True)
def process_s3_videos_task(self, bucket_name, s3_prefix):
    """
    Celery task to extract frames from all videos in a given S3 prefix.
    """
    try:
        self.update_state(state='PROGRESS', meta={'status': 'Initializing...', 'progress': 0, 'result': []})

        prefix_parts = s3_prefix.strip('/').split('/')

        if len(prefix_parts) < 7:
            raise ValueError(f"S3 prefix '{s3_prefix}' is not in the expected format.")

        base_folder = os.path.join(prefix_parts[0], prefix_parts[1])
        date_folder = prefix_parts[2]
        client_name_folder = prefix_parts[3]
        camera_angle_folder = prefix_parts[5]
        video_type_folder = prefix_parts[6]

        base_output_path = os.path.join(
            base_folder,
            date_folder,
            client_name_folder,
            'Processed Frames',
            camera_angle_folder,
            video_type_folder
        )

        extractor = FrameExtractor(config)  # Pass the config object here
        success, folder_list = list_videos_in_folder(bucket_name, s3_prefix)

        if not success:
            error_message = folder_list or "Failed to list videos from S3."
            self.update_state(state='FAILURE', meta={'status': error_message})
            return {'status': 'Failed', 'error': error_message}

        if not folder_list or not folder_list[0].get('videos'):
            error_message = "No videos found in the specified folder."
            self.update_state(state='FAILURE', meta={'status': error_message})
            return {'status': 'Failed', 'error': error_message}

        folder_info = folder_list[0]
        video_filenames = folder_info.get('videos', [])
        folder_prefix = folder_info.get('name', '')

        total_videos = len(video_filenames)
        processed_videos = 0
        all_extracted_frames = []

        for video_filename in video_filenames:
            video_key = os.path.join(folder_prefix, video_filename).replace("\\", "/")
            logger.info(f"Processing video: {video_key}")

            video_name_without_ext = os.path.splitext(video_filename)[0]
            output_prefix = os.path.join(base_output_path, video_name_without_ext)

            # Pass 'self' (the task instance) to the processing function
            result = extractor.extract_frames_from_video_s3(
                s3_key=video_key,
                bucket_name=bucket_name,
                output_prefix=output_prefix,
                frame_interval=10,
                task=self
            )

            if result.get('success'):
                all_extracted_frames.extend(result.get('frame_urls', []))

            processed_videos += 1
            # Update overall progress after each video
            progress = int((processed_videos / total_videos) * 100)
            self.update_state(
                state='PROGRESS',
                meta={
                    'status': f'Processing video {processed_videos} of {total_videos}',
                    'progress': progress,
                    'result': all_extracted_frames
                }
            )

        final_result = {
            'status': 'Completed',
            'progress': 100,
            'count': len(all_extracted_frames),
            'result': all_extracted_frames
        }
        self.update_state(state='SUCCESS', meta=final_result)
        return final_result

    except Exception as e:
        logger.error(f"Error in Celery task: {e}", exc_info=True)
        self.update_state(state='FAILURE', meta={'status': str(e)})
        return {'status': 'Failed', 'error': str(e)}