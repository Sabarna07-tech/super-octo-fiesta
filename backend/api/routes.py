import os
import jwt
import json
import logging
import signal
import datetime
from functools import wraps
from dotenv import load_dotenv
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from celery.result import AsyncResult

# Load environment variables
load_dotenv()

# Celery task imports
from services.celery_worker import (
    celery,
    process_s3_videos_task,
    process_single_s3_video_task,
    run_comparison_task,
    run_top_detection_task
)

# S3 utility imports
from services.s3_utils import (
    upload_file_to_s3,
    list_videos_in_folder,
    check_file_exists,
    get_s3_usage_stats,
    generate_presigned_url,
    get_s3_client
)
# FIX: Import the new, correct data fetching functions from comparison_utils
from services.comparison_utils import get_comparison_details, get_total_damage_counts

# Comparison service import
from services.compare import run_comparison

from services.com_s3_utils import find_comparison_dates_with_results

# --- NEW: Import the cache refresh function ---
from services.cache_manager import refresh_cache_now


# --- Blueprint and Mock Data ---
api_bp = Blueprint('api', __name__)

# Mock User Data & Roles
USERS = { "admin": "123", "user": "123", "admin1": "Uploader@123", "viewer": "123" }
ADMIN_ROLES = { "admin": "standard", "user": "standard", "admin1": "s3_uploader", "viewer": "viewer" }
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov'}

# --- Helper Functions ---

def format_bytes(byte_count):
    """Helper function to format bytes into KB, MB, GB, etc."""
    if byte_count is None:
        return "0 B"
    power = 1024
    n = 0
    power_labels = {0: '', 1: 'K', 2: 'M', 3: 'G', 4: 'T'}
    while byte_count >= power and n < len(power_labels) - 1:
        byte_count /= power
        n += 1
    return f"{byte_count:.2f} {power_labels[n]}B"

def is_valid_date(date_str):
    """Validates date string formatYYYY-MM-DD."""
    try:
        datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        return True
    except ValueError:
        return False

# --- Decorators ---

def token_required(f):
    """Decorator to enforce JWT authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers and request.headers['Authorization'].startswith('Bearer '):
            token = request.headers['Authorization'].split(" ")[1]

        if not token:
            return jsonify({'message': 'Authentication Token is missing!'}), 401

        try:
            data = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=["HS256"])
            kwargs['current_user'] = data
        except Exception as e:
            return jsonify({'message': 'Token is invalid or expired!', 'error': str(e)}), 401

        return f(*args, **kwargs)
    return decorated

# --- API Routes ---

@api_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Could not verify'}), 401

    username = data['username']
    password = data['password']

    if username in USERS and USERS[username] == password:
        token = jwt.encode({
            'username': username,
            'role': ADMIN_ROLES.get(username, 'user'),
            'exp': datetime.datetime.utcnow() + current_app.config['JWT_ACCESS_TOKEN_EXPIRES']
        }, current_app.config['JWT_SECRET_KEY'], algorithm="HS256")

        return jsonify({'success': True, 'token': token, 'role': ADMIN_ROLES.get(username, 'user')})

    return jsonify({'success': False, 'message': 'Invalid credentials'}), 403

@api_bp.route('/s3-upload', methods=['POST'])
@token_required
def s3_upload(current_user):
    if current_user['role'] != 's3_uploader':
        return jsonify({'success': False, 'error': 'Unauthorized'}), 403

    if 'video' not in request.files:
        return jsonify({'success': False, 'error': 'No video file found in request'}), 400

    file = request.files['video']
    upload_date = request.form.get('upload_date')
    camera_angle = request.form.get('camera_angle')
    video_type = request.form.get('video_type')
    user_name = request.form.get('user_name')

    if not all([file, upload_date, camera_angle, video_type, user_name]):
        return jsonify({'success': False, 'error': 'Missing form data for S3 upload'}), 400
    if not is_valid_date(upload_date):
        return jsonify({'success': False, 'error': 'Invalid upload date format.'}), 400

    date_obj = datetime.datetime.strptime(upload_date, "%Y-%m-%d")
    upload_date_str = date_obj.strftime("%d-%m-%Y")

    base_folder = current_app.config['S3_UPLOAD_FOLDER']
    folder_path = os.path.join(
        base_folder,
        upload_date_str,
        user_name,
        'Raw-videos',
        camera_angle,
        video_type
    ).replace("\\", "/")

    success, message, s3_key = upload_file_to_s3(
        file,
        bucket_name=current_app.config['S3_BUCKET'],
        folder_path=folder_path
    )
    return jsonify({'success': success, 'message': message, 's3_key': s3_key})

@api_bp.route('/s3-upload-status', methods=['POST'])
@token_required
def s3_upload_status(current_user):
    data = request.get_json()
    s3_key = data.get('s3_key')

    if not s3_key:
        return jsonify({'success': False, 'error': 'S3 key is missing'}), 400

    exists = check_file_exists(
        bucket_name=current_app.config['S3_BUCKET'],
        s3_key=s3_key
    )
    return jsonify({'success': True, 'exists': exists})

@api_bp.route('/get-video-url', methods=['POST'])
@token_required
def get_video_url(current_user):
    data = request.get_json()
    s3_key = data.get('s3_key')

    if not s3_key:
        return jsonify({'success': False, 'error': 'S3 key is missing'}), 400

    presigned_url = generate_presigned_url(
        bucket_name=current_app.config['S3_BUCKET'],
        s3_key=s3_key,
        expiration=3600 # URL is valid for 1 hour
    )

    if not presigned_url:
        return jsonify({'success': False, 'error': 'Could not generate video URL'}), 500

    return jsonify({'success': True, 'url': presigned_url})


@api_bp.route('/retrieve-videos', methods=['POST'])
@token_required
def retrieve_s3_videos(current_user):
    data = request.get_json()
    retrieve_date = data.get('retrieve_date')
    client_id = data.get('client_id')
    camera_angle = data.get('camera_angle')
    video_type = data.get('video_type')

    if not all([retrieve_date, client_id, camera_angle, video_type]):
        return jsonify({'success': False, 'error': 'Missing criteria for video retrieval'}), 400

    try:
        date_obj = datetime.datetime.strptime(retrieve_date, "%Y-%m-%d")
        formatted_date = date_obj.strftime("%d-%m-%Y")
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid date format provided.'}), 400

    base_folder = current_app.config['S3_UPLOAD_FOLDER']
    s3_prefix = os.path.join(
        base_folder,
        formatted_date,
        client_id,
        'Raw-videos',
        camera_angle,
        video_type
    ).replace("\\", "/") + "/"

    success, folders = list_videos_in_folder(
        bucket_name=current_app.config['S3_BUCKET'],
        prefix=s3_prefix
    )

    if not success:
        return jsonify({'success': False, 'error': folders})

    return jsonify({'success': True, 'folders': folders})

@api_bp.route('/process-s3-videos', methods=['POST'])
@token_required
def process_s3_videos(current_user):
    data = request.get_json()
    video_key = data.get('video_key')

    if not video_key:
        return jsonify({'success': False, 'error': 'S3 video key is missing.'}), 400

    task = process_single_s3_video_task.delay(
        bucket_name=current_app.config['S3_BUCKET'],
        s3_key=video_key
    )
    return jsonify({'success': True, 'task_id': task.id}), 202

@api_bp.route('/task-status/<task_id>', methods=['GET'])
@token_required
def task_status(current_user, task_id):
    # Use the main celery app instance to get the task result
    task = AsyncResult(task_id, app=celery)
    
    response = {'state': task.state}
    
    if task.state == 'PENDING':
        response.update({
            'status': 'Task is pending.',
            'progress': 0
        })
    elif task.state == 'PROGRESS':
        # task.info should contain the 'meta' dictionary from update_state
        response.update(task.info or {
            'status': 'Processing...',
            'progress': 0
        })
    elif task.state == 'SUCCESS':
        # For success, task.result holds the return value of the task
        response.update({
            'status': 'Task completed successfully!',
            'progress': 100,
            'result': task.result
        })
    elif task.state == 'FAILURE':
        # For failure, task.info contains the exception.
        # We just need to convert it to a string for the frontend.
        response.update({
            'status': str(task.info), # This will be the exception message
            'progress': 100,
            'error': True
        })
    else:
        # Handle other states like REVOKED
        response.update({'status': task.state})
        
    return jsonify(response)


@api_bp.route('/cancel-task/<task_id>', methods=['POST'])
@token_required
def cancel_task(current_user, task_id):
    """Revokes a Celery task by ID, with termination if supported."""
    try:
        result = AsyncResult(task_id, app=celery)
        state = result.state

        if state in ['PENDING', 'RECEIVED', 'STARTED']:
            try:
                result.revoke(terminate=True, signal=signal.SIGTERM)
                logging.info(f"Task revoked with SIGTERM")
                return jsonify({'message': f'Task has been revoked'}), 200
            except NotImplementedError as e:
                logging.warning(f"Task pool does not support terminate: {str(e)}")
                result.revoke(terminate=False)
                return jsonify({
                    'message': f'Task {task_id} marked for revocation, but force-terminate is not supported by current worker pool.'
                }), 200
        elif state in ['SUCCESS', 'FAILURE', 'REVOKED']:
            return jsonify({'message': f'Task is already {state.lower()}.'}), 200
        else:
            return jsonify({'error': f'Task cannot be cancelled from state: {state}'}), 400

    except Exception as e:
        logging.error(f"Failed to revoke task {task_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to cancel task: {str(e)}'}), 500


@api_bp.route('/system-status', methods=['GET'])
@token_required
def get_system_status(current_user):
    try:
        stats = get_s3_usage_stats(
            bucket_name=current_app.config['S3_BUCKET'],
            prefix=current_app.config['S3_UPLOAD_FOLDER']
        )

        return jsonify({
            "total_videos": stats.get('total_videos', 0),
            "storage_usage": format_bytes(stats.get('total_size_bytes', 0)),
            "total_detections": stats.get('total_detections', 0),
            "processing_speed": "Optimal"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/chart-data', methods=['GET'])
@token_required
def get_chart_data(current_user):
    return jsonify({ "damage_by_date": {"labels": ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'], "data": [2, 3, 1, 5, 4]}, "damage_types": {"labels": ['Scratch', 'Dent', 'Crack', 'Rust'], "data": [5, 3, 2, 2]} })

@api_bp.route('/comparison-details/<path:s3_path>', methods=['GET'])
@token_required
def comparison_details(current_user, s3_path):
    if not s3_path:
        return jsonify({'success': False, 'error': 'S3 path parameter is missing.'}), 400

    cache_key = f"comparison_details:{s3_path}"
    CACHE_TTL = 3600  # Cache for 1 hour

    try:
        # Caching logic (optional, can be removed if not using Redis)
        if hasattr(current_app, 'redis') and current_app.redis:
            cached_data = current_app.redis.get(cache_key)
            if cached_data:
                return jsonify(json.loads(cached_data))
        current_app.logger.info(f"hasattr(current_app, 'redis') : {hasattr(current_app, 'redis')} | current_app.redis{current_app.redis}")

        # FIX: Call the correct function from comparison_utils
        details_data = get_comparison_details(
            s3_base_path=s3_path,
            bucket_name=current_app.config['S3_BUCKET']
        )
        
        if not details_data.get("success"):
            return jsonify({'success': False, 'error': details_data.get("error", "Failed to retrieve details.")}), 500

        # Set cache
        if hasattr(current_app, 'redis') and current_app.redis:
            current_app.redis.set(cache_key, json.dumps(details_data), ex=CACHE_TTL)

        return jsonify(details_data)

    except Exception as e:
        current_app.logger.error(f"Error processing comparison details for path '{s3_path}': {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

@api_bp.route('/damage-counts/<path:s3_path>', methods=['GET'])
@token_required
def get_damage_counts(current_user, s3_path):
    if not s3_path:
        return jsonify({'success': False, 'error': 'S3 path is required.'}), 400

    cache_key = f"damage_counts:{s3_path}"
    CACHE_TTL = 3600 # Cache for 1 hour

    try:
        # Caching logic
        if hasattr(current_app, 'redis') and current_app.redis:
            cached_data = current_app.redis.get(cache_key)
            if cached_data:
                return jsonify(json.loads(cached_data))
                
        current_app.logger.info(f"hasattr(current_app, 'redis') : {hasattr(current_app, 'redis')} | current_app.redis{current_app.redis}")


        # FIX: Call the correct function from comparison_utils
        counts_data = get_total_damage_counts(
            s3_base_path=s3_path,
            bucket_name=current_app.config['S3_BUCKET']
        )
        
        if not counts_data.get("success"):
            return jsonify({'success': False, 'error': 'Failed to retrieve damage counts.'}), 500
        
        # Set cache
        if hasattr(current_app, 'redis') and current_app.redis:
            current_app.redis.set(cache_key, json.dumps(counts_data), ex=CACHE_TTL)

        return jsonify(counts_data)

    except Exception as e:
        current_app.logger.error(f"Error getting damage counts for {s3_path}: {e}")
        return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

@api_bp.route('/run-comparison', methods=['POST'])
@token_required
def run_comparison_route(current_user):
    data = request.get_json()
    logging.info("Received POST /run-comparison")

    date = data.get('date')
    name = data.get('name')
    view = data.get('view')

    if not all([date, name, view]):
        return jsonify({'error': 'Missing one or more required parameters: date, name, view'}), 400
    if view not in ['left', 'right']:
        return jsonify({'error': "Invalid view specified. Use 'left' or 'right'."}), 400

    try:
        date_obj = datetime.datetime.strptime(date, '%Y-%m-%d')
        date = date_obj.strftime('%d-%m-%Y')
    except ValueError:
        logging.info(f"Error in date formatting : {date}")
        return jsonify({'error': 'Invalid date format'}), 400

    relative_path = os.path.join(os.getenv("S3_BASE_DIR"), date, name, "Processed_Frames", view).replace("\\", "/")
    logging.info(f"Constructed S3 Path: {relative_path}")
    bucket_name = os.getenv("S3_BUCKET_NAME")
    logging.info(f"Bucket Name: {bucket_name}")

    if hasattr(current_app, 'redis') and current_app.redis:
        details_key = f"comparison_details:{relative_path}"
        counts_key = f"damage_counts:{relative_path}"
        current_app.redis.delete(details_key, counts_key)
        logging.info(f"Invalidated cache for keys: {details_key}, {counts_key}")

    try:
        logging.info("Starting comparison task...")
        task = run_comparison_task.apply_async(args=[bucket_name, relative_path])
        return jsonify({'task_id': task.id, 'message': 'Comparison task started'}), 202
    except Exception as e:
        logging.info(f"ERROR while starting task: \n{str(e)}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/run-top-comparison', methods=['POST'])
@token_required
def run_top_detection_route(current_user):
    data = request.get_json()
    logging.info("Received POST /run-top-comparison")

    date = data.get('date')
    name = data.get('name')
    direction = data.get('direction') # 'entry' or 'exit'
    view = 'top'

    if not all([date, name, direction]):
        return jsonify({'error': 'Missing one or more required parameters: date, name, direction'}), 400
    if direction not in ['entry', 'exit']:
        return jsonify({'error': "Invalid direction specified. Use 'entry' or 'exit'."}), 400

    try:
        date_obj = datetime.datetime.strptime(date, '%Y-%m-%d')
        date = date_obj.strftime('%d-%m-%Y')
    except ValueError:
        logging.info(f"Error in date formatting : {date}")
        return jsonify({'error': 'Invalid date format'}), 400

    # Construct the S3 path including the direction
    relative_path = os.path.join(os.getenv("S3_BASE_DIR"), date, name, "Processed_Frames", view, direction).replace("\\", "/")
    logging.info(f"Constructed S3 Path for Top Comparison: {relative_path}")
    bucket_name = os.getenv("S3_BUCKET_NAME")
    logging.info(f"Bucket Name: {bucket_name}")

    # Invalidate cache for the specific direction path
    if hasattr(current_app, 'redis') and current_app.redis:
        details_key = f"comparison_details:{relative_path}"
        counts_key = f"damage_counts:{relative_path}"
        current_app.redis.delete(details_key, counts_key)
        logging.info(f"Invalidated cache for keys: {details_key}, {counts_key}")

    try:
        logging.info("Starting top detection task...")
        # Assuming run_top_detection_task is updated to handle the new path
        task = run_top_detection_task.apply_async(args=[bucket_name, relative_path])
        return jsonify({'task_id': task.id, 'message': 'Top detection task has started'}), 202
    except Exception as e:
        logging.error(f"ERROR while starting top detection task: \n{str(e)}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/comparison-dates', methods=['GET'])
@token_required
def get_comparison_dates(current_user):
    try:
        bucket_name = current_app.config['S3_BUCKET']
        base_prefix = current_app.config['S3_UPLOAD_FOLDER']
        dates = find_comparison_dates_with_results(bucket_name, base_prefix)
        return jsonify({'success': True, 'dates': dates})
    except Exception as e:
        current_app.logger.error(f"Error fetching comparison dates: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/comparisons', methods=['GET'])
@token_required
def get_comparisons(current_user):
    """
    Returns a list of comparison entries from S3, each with left, right, and top data (if available).
    For each view, returns an array of wagons (one per JSON file).
    """
    bucket_name = current_app.config['S3_BUCKET']
    base_prefix = current_app.config.get('S3_COMPARISON_PREFIX', '2024_Oct_CR_WagonDamageDetection/Wagon_H/')
    s3_client = get_s3_client()
    if not s3_client:
        return jsonify({'success': False, 'error': 'S3 client initialization failed'}), 500

    cache_key = 'comparison_results'
    CACHE_TTL = 3600  # 1 hour
    try:
        if hasattr(current_app, 'redis') and current_app.redis:
            cached_data = current_app.redis.get(cache_key)
            if cached_data:
                return jsonify(json.loads(cached_data))
    except Exception as e:
        current_app.logger.error(f"Error accessing Redis cache: {e}")

    # List all date folders
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name, Prefix=base_prefix, Delimiter='/')
    date_folders = []
    for page in pages:
        for prefix in page.get('CommonPrefixes', []):
            date_folders.append(prefix['Prefix'])

    results = []
    for date_prefix in date_folders:
        # Check for admin1/Comparision_Results/
        admin_prefix = f"{date_prefix}admin1/Comparision_Results/"
        # Check if this folder exists by listing with Delimiter
        admin_pages = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=admin_prefix, Delimiter='/')
        if 'CommonPrefixes' not in admin_pages and 'Contents' not in admin_pages:
            continue
        entry = {
            'date': date_prefix.rstrip('/').split('/')[-1],
            'user': 'admin1',
            'results': {}
        }
        for view in ['left', 'right', 'top']:
            view_prefix = f"{admin_prefix}{view}/"
            if view in ['left', 'right']:
                # List JSON files in the view folder
                view_objs = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=view_prefix)
                if 'Contents' not in view_objs:
                    continue
                json_files = [obj['Key'] for obj in view_objs['Contents'] if obj['Key'].endswith('.json')]
                view_data = []
                for json_file in json_files:
                    obj = s3_client.get_object(Bucket=bucket_name, Key=json_file)
                    content = obj['Body'].read().decode('utf-8')
                    try:
                        data = json.loads(content)
                    except Exception as e:
                        data = {'error': f'Invalid JSON: {str(e)}'}
                    image_key = json_file[:-5] + '.jpg'
                    data['image_url'] = generate_presigned_url(bucket_name, image_key, 3600)
                    for img_key in ['entry_image', 'exit_image']:
                        if img_key in data:
                            img_path = f"{view_prefix}{data[img_key]}"
                            data[img_key + '_url'] = generate_presigned_url(bucket_name, img_path, 3600)
                    data['wagon_id'] = json_file.split('/')[-1].replace('.json', '')
                    view_data.append(data)
                if view_data:
                    entry['results'][view] = view_data
            elif view == 'top':
                top_data = []
                for direction in ['entry', 'exit']:
                    dir_prefix = f"{view_prefix}{direction}/"
                    dir_objs = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=dir_prefix)
                    if 'Contents' not in dir_objs:
                        continue
                    json_files = [obj['Key'] for obj in dir_objs['Contents'] if obj['Key'].endswith('.json')]
                    for json_file in json_files:
                        obj = s3_client.get_object(Bucket=bucket_name, Key=json_file)
                        content = obj['Body'].read().decode('utf-8')
                        try:
                            data = json.loads(content)
                        except Exception as e:
                            data = {'error': f'Invalid JSON: {str(e)}'}
                        # Image is in the same folder, same base name
                        image_key = json_file[:-5] + '.jpg'
                        data['image_url'] = generate_presigned_url(bucket_name, image_key, 3600)
                        data['wagon_id'] = json_file.split('/')[-1].replace('.json', '')
                        data['direction'] = direction
                        top_data.append(data)
                if top_data:
                    entry['results'][view] = top_data
        # Only add if at least one view exists
        if entry['results']:
            results.append(entry)
    response_data = {'success': True, 'comparisons': results}
    try:
        if hasattr(current_app, 'redis') and current_app.redis:
            current_app.redis.set(cache_key, json.dumps(response_data), ex=CACHE_TTL)
    except Exception as e:
        current_app.logger.error(f"Error setting Redis cache: {e}")
    return jsonify(response_data)

# --- NEW: Route for manually refreshing the cache ---
@api_bp.route('/cache/refresh', methods=['POST'])
@token_required
def refresh_cache(current_user):
    """
    Manually triggers a refresh of the S3 comparison data cache.
    """
    if not hasattr(current_app, 'redis') or not current_app.redis:
        return jsonify({'success': False, 'error': 'Cache (Redis) is not available.'}), 500

    # The refresh_cache_now function handles its own logging and exceptions
    success, message = refresh_cache_now(current_app)

    if success:
        return jsonify({'success': True, 'message': message}), 200
    else:
        return jsonify({'success': False, 'error': message}), 500
