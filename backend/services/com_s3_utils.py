import boto3
from services.s3_utils import get_s3_client
import tempfile
import shutil
import os
import io
import cv2
import json
import numpy as np


def download_files_from_s3_to_temp(bucket:str, s3_path: str, temp_dir:str):
    s3 = get_s3_client()
    
    response = s3.list_objects_v2(Bucket=bucket, Prefix=s3_path)
    local_paths = []
    
    try:
        if "Contents" not in response:
            print("No files found.")
            return []

        for obj in response["Contents"]:
            key = obj["Key"]
            if key.endswith("/"):  # Skip directories
                continue

            local_file_path = os.path.join(temp_dir, os.path.basename(key))
            s3.download_file(bucket, key, local_file_path)
            local_paths.append(os.path.basename(key))
    except FileNotFoundError as fe:
        print(f"can't create temp dir : {temp_dir}")
    except Exception as e:
        print("Something went wrong :\n",e)

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
    # print(f"Uploaded image to s3://{bucket_name}/{s3_key}")
    
    
def upload_json_to_s3(json_data, bucket_name, s3_key):
    """
    Uploads a Python dictionary to S3 as a .json file.
    """
    client=get_s3_client()
    json_bytes = io.BytesIO(json.dumps(json_data, indent=2).encode('utf-8'))

    client.upload_fileobj(json_bytes, bucket_name, s3_key, ExtraArgs={'ContentType': 'application/json'})
    # print(f"Uploaded JSON to s3://{bucket_name}/{s3_key}")
    
    