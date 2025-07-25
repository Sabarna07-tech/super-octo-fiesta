import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from .s3_utils import get_s3_client
import tempfile
import shutil
import os
import io
import cv2
import json
import numpy as np
import re
import logging
from datetime import datetime


def download_files_from_s3_to_temp(bucket:str, s3_path: str, temp_dir:str):
    s3 = get_s3_client()
    
    response = s3.list_objects_v2(Bucket=bucket, Prefix=s3_path)
    local_paths = []
    
    try:
        if "Contents" not in response:
            logging.warning(f"No files found in S3 at prefix: {s3_path}")
            return []

        for obj in response["Contents"]:
            key = obj["Key"]
            if key.endswith("/"):  # Skip directories
                continue

            local_file_path = os.path.join(temp_dir, os.path.basename(key))
            s3.download_file(bucket, key, local_file_path)
            local_paths.append(os.path.basename(key))
    except FileNotFoundError as fe:
        logging.error(f"Can't create temp dir : {temp_dir}", exc_info=True)
    except Exception as e:
        logging.error(f"Something went wrong during S3 download: {e}", exc_info=True)

    return local_paths
    
    
def upload_image_to_s3(image_np, bucket_name, s3_key):
    """
    Uploads a BGR OpenCV image (NumPy array) to S3 as a .jpg.
    """
    client = get_s3_client()
    success, encoded_image = cv2.imencode('.jpg', image_np)
    if not success:
        raise ValueError("Image encoding failed.")
    image_bytes = io.BytesIO(encoded_image.tobytes())

    client.upload_fileobj(image_bytes, bucket_name, s3_key, ExtraArgs={'ContentType': 'image/jpeg'})
    
    
def upload_json_to_s3(json_data, bucket_name, s3_key):
    """
    Uploads a Python dictionary to S3 as a .json file.
    """
    client=get_s3_client()
    json_bytes = io.BytesIO(json.dumps(json_data, indent=2).encode('utf-8'))

    client.upload_fileobj(json_bytes, bucket_name, s3_key, ExtraArgs={'ContentType': 'application/json'})

def check_folder_exists_in_s3(bucket_name,folder_prefix):
    """
    Checks existance of only folders in a path
    """
    client = get_s3_client()
    if not folder_prefix.endswith('/'):
        folder_prefix += '/'
        
    response = client.list_objects_v2(
        Bucket=bucket_name,
        Prefix=folder_prefix,
        MaxKeys=1
    )
    
    return 'Contents' in response and len(response['Contents']) > 0

def upload_to_s3_from_folder(output_dir, bucket_name, s3_folder):
    client = get_s3_client()
    
    for file in os.listdir(output_dir):
        file_path = os.path.join(output_dir,file)
        client.upload_file(file_path,bucket_name,s3_folder+'/'+file)


# --- NEW FUNCTIONS TO SUPPORT comparison_utils.py ---

def read_s3_json(bucket_name, s3_key):
    """
    Reads a JSON file from S3 and returns it as a Python dictionary.
    """
    s3 = get_s3_client()
    try:
        obj = s3.get_object(Bucket=bucket_name, Key=s3_key)
        json_data = json.loads(obj['Body'].read().decode('utf-8'))
        return json_data
    except ClientError as ex:
        if ex.response['Error']['Code'] == 'NoSuchKey':
            logging.warning(f"JSON file not found at s3://{bucket_name}/{s3_key}")
            return None
        else:
            raise
    except Exception as e:
        logging.error(f"Error reading JSON from s3://{bucket_name}/{s3_key}: {e}", exc_info=True)
        return None

def list_s3_objects(bucket_name, prefix, extension=None):
    """
    Lists object keys in an S3 folder, optionally filtering by extension.
    This version is more robust and correctly handles folder prefixes.
    """
    s3 = get_s3_client()
    paginator = s3.get_paginator('list_objects_v2')
    
    if not prefix.endswith('/'):
        prefix += '/'
        
    pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)
    object_keys = []
    try:
        for page in pages:
            if "Contents" in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    if key == prefix or key.endswith('/'):
                        continue
                    
                    if extension:
                        if key.endswith(extension):
                            object_keys.append(key)
                    else:
                        object_keys.append(key)
        return object_keys
    except Exception as e:
        logging.error(f"Error listing objects in s3://{bucket_name}/{prefix}: {e}", exc_info=True)
        return []


def get_s3_public_url(bucket_name, s3_key):
    """
    Generates a pre-signed public URL for an S3 object.
    """
    s3 = get_s3_client()
    try:
        s3.head_object(Bucket=bucket_name, Key=s3_key)
        
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': s3_key},
            ExpiresIn=3600  
        )
        return url
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            logging.warning(f"Cannot generate URL. Object not found at s3://{bucket_name}/{s3_key}")
        else:
            logging.error(f"ClientError generating URL for s3://{bucket_name}/{s3_key}: {e}", exc_info=True)
        return None
    except Exception as e:
        logging.error(f"Error generating URL for s3://{bucket_name}/{s3_key}: {e}", exc_info=True)
        return None

def find_comparison_dates_with_results(bucket_name, base_prefix):
    """
    OPTIMIZED: Efficiently finds dates with comparison results by listing relevant
    files directly instead of iterating through folders.
    """
    s3 = get_s3_client()
    if not base_prefix.endswith('/'):
        base_prefix += '/'
    
    paginator = s3.get_paginator('list_objects_v2')
    # Search for any JSON file within any 'Comparision_Results' folder.
    # This is much faster than listing directories level by level.
    pages = paginator.paginate(Bucket=bucket_name, Prefix=base_prefix)
    
    valid_dates = set()
    # Regex to capture the date part (DD-MM-YYYY or YYYY-MM-DD) from the S3 key.
    # It looks for the base_prefix, then the date, then anything, then 'Comparision_Results'.
    date_pattern = re.compile(re.escape(base_prefix) + r"(\d{2,4}-\d{2}-\d{2,4}).*?/Comparision_Results/.*\.json")

    logging.info(f"Starting optimized scan for comparison dates under prefix: {base_prefix}")
    
    object_count = 0
    for page in pages:
        if "Contents" not in page:
            continue
            
        for obj in page['Contents']:
            object_count += 1
            key = obj['Key']
            match = date_pattern.search(key)
            if match:
                date_str = match.group(1)
                # Normalize the date to YYYY-MM-DD format for consistency
                try:
                    # Try parsing as DD-MM-YYYY first
                    dt_obj = datetime.strptime(date_str, '%d-%m-%Y')
                    normalized_date = dt_obj.strftime('%Y-%m-%d')
                    valid_dates.add(normalized_date)
                except ValueError:
                    try:
                        # Fallback to parsing as YYYY-MM-DD
                        dt_obj = datetime.strptime(date_str, '%Y-%m-%d')
                        normalized_date = dt_obj.strftime('%Y-%m-%d')
                        valid_dates.add(normalized_date)
                    except ValueError:
                        logging.warning(f"Found a file with an invalid date format in key: {key}")

    logging.info(f"Scanned {object_count} S3 objects and found {len(valid_dates)} unique dates with results.")
    return sorted(list(valid_dates))
