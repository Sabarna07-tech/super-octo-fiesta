from flask import Flask,request,jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import jwt
import datetime
from functools import wraps
import os
import logging
from utils.celery_worker import celery
from celery.result import AsyncResult
import signal
from dotenv import load_dotenv
from utils.yaml_loader import load_yaml
from utils.celery_worker import frame_extraction_task

load_dotenv()

app=Flask(__name__)
CORS(app)


@app.route('/cancel-task/<task_id>', methods=['POST'])
def cancel_task(task_id):
    """Revokes a Celery task by ID, with termination if supported."""
    try:
        result = AsyncResult(task_id, app=celery)
        state = result.state

        if state in ['PENDING', 'RECEIVED', 'STARTED', 'PROGRESS']:
            # Attempt to revoke and terminate the task if supported
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
            return jsonify({'message': f'Task is already Ended.'}), 200
        else:
            return jsonify({'error': f'Task cannot be cancelled from state: {state}'}), 400

    except Exception as e:
        logging.error(f"Failed to revoke task {task_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to cancel task: {str(e)}'}), 500

@app.route('/task-status/<task_id>', methods=['GET'])
def task_status(task_id):
    """Gets the status of a Celery task."""
    task = AsyncResult(task_id, app=celery)
    response = {'state': task.state}

    if task.state == 'PENDING':
        response.update({'status': 'Pending...', 'progress': 0})
    elif task.state == 'PROGRESS':
        response.update(task.info or {})
    elif task.state == 'SUCCESS':
        response.update(task.info or {})
        response['result'] = task.result
    elif task.state == 'FAILURE':
        # When a task fails by raising an exception, task.info contains the exception object.
        # We convert it to a string to send it as a JSON response.
        response.update({
            'status': str(task.info),
            'error': True,
            'progress': 100
        })
    else:
        # Handle other states like REVOKED
        response.update({'status': task.state, 'progress': 100})

    return jsonify(response)


@app.route('/frame-extract',methods=['POST'])
def extract():
    data = request.get_json()
    logging.info("Received POST /run-comparison")
    task_id = None
    try:
        print(data)
        date = data.get('date')
        name = data.get('name')
        direction = data.get('direction') # 'entry' or 'exit'
        view = data.get('view')

        if not all([date, name, direction,view]):
            return jsonify({'error': 'Missing one or more required parameters: date, name, direction'}), 400
        if direction not in ['entry', 'exit']:
            return jsonify({'error': "Invalid direction specified. Use 'entry' or 'exit'."}), 400

        try:
            date_obj = datetime.datetime.strptime(date, '%Y-%m-%d')
            date = date_obj.strftime('%d-%m-%Y')
        except ValueError:
            logging.info(f"Error in date formatting : {date}")
            return jsonify({'error': 'Invalid date format'}), 400

        path = f"{os.getenv("S3_BASE_DIR")}/{date}/{name}/Raw-videos/{view}/{direction}"
        bucket_name = os.getenv("S3_BUCKET_NAME")
        logging.info("Processing....")
        task = frame_extraction_task.apply_async(args=[bucket_name, path])
        task_id = task.id
    except Exception as e:
        logging.info(f"ERROR : \n{str(e)}")
        return jsonify({'error': str(e)}), 500
    return jsonify({'task_id': task_id, 'message': 'Task started'}), 202


if __name__ == '__main__':
    load_dotenv()
    port = load_yaml()['app']['port']
    app.run(debug=True, port=port)