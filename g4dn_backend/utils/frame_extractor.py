import cv2
import os
import collections
import logging
import torch
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort
from .s3_utils import download_file_from_s3, upload_bytes_to_s3
from .yaml_loader import load_yaml

logger = logging.getLogger(__name__)

class FrameExtractor:
    def __init__(self):
        """
        Initializes the FrameExtractor with a YOLO model and DeepSort tracker.
        """
        self.config = load_yaml()['frame_extractor']
        # device
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")

        # load YOLO
        model_path = self.config.get('MODEL_PATH', '')
        if os.path.exists(model_path):
            self.model = YOLO(model_path)
            if torch.cuda.is_available():
                self.model.to(self.device)
        else:
            self.model = None
            logger.error(f"YOLO model not found at: {model_path}")

        # initialize DeepSort
        # You can tweak max_age, n_init, nn_budget, etc. in your YAML if desired.
        self.tracker = DeepSort(max_age=30,  # frames to keep lost tracks
                                n_init=3,   # frames until confirmation
                                nms_max_overlap=1.0,
                                max_cosine_distance=0.2)

    def extract_wagon_frames(self, video_path, s3_save_path, bucket_name, task=None):
        """
        Extract one representative frame per unique wagon using YOLO + DeepSort.
        Returns the number of frames saved.
        """
        CONF_THR = self.config['CONFIDENCE_THRESHOLD']
        WAGON_CLASS_ID = self.config['WAGON_CLASS_ID']
        CAPTURE_DELAY = self.config['CAPTURE_DELAY']
        BUFFER_SIZE = CAPTURE_DELAY + 1
        
        flag = False
        if '/top/' in s3_save_path:
            self.model = YOLO(self.config['TOP_MODEL_PATH'])
            WAGON_CLASS_ID = self.config['TOP_MODEL_WAGON_ID']
            flag = True
            print(f"model loaded from {self.config['TOP_MODEL_PATH']}")

        if self.model is None:
            logger.error("Model not loaded.")
            return 0

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video: {video_path}")
            return 0

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        buffer = collections.deque(maxlen=BUFFER_SIZE)
        saved_ids = set()
        saved_count = 0
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            # optional progress callback
            if task and total_frames and frame_idx % 20 == 0:
                prog = int((frame_idx / total_frames) * 95) # Progress based on video traversal
                status_message = f"Scanned {frame_idx} of {total_frames} frames. Found {saved_count} wagons."
                task.update_state(
                    state='PROGRESS',
                    meta={'progress': prog, 'status': status_message}
                )

            # YOLO inference
            results = self.model(frame, verbose=False, conf=CONF_THR)
            dets = []
            if results and results[0].boxes:
                for box in results[0].boxes:
                    if int(box.cls.item()) == WAGON_CLASS_ID:
                        x1, y1, x2, y2 = box.xyxy.cpu().numpy().flatten().tolist()
                        conf = float(box.conf.cpu().numpy())
                        if conf >= CONF_THR:
                            dets.append(([x1, y1, x2, y2], conf, None))

            # add to buffer
            buffer.append(frame.copy())

            # run tracker on this frame
            tracks = self.tracker.update_tracks(dets, frame=frame)

            # for each confirmed track, if new, save the buffered frame CAPTURE_DELAY ago
            for track in tracks:
                if not track.is_confirmed():
                    continue
                try:
                    tid = int(track.track_id)
                    tid_formatted = f"{tid:03d}"
                except ValueError:
                    # fallback to zero-fill string
                    tid_formatted = str(track.track_id).zfill(3)
                print(tid_formatted)
                
                if tid not in saved_ids and len(buffer) == BUFFER_SIZE:
                    # grab the oldest frame in buffer
                    rep_frame = buffer[0]
                    _, buf = cv2.imencode('.jpg', rep_frame)
                    key = f"{s3_save_path}/wagon_{tid_formatted}.jpg"
                    upload_bytes_to_s3(buf.tobytes(), bucket_name, key)
                    logger.info(f"Saved wagon track {track.track_id} -> {key}")
                    saved_ids.add(tid)
                    saved_count += 1

        cap.release()
        logger.info(f"Saved {saved_count} unique wagon frames to {s3_save_path}")
        if flag:
            self.model = YOLO(self.config['MODEL_PATH'])
        return saved_count
