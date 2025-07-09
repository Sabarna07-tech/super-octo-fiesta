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
            print(f"JSON file not found at s3://{bucket_name}/{s3_key}")
            return None
        else:
            raise
    except Exception as e:
        print(f"Error reading JSON from s3://{bucket_name}/{s3_key}: {e}")
        return None

def list_s3_objects(bucket_name, prefix, extension=None):
    """
    Lists object keys in an S3 folder, optionally filtering by extension.
    This version is more robust and correctly handles folder prefixes.
    """
    s3 = get_s3_client()
    paginator = s3.get_paginator('list_objects_v2')
    
    # Ensure prefix is treated as a folder
    if not prefix.endswith('/'):
        prefix += '/'
        
    pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)
    object_keys = []
    try:
        for page in pages:
            if "Contents" in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    # Skip the folder's own key or any sub-folders to ensure only files are processed
                    if key == prefix or key.endswith('/'):
                        continue
                    
                    if extension:
                        if key.endswith(extension):
                            object_keys.append(key)
                    else:
                        object_keys.append(key)
        return object_keys
    except Exception as e:
        print(f"Error listing objects in s3://{bucket_name}/{prefix}: {e}")
        return []


def get_s3_public_url(bucket_name, s3_key):
    """
    Generates a pre-signed public URL for an S3 object.
    """
    s3 = get_s3_client()
    try:
        # Ensure the object exists before generating a URL
        s3.head_object(Bucket=bucket_name, Key=s3_key)
        
        # Generate a presigned URL that is valid for 1 hour (3600 seconds)
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': s3_key},
            ExpiresIn=3600  
        )
        return url
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            print(f"Cannot generate URL. Object not found at s3://{bucket_name}/{s3_key}")
        else:
            print(f"ClientError generating URL for s3://{bucket_name}/{s3_key}: {e}")
        return None
    except Exception as e:
        print(f"Error generating URL for s3://{bucket_name}/{s3_key}: {e}")
        return None

def find_comparison_dates_with_results(bucket_name, base_prefix):
    """
    Returns a list of date strings (YYYY-MM-DD) for which at least one admin1 folder contains a Comparision_Results folder (with files in any subfolder) in S3.
    Accepts both YYYY-MM-DD and DD-MM-YYYY date folder formats.
    """
    s3 = get_s3_client()
    if not base_prefix.endswith('/'):
        base_prefix += '/'
    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name, Prefix=base_prefix, Delimiter='/')
    date_folders = set()
    date_pattern1 = re.compile(r'^(\d{4}-\d{2}-\d{2})$')  # YYYY-MM-DD
    date_pattern2 = re.compile(r'^(\d{2}-\d{2}-\d{4})$')  # DD-MM-YYYY

    print(f"Scanning base_prefix: {base_prefix}")
    for page in pages:
        print("Page CommonPrefixes:", page.get('CommonPrefixes', []))
        for cp in page.get('CommonPrefixes', []):
            date_folder = cp['Prefix'][len(base_prefix):].strip('/')
            print("  Found date folder:", date_folder)
            if date_pattern1.match(date_folder) or date_pattern2.match(date_folder):
                date_folders.add(date_folder)
    valid_dates = set()
    for date in date_folders:
        date_prefix = f"{base_prefix}{date}/"
        print(f"Checking date: {date} (prefix: {date_prefix})")
        admin_pages = s3.get_paginator('list_objects_v2').paginate(Bucket=bucket_name, Prefix=date_prefix, Delimiter='/')
        found = False
        for admin_page in admin_pages:
            print("  Admin CommonPrefixes:", admin_page.get('CommonPrefixes', []))
            for admin_cp in admin_page.get('CommonPrefixes', []):
                admin_prefix = admin_cp['Prefix']
                print("    Found admin folder:", admin_prefix)
                comp_results_prefix = f"{admin_prefix}Comparision_Results/"
                print("      Checking for files under:", comp_results_prefix)
                resp = s3.list_objects_v2(Bucket=bucket_name, Prefix=comp_results_prefix, MaxKeys=10)
                print("      S3 response Contents:", resp.get('Contents', []))
                if 'Contents' in resp:
                    for obj in resp['Contents']:
                        key = obj['Key']
                        print("        Found key:", key)
                        if key.endswith('/'):
                            continue
                        found = True
                        break
                if found:
                    if date_pattern2.match(date):
                        d, m, y = date.split('-')
                        norm_date = f"{y}-{m}-{d}"
                    else:
                        norm_date = date
                    print(f"      VALID DATE: {norm_date}")
                    valid_dates.add(norm_date)
                    break
            if found:
                break
    print("Final valid dates:", valid_dates)
    return sorted(valid_dates)
