import boto3
import os
from dotenv import load_dotenv

load_dotenv()

def get_s3_client():
    return boto3.client(
        's3',
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION')
    )

def download_file_from_s3(bucket, s3_key, local_path):
    client = get_s3_client()
    client.download_file(bucket, s3_key, local_path)

def upload_bytes_to_s3(bytes_data, bucket, s3_key):
    client = get_s3_client()
    client.put_object(Bucket=bucket, Key=s3_key, Body=bytes_data)

def generate_presigned_url(bucket, key, expiration=3600):
    client = get_s3_client()
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expiration
    )

