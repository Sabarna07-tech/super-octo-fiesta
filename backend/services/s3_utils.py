"""
S3 Utility functions for wagon damage detection application.
"""
import os
import boto3
import logging
from botocore.exceptions import ClientError
from werkzeug.utils import secure_filename
from collections import defaultdict
import json
import re

logger = logging.getLogger(__name__)

def get_s3_client():
    """Initialize and return an S3 client using environment variables."""
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        return s3_client
    except Exception as e:
        logger.error(f"Error initializing S3 client: {str(e)}")
        return None

def get_comparison_details_from_s3(bucket_name, prefix):
    """
    Scans a given S3 prefix for wagon comparison data.
    This version is adapted for a two-level structure: {view}/{filename}.
    """
    s3_client = get_s3_client()
    if not s3_client:
        return None

    logger.info(f"Scanning S3 prefix: s3://{bucket_name}/{prefix}")
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

    json_contents = {}
    image_keys = {}

    for page in pages:
        if 'Contents' not in page:
            continue
        for obj in page['Contents']:
            key = obj['Key']
            if key.endswith('/'):
                continue

            relative_path = key.replace(prefix, '').lstrip('/')
            path_parts = relative_path.split('/')
            
            # FIX: Now expects 2 parts: [view, filename]
            if len(path_parts) != 2:
                logger.warning(f"Skipping unexpected S3 object structure: {key}")
                continue

            view, filename = path_parts
            frame_id = os.path.splitext(filename)[0]

            if filename.endswith('.json'):
                try:
                    json_obj = s3_client.get_object(Bucket=bucket_name, Key=key)
                    content = json_obj['Body'].read().decode('utf-8')
                    json_contents[(view, frame_id)] = json.loads(content)
                except Exception as e:
                    logger.error(f"Failed to read or parse JSON file {key}: {e}")
            elif filename.endswith(('.png', '.jpg', '.jpeg')):
                image_keys[(view, frame_id)] = key
    
    left_view_details = []
    right_view_details = []

    for (view, frame_id), json_data in json_contents.items():
        image_key = image_keys.get((view, frame_id))
        presigned_url = generate_presigned_url(bucket_name, image_key, 3600) if image_key else None

        def format_damage_count(data_list):
            if not data_list:
                return "-"
            count = len(data_list)
            label = data_list[0].get('label', 'item')
            return f"{count} {label}{'s' if count > 1 else ''}"

        details = {
            'frame_id': frame_id,
            'old': format_damage_count(json_data.get('OLD', [])),
            'new': format_damage_count(json_data.get('NEW', [])),
            'resolved': format_damage_count(json_data.get('RESOLVED', [])),
            'image': presigned_url
        }
        
        if view.lower() == 'left':
            left_view_details.append(details)
        elif view.lower() == 'right':
            right_view_details.append(details)
            
    if not left_view_details and not right_view_details:
        logger.warning("Found no processable frame data in the specified path.")
        return []

    # Create a single "wagon" object to hold all the frames, which matches the frontend's expectation.
    response_data = [{
        'wagon_id': 'Detected Frames',
        'left_view_details': left_view_details,
        'right_view_details': right_view_details
    }]
    
    logger.info(f"Successfully processed {len(left_view_details)} left frames and {len(right_view_details)} right frames.")
    return response_data


def get_s3_usage_stats(bucket_name, prefix=''):
    """
    Calculates total videos, storage size, and detected frames from an S3 bucket.
    This is an efficient approach that gets all stats in a single pass.
    """
    s3_client = get_s3_client()
    if not s3_client:
        return {'total_videos': 0, 'total_size_bytes': 0, 'total_detections': 0}

    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

    total_videos = 0
    total_size_bytes = 0
    total_detections = 0
    video_extensions = ('.mp4', '.avi', '.mov')

    try:
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    key_lower = obj['Key'].lower()
                    # Count raw videos and their size
                    if '/raw-videos/' in key_lower and key_lower.endswith(video_extensions):
                        total_videos += 1
                        total_size_bytes += obj['Size']
                    # Count extracted frames (detections)
                    elif '/processed frames/' in key_lower and key_lower.endswith(('.jpg', '.jpeg', '.png')):
                        total_detections += 1
    except ClientError as e:
        logger.error(f"Error scanning S3 bucket for stats: {e}")
        return {'total_videos': 0, 'total_size_bytes': 0, 'total_detections': 0}

    return {
        'total_videos': total_videos,
        'total_size_bytes': total_size_bytes,
        'total_detections': total_detections
    }


def upload_bytes_to_s3(image_bytes, bucket_name, s3_key, content_type='image/jpeg'):
    """Upload a bytes object to an S3 bucket."""
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            return False, "S3 client initialization failed"
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=image_bytes,
            ContentType=content_type
        )
        return True, f"Successfully uploaded to {s3_key}"
    except ClientError as e:
        logger.error(f"S3 client error during bytes upload: {e}")
        return False, f"S3 error: {e.response['Error']['Message']}"
    except Exception as e:
        logger.error(f"General error during bytes upload: {e}")
        return False, f"Error: {str(e)}"

def generate_presigned_url(bucket_name, s3_key, expiration=3600):
    """Generate a presigned URL to share an S3 object."""
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            return None
        
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': s3_key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        return None


def upload_file_to_s3(file, bucket_name, folder_path):
    """Upload a file to S3 and return the S3 key."""
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            return False, "S3 client initialization failed", None
        
        original_filename = secure_filename(file.filename)
        s3_key = os.path.join(folder_path, original_filename).replace("\\", "/")
        
        logger.info(f"Uploading file to S3 key: {s3_key}")
        
        file.seek(0)
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=file,
            ContentType=file.content_type
        )
        
        logger.info(f"Successfully uploaded {original_filename} to S3.")
        return True, f"File {original_filename} uploaded successfully.", s3_key
        
    except ClientError as e:
        logger.error(f"S3 client error during upload: {e}")
        return False, f"S3 error: {e.response['Error']['Message']}", None
        
    except Exception as e:
        logger.error(f"General error during upload: {str(e)}")
        return False, f"Error: {str(e)}", None

def list_videos_in_folder(bucket_name, prefix):
    """Lists videos in a given S3 folder prefix."""
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            return False, "S3 client initialization failed"

        response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
        
        if 'Contents' not in response:
            return True, []

        folder_dict = defaultdict(lambda: {'id': '', 'name': '', 'videos': []})

        for obj in response['Contents']:
            key = obj['Key']
            if not key.endswith('/'):
                path_parts = key.split('/')
                if len(path_parts) > 1:
                    video_name = path_parts[-1]
                    folder_name = prefix
                    
                    folder_id = prefix.strip('/').replace('/', '-')
                    folder_dict[folder_id]['id'] = folder_id
                    folder_dict[folder_id]['name'] = folder_name
                    folder_dict[folder_id]['videos'].append(video_name)

        return True, list(folder_dict.values())

    except ClientError as e:
        logger.error(f"S3 client error listing videos: {e}")
        return False, f"S3 error: {e.response['Error']['Message']}"
        
    except Exception as e:
        logger.error(f"General error listing videos: {str(e)}")
        return False, f"Error: {str(e)}"

def download_file_from_s3(bucket_name, s3_key, local_path):
    """Download a file from S3 to a local path."""
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            logger.error("S3 client not available for download.")
            return False
        
        logger.info(f"Downloading {s3_key} from bucket {bucket_name} to {local_path}...")
        s3_client.download_file(bucket_name, s3_key, local_path)
        logger.info("Download successful.")
        return True
        
    except ClientError as e:
        logger.error(f"Failed to download {s3_key}. Error: {e}")
        return False
    except Exception as e:
        logger.error(f"An unexpected error occurred during download: {e}")
        return False

def check_file_exists(bucket_name, s3_key):
    """
    Check if a file exists in an S3 bucket using head_object.
    """
    try:
        s3_client = get_s3_client()
        if s3_client is None:
            logger.error("Cannot check file existence: S3 client failed to initialize.")
            return False
        
        s3_client.head_object(Bucket=bucket_name, Key=s3_key)
        logger.info(f"Verification successful: Found {s3_key} in bucket {bucket_name}.")
        return True
    
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            logger.warning(f"Verification failed: {s3_key} not found in bucket {bucket_name}.")
            return False
        else:
            logger.error(f"An unexpected S3 error occurred while checking file existence: {e}")
            return False
            
    except Exception as e:
        logger.error(f"A general error occurred: {e}")
        return False
    # In backend/services/s3_utils.py

import json
# ... other imports

def get_damage_counts_from_s3(bucket_name, base_prefix):
    """
    Calculates the number of new and resolved damages for each view (left, right, top)
    by scanning JSON files in the specified S3 path.
    """
    s3_client = get_s3_client()
    if not s3_client:
        logger.error("S3 client not available for damage count.")
        return None

    report = {'left_view_damages': 0, 'right_view_damages': 0, 'top_view_damages': 0}
    # Mapping from folder name to the key in the report dictionary
    view_folders = {'left': 'left_view_damages', 'right': 'right_view_damages', 'top': 'top_view_damages'}

    for folder, view_key in view_folders.items():
        prefix = f"{base_prefix}/{folder}/"
        
        try:
            paginator = s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

            for page in page_iterator:
                for obj in page.get('Contents', []):
                    key = obj['Key']
                    if key.endswith('.json'):
                        response = s3_client.get_object(Bucket=bucket_name, Key=key)
                        content = response['Body'].read().decode('utf-8')
                        try:
                            data = json.loads(content)
                            # Count items in NEW and RESOLVED arrays
                            count = len(data.get('NEW', [])) + len(data.get('RESOLVED', []))
                            report[view_key] += count
                        except json.JSONDecodeError:
                            logger.warning(f"Skipping invalid JSON file: {key}")
        except Exception as e:
            logger.error(f"Error accessing S3 folder {prefix}: {e}")

    return report