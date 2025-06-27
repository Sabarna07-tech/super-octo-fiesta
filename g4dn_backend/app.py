from flask import Flask,request,jsonify
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

app=Flask(__name__)

@app.route('/cancel-task/<task_id>', methods=['POST'])
def cancel_task(task_id):
    """Revokes a Celery task by ID, with termination if supported."""
    try:
        result = AsyncResult(task_id, app=celery)
        state = result.state

        if state in ['PENDING', 'RECEIVED', 'STARTED']:
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
            return jsonify({'message': f'Task is already {state.lower()}.'}), 200
        else:
            return jsonify({'error': f'Task cannot be cancelled from state: {state}'}), 400

    except Exception as e:
        logging.error(f"Failed to revoke task {task_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Failed to cancel task: {str(e)}'}), 500



@app.route('/frame-extract',methods=['POST'])
def extract():
    data = request.get_json()
    logging.info("Received POST /run-comparison")
    path = data.get("path")
    bucket_name = os.getenv("S3_BUCKET_NAME")
    try:
        logging.info("Processing....")
        task = frame_extraction_task.apply_async(args=[bucket_name, path])
    except Exception as e:
        logging.info(f"ERROR : \n{str(e)}")
        return jsonify({'error': str(e)}), 500
    return jsonify({'task_id': task.id, 'message': 'Task started'}), 202
    

if __name__ == '__main__':
    load_dotenv()
    port = load_yaml()['app']['port']
    app.run(debug=True, port=port)
	
	