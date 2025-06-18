import cv2
import os
import collections
import logging
import torch
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

# Use the application's S3 utils
from .s3_utils import download_file_from_s3, upload_bytes_to_s3, generate_presigned_url

logger = logging.getLogger(__name__)

class FrameExtractor:
    def __init__(self, config):
        """
        Initializes the FrameExtractor with a YOLO model and DeepSort tracker
        using the application's configuration.
        """
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"FrameExtractor using device: {self.device}")

        # Load YOLO model from the path specified in the app config
        model_path = self.config.get('MODEL_PATH', '')
        if os.path.exists(model_path):
            self.model = YOLO(model_path)
            if torch.cuda.is_available():
                self.model.to(self.device)
        else:
            self.model = None
            logger.error(f"YOLO model not found at path: {model_path}")

        # Initialize DeepSort tracker
        self.tracker = DeepSort(
            max_age=self.config.get('DEEPSORT_MAX_AGE', 150),
            n_init=3,
            nms_max_overlap=1.0,
            max_cosine_distance=0.3
        )

    def extract_wagon_frames(self, video_path, s3_save_path, bucket_name, task=None):
        """
        Extracts one representative frame per unique wagon using YOLO + DeepSort.
        This is the core logic from the Jupyter Notebook.
        
        Returns the number of frames saved and a list of their S3 keys.
        """
        CONF_THR = self.config['CONFIDENCE_THRESHOLD']
        WAGON_CLASS_ID = self.config['WAGON_CLASS_ID']
        CAPTURE_DELAY = self.config['CAPTURE_DELAY']
        BUFFER_SIZE = CAPTURE_DELAY + 1

        if self.model is None:
            logger.error("Model not loaded.")
            return 0, []

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video: {video_path}")
            return 0, []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        buffer = collections.deque(maxlen=BUFFER_SIZE)
        saved_ids = set()
        saved_frame_keys = []
        frame_idx = 0
        
        logger.info(f"Starting DeepSort frame extraction for video: {os.path.basename(video_path)}")

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            
            if task and total_frames and frame_idx % 20 == 0:
                prog = int((frame_idx / total_frames) * 90)
                task.update_state(state='PROGRESS', meta={'status': f'Processing frame {frame_idx}/{total_frames}', 'progress': prog})

            # YOLO inference
            results = self.model(frame, verbose=False, conf=CONF_THR)
            
            # Prepare detections for DeepSort
            detections = []
            if results and results[0].boxes:
                for box in results[0].boxes:
                    if int(box.cls.item()) == WAGON_CLASS_ID:
                        x1, y1, x2, y2 = box.xyxy.cpu().numpy().flatten().tolist()
                        conf = float(box.conf.cpu().numpy())
                        if conf >= CONF_THR:
                            detections.append(([x1, y1, x2, y2], conf, str(WAGON_CLASS_ID)))
            
            buffer.append(frame.copy())
            
            # Update tracker
            tracks = self.tracker.update_tracks(detections, frame=frame)
            
            # Save frame for new, confirmed tracks
            for track in tracks:
                if not track.is_confirmed():
                    continue
                
                track_id = int(track.track_id)
                if track_id not in saved_ids and len(buffer) == BUFFER_SIZE:
                    rep_frame = buffer[0]
                    _, buf = cv2.imencode('.jpg', rep_frame)
                    
                    s3_key = f"{s3_save_path}/wagon_{track_id:03d}.jpg"
                    
                    upload_success, _ = upload_bytes_to_s3(buf.tobytes(), bucket_name, s3_key)
                    
                    if upload_success:
                        logger.info(f"Saved wagon track {track_id} -> {s3_key}")
                        saved_ids.add(track_id)
                        saved_frame_keys.append(s3_key)

        cap.release()
        logger.info(f"Saved {len(saved_frame_keys)} unique wagon frames to {s3_save_path}")
        return len(saved_frame_keys), saved_frame_keys

    def extract_frames_from_video_s3(self, s3_key, bucket_name, output_prefix, task=None):
        """
        A wrapper method to integrate the DeepSort extractor with the Celery worker.
        It handles S3 download/upload and calls the core extraction logic.
        """
        if not self.model:
            return {'success': False, 'error': 'YOLO model not loaded.'}

        temp_dir = 'temp_downloads'
        os.makedirs(temp_dir, exist_ok=True)
        local_video_path = os.path.join(temp_dir, os.path.basename(s3_key))

        try:
            # 1. Download video from S3
            if not download_file_from_s3(bucket_name, s3_key, local_video_path):
                return {'success': False, 'error': f'Failed to download video from S3: {s3_key}'}

            # 2. Call the new extraction method
            saved_frame_count, saved_frame_keys = self.extract_wagon_frames(
                video_path=local_video_path,
                s3_save_path=output_prefix,
                bucket_name=bucket_name,
                task=task
            )

            # 3. Generate presigned URLs for the frontend
            frame_urls = []
            if saved_frame_count > 0:
                for key in saved_frame_keys:
                    presigned_url = generate_presigned_url(bucket_name, key)
                    if presigned_url:
                        frame_urls.append(presigned_url)
            
            return {'success': True, 'frame_urls': frame_urls, 'count': len(frame_urls)}

        finally:
            # 4. Clean up the local video file
            if os.path.exists(local_video_path):
                os.remove(local_video_path)