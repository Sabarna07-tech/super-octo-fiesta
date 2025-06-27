import boto3

def list_s3_files(bucket_name, prefix):
    """
    List all files and folders recursively under a given prefix in S3.
    """
    s3 = boto3.client('s3')
    paginator = s3.get_paginator('list_objects_v2')
    result = paginator.paginate(Bucket=bucket_name, Prefix=prefix, Delimiter='/')

    tree = {}

    for page in result:
        for prefix_obj in page.get('CommonPrefixes', []):
            folder = prefix_obj['Prefix'].rstrip('/')
            folder_name = folder.split('/')[-1]
            tree[folder_name] = list_s3_files(bucket_name, prefix=prefix_obj['Prefix'])

        for content in page.get('Contents', []):
            key = content['Key']
            if key.endswith('/'):
                continue
            file_name = key.split('/')[-1]
            tree[file_name] = key

    return tree

