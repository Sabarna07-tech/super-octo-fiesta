import cv2
import os
import collections
import logging
from ultralytics import YOLO
from .s3_utils import download_file_from_s3, upload_bytes_to_s3, generate_presigned_url

# Configure logging
logger = logging.getLogger(__name__)

class FrameExtractor:
    def __init__(self, model_path='models/best_weights.pt'):
        """
        Initializes the FrameExtractor with a YOLO model.
        """
        if os.path.exists(model_path):
            self.model = YOLO(model_path)
        else:
            self.model = None
            logger.error(f"YOLO model not found at path: {model_path}")

    def extract_frames_from_video_s3(self, s3_key, bucket_name, output_prefix, frame_interval=10, task=None):
        if not self.model:
            return {'success': False, 'error': 'YOLO model not loaded.'}

        # Create a temporary directory to store the downloaded video
        temp_dir = 'temp_downloads'
        os.makedirs(temp_dir, exist_ok=True)
        local_video_path = os.path.join(temp_dir, os.path.basename(s3_key))

        # Download the video from S3
        if not download_file_from_s3(bucket_name, s3_key, local_video_path):
            return {'success': False, 'error': f'Failed to download video from S3: {s3_key}'}

        # Process the video to extract frames, passing the task object for progress updates
        saved_frame_count, saved_frames = self.extract_wagon_frames(local_video_path, self.model, task=task)

        # Upload frames to S3
        frame_urls = []
        if saved_frame_count > 0:
            for i, frame_img in enumerate(saved_frames):
                frame_filename = f"frame_{i+1}.jpg"
                frame_s3_key = os.path.join(output_prefix, frame_filename).replace("\\", "/")
                
                # Encode frame to JPG bytes
                _, img_encoded = cv2.imencode('.jpg', frame_img)
                image_bytes = img_encoded.tobytes()

                # Upload to S3
                success, message = upload_bytes_to_s3(image_bytes, bucket_name, frame_s3_key)
                if success:
                    # Generate a presigned URL for the uploaded frame
                    presigned_url = generate_presigned_url(bucket_name, frame_s3_key)
                    if presigned_url:
                        frame_urls.append(presigned_url)
                else:
                    logger.error(f"Failed to upload frame {frame_s3_key}: {message}")

        # Clean up the local video file
        if os.path.exists(local_video_path):
            os.remove(local_video_path)

        return {'success': True, 'frame_urls': frame_urls, 'count': len(frame_urls)}

    def extract_wagon_frames(self, video_path, model, task=None):
        # --- Configuration ---
        CONFIDENCE_THRESHOLD = 0.6
        WAGON_CLASS_ID = 1  # Assuming '1' is the class ID for wagons
        CAPTURE_DELAY = 5
        FRAME_BUFFER_SIZE = CAPTURE_DELAY + 1

        if model is None:
            logger.error("YOLO model is not loaded. Aborting extraction.")
            if task:
                task.update_state(state='FAILURE', meta={'status': 'Model not loaded.'})
            return 0, []

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Error: Could not open video file {video_path}")
            return 0, []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_buffer = collections.deque(maxlen=FRAME_BUFFER_SIZE)
        current_capture_state = "SEARCHING_FOR_WAGON"
        potential_capture_frame_img = None
        saved_frame_count = 0
        saved_frames = []
        frame_idx = 0

        logger.info(f"Processing video: {video_path}...")
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            
            # This block will now execute and send progress updates
            if task and total_frames > 0 and frame_idx % 20 == 0:
                progress = int((frame_idx / total_frames) * 90) # Progress within the video
                task.update_state(state='PROGRESS', meta={'status': f'Processing frame {frame_idx}/{total_frames}', 'progress': progress})

            # Run detection on the frame
            results = model(frame, verbose=False, conf=CONFIDENCE_THRESHOLD)

            # Extract coordinates for detected wagons
            current_detected_wagon_boxes_coords = []
            if results and results[0].boxes:
                for box_obj in results[0].boxes:
                    conf = box_obj.conf.item()
                    cls_id = int(box_obj.cls.item())

                    if cls_id == WAGON_CLASS_ID and conf >= CONFIDENCE_THRESHOLD:
                        current_detected_wagon_boxes_coords.append(box_obj.xyxy.cpu().numpy().flatten().tolist())

            frame_buffer.append((frame.copy(), current_detected_wagon_boxes_coords))

            if len(frame_buffer) == FRAME_BUFFER_SIZE:
                num_current_wagon_boxes = len(current_detected_wagon_boxes_coords)
                oldest_frame_img_in_buf, oldest_wagon_boxes_in_buf_coords = frame_buffer[0]
                num_oldest_wagon_boxes_in_buf = len(oldest_wagon_boxes_in_buf_coords)

                if current_capture_state == "SEARCHING_FOR_WAGON":
                    if num_current_wagon_boxes == 1:
                        current_capture_state = "SINGLE_WAGON_PASSING"
                        potential_capture_frame_img = None
                elif current_capture_state == "SINGLE_WAGON_PASSING":
                    if num_current_wagon_boxes == 1:
                        if num_oldest_wagon_boxes_in_buf == 1:
                            potential_capture_frame_img = oldest_frame_img_in_buf.copy()
                    else:
                        if potential_capture_frame_img is not None:
                            saved_frames.append(potential_capture_frame_img)
                            saved_frame_count += 1
                        potential_capture_frame_img = None
                        current_capture_state = "SEARCHING_FOR_WAGON"

        if current_capture_state == "SINGLE_WAGON_PASSING" and potential_capture_frame_img is not None:
            saved_frames.append(potential_capture_frame_img)
            saved_frame_count += 1

        cap.release()
        logger.info(f"Processing complete. Extracted {saved_frame_count} individual wagon frames.")
        return saved_frame_count, saved_frames