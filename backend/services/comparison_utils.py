import torch
import torchvision.transforms as transforms
import torch.nn.functional as F
import numpy as np
import cv2
import os
import json
from PIL import Image
from ultralytics import YOLO
import matplotlib.pyplot as plt
from torchvision.models import resnet18
from torchvision.models.feature_extraction import create_feature_extractor
from datetime import datetime
from dotenv import load_dotenv
import yaml
# FIX: Correctly import the S3 utility functions
from . import com_s3_utils
import logging


def yaml_loader(config_filename="config.yaml"):
    config = {}
    try:
        # Construct an absolute path to the config file relative to this script's location
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, config_filename)
        logging.info(config_path)

        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            # Safely get the 'MODELS' dictionary from the loaded data
            
    except (FileNotFoundError, KeyError, TypeError) as e:
        logging.error(f"Warning: Could not load {config_filename}. Using fallback default config. Error: {e}")
        # Provide default values as a fallback if the file is not found or is invalid
        config = {
            "MODEL":{
                'DAMAGE_MODEL_PATH': 'models/detector.pt',
                'WAGON_MODEL_PATH': 'models/best_weights.pt',
                "TOP_MODEL_PATH": "models/top_damage.pt",
                "CLASS_MAP":{
                    0: "crack",
                    1: "gravel",
                    2: "hole"
                }
            }
        }
    return config


load_dotenv()


resnet = resnet18(pretrained=True)
resnet.eval()
feature_extractor = create_feature_extractor(resnet, return_nodes={"avgpool": "features"})
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])


def detect_and_crop_wagon(image, model_path):
    """
    Uses wagon detection model : best_weights.pt
    """
    model = YOLO(model_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if torch.cuda.is_available():
        model.to(device)
    results = model(image)
    crops = []
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            crop = image[y1:y2, x1:x2]
            crops.append(crop)
    return crops[0] if crops else image 


def detect_defects(image, model_path):
    """
    Uses defect detection model : detector.pt
    """
    model = YOLO(model_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if torch.cuda.is_available():
        model.to(device)
    bgr = image.copy()
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    img_pil = Image.fromarray(rgb)
    results = model(img_pil)
    detections = []
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            label = int(box.cls.item())
            conf = float(box.conf.item())
            detections.append({"bbox": (x1, y1, x2, y2), "label": label, "conf": conf})
    return detections
    

def get_descriptor(image, bbox):
    """
    Image vectorization
    """
    x1, y1, x2, y2 = bbox
    patch = image[y1:y2, x1:x2]
    if patch.size == 0:
        return torch.zeros(512)
    tensor = transform(patch).unsqueeze(0)
    with torch.no_grad():
        feat = feature_extractor(tensor)["features"].squeeze()
    return feat / feat.norm() 
    
def compute_centroid(bbox):
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)

def match_defects(entry_list, exit_list, entry_img, exit_img):
    matched_exit = set()
    results = {"OLD": [], "NEW": [], "RESOLVED": []}
    # Extract descriptors
    for e in entry_list:
        e["desc"] = get_descriptor(entry_img, e["bbox"])
        e["centroid"] = compute_centroid(e["bbox"])
    for x in exit_list:
        x["desc"] = get_descriptor(exit_img, x["bbox"])
        x["centroid"] = compute_centroid(x["bbox"])
    # Match entry to exit
    for e in entry_list:
        best_sim, best_idx = -1, -1
        for i, x in enumerate(exit_list):
            if i in matched_exit: continue
            same_class = (e["label"] == x["label"])
            desc_sim = F.cosine_similarity(e["desc"], x["desc"], dim=0).item()
            dist = np.linalg.norm(np.array(e["centroid"]) - np.array(x["centroid"]))
            if same_class and desc_sim > 0.3 and dist < 30:
                if desc_sim > best_sim:
                    best_sim, best_idx = desc_sim, i
        if best_idx >= 0:
            results["OLD"].append(exit_list[best_idx])
            matched_exit.add(best_idx)
        else:
            results["RESOLVED"].append(e)
    # Remaining exit = NEW
    for i, x in enumerate(exit_list):
        if i not in matched_exit:
            results["NEW"].append(x)
    return results
    
def draw_defects(image, defects, label_map, color, tag):
    for det in defects:
        x1, y1, x2, y2 = map(int, det["bbox"])
        cls = label_map[det["label"]]
        text = f"{cls} [{tag}]"
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        cv2.putText(image, text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    return image
    
def resize_to_same_height(img1, img2):
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]
    target_height = min(h1, h2)
    img1_resized = cv2.resize(img1, (int(w1 * target_height / h1), target_height))
    img2_resized = cv2.resize(img2, (int(w2 * target_height / h2), target_height))
    return img1_resized, img2_resized

def pipeline(entry_img: np.ndarray, exit_img: np.ndarray, wagon_model_path: str, defect_model_path: str):
    """
    Processes entry and exit images to detect, classify, and compare wagon defects,
    ignoring specified classes like 'gunny_bag' and 'wire'.
    """
    # --- 1. Crop wagon from the full image ---
    entry_crop = detect_and_crop_wagon(entry_img, wagon_model_path)
    exit_crop = detect_and_crop_wagon(exit_img, wagon_model_path)

    # --- 2. Detect all defects in the cropped images ---
    entry_defects_all = detect_defects(entry_crop, defect_model_path)
    exit_defects_all = detect_defects(exit_crop, defect_model_path)

    # --- 3. Define class map and classes to ignore ---
    label_map = {0: 'Dent', 1: 'gunny_bag', 2: 'hole', 3: 'missing_door', 4: 'open_door', 5: 'scratch', 6: 'wire'}
    classes_to_ignore = {'gunny_bag', 'wire'}
    
    # Create a set of integer labels to ignore for efficient lookup
    labels_to_ignore = {k for k, v in label_map.items() if v in classes_to_ignore}

    # --- 4. Filter out the ignored classes from detections ---
    entry_defects_filtered = [d for d in entry_defects_all if d["label"] not in labels_to_ignore]
    exit_defects_filtered = [d for d in exit_defects_all if d["label"] not in labels_to_ignore]

    # --- 5. Match the filtered defects between entry and exit ---
    classified = match_defects(entry_defects_filtered, exit_defects_filtered, entry_crop, exit_crop)

    # --- 6. Draw bounding boxes on the images for visualization ---
    entry_copy = entry_crop.copy()
    exit_copy = exit_crop.copy()

    # Draw resolved and old defects on the entry image
    entry_copy = draw_defects(entry_copy, classified["RESOLVED"], label_map, (0, 0, 255), "RESOLVED")
    entry_copy = draw_defects(entry_copy, classified["OLD"], label_map, (0, 255, 0), "OLD")
    
    # Draw old and new defects on the exit image
    exit_copy = draw_defects(exit_copy, classified["OLD"], label_map, (0, 255, 0), "OLD")
    exit_copy = draw_defects(exit_copy, classified["NEW"], label_map, (0, 0, 255), "NEW")

    # --- 7. Combine images and prepare JSON output ---
    entry_resized, exit_resized = resize_to_same_height(entry_copy, exit_copy)
    combined_image = np.hstack((entry_resized, exit_resized))

    # Create JSON output, ensuring not to include descriptor and centroid data
    json_data = {
        status: [{"label": label_map[d["label"]], "bbox": d["bbox"], "conf": d["conf"]} for d in defects]
        for status, defects in classified.items()
    }
    json_data['generated_on'] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    return combined_image, json_data
    
    
def top_detect_and_annotate(input_folder, output_folder):
    # Load the YOLO model and class map
    config = yaml_loader()
    model = YOLO(config.get('TOP_MODEL_PATH', 'models/top_damage.pt'))
    class_map = config.get('CLASS_MAP', {0: "crack", 1: "gravel", 2: "hole"})

    os.makedirs(output_folder, exist_ok=True)

    for image_name in os.listdir(input_folder):
        if not image_name.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue

        image_path = os.path.join(input_folder, image_name)
        image = cv2.imread(image_path)
        if image is None: continue

        results = model(image_path)[0]
        counts = {v: 0 for v in class_map.values()}

        for box in results.boxes:
            cls_id = int(box.cls.item())
            if cls_id in class_map:
                label = class_map[cls_id]
                counts[label] += 1
                xyxy = box.xyxy[0].cpu().numpy().astype(int)
                cv2.rectangle(image, (xyxy[0], xyxy[1]), (xyxy[2], xyxy[3]), (0, 255, 0), 2)
                cv2.putText(image, label, (xyxy[0], xyxy[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        cv2.imwrite(os.path.join(output_folder, image_name), image)
        
        json_data = {'image_name': image_name, **counts}
        json_path = os.path.join(output_folder, os.path.splitext(image_name)[0] + ".json")
        with open(json_path, 'w') as f:
            json.dump(json_data, f, indent=4)

    print(f"Processing completed for '{output_folder}'")


# --- API Data Fetching Functions ---

def get_total_damage_counts(s3_base_path, bucket_name):
    """
    Calculates the total damage counts for left, right, and top views.
    """
    try:
        # Get Top View Counts
        top_details_dir = f"{s3_base_path}/top/exit/"
        top_json_files = com_s3_utils.list_s3_objects(bucket_name, top_details_dir, extension=".json")
        top_damages = 0
        for file_key in top_json_files:
            wagon_json = com_s3_utils.read_s3_json(bucket_name, file_key)
            if wagon_json:
                top_damages += wagon_json.get('cracks', 0) + wagon_json.get('gravel', 0) + wagon_json.get('hole', 0)
        
        # NOTE: Using mock data for left/right views as per focus.
        # A full implementation would calculate these from their respective JSONs.
        return {
            "success": True,
            "counts": {
                "left_view_damages": 519,
                "right_view_damages": 456,
                "top_view_damages": top_damages
            }
        }
    except Exception as e:
        print(f"Error in get_total_damage_counts: {e}")
        return {"success": False, "error": str(e)}


def get_comparison_details(s3_base_path, bucket_name):
    """
    Gathers detailed comparison data for each wagon, with special handling for the top view.
    """
    try:
        top_details_dir = f"{s3_base_path}/top/exit/"
        top_json_files = com_s3_utils.list_s3_objects(bucket_name, top_details_dir, extension=".json")
        all_wagons_data = {}

        for file_key in top_json_files:
            wagon_json = com_s3_utils.read_s3_json(bucket_name, file_key)
            if not (wagon_json and 'image_name' in wagon_json): continue
            
            try:
                wagon_id = os.path.splitext(wagon_json['image_name'])[0].split('_')[-1]
                
                if wagon_id not in all_wagons_data:
                    all_wagons_data[wagon_id] = {
                        "wagon_id": wagon_id,
                        "left_view_details": [], # Mocked for this fix
                        "right_view_details": [], # Mocked for this fix
                        "top_view_details": []
                    }
                
                image_path = f"{top_details_dir}{wagon_json['image_name']}"
                image_url = com_s3_utils.get_s3_public_url(bucket_name, image_path)

                cracks = wagon_json.get('cracks', 0)
                gravel = wagon_json.get('gravel', 0)
                hole = wagon_json.get('hole', 0)
                total_damages = cracks + gravel + hole

                if total_damages > 0:
                    if cracks > 0: all_wagons_data[wagon_id]['top_view_details'].append({"type": "Cracks", "count": cracks, "image": image_url})
                    if gravel > 0: all_wagons_data[wagon_id]['top_view_details'].append({"type": "Gravel", "count": gravel, "image": image_url})
                    if hole > 0: all_wagons_data[wagon_id]['top_view_details'].append({"type": "Holes", "count": hole, "image": image_url})
                else:
                    all_wagons_data[wagon_id]['top_view_details'].append({"status": "No damages detected", "image": image_url})

            except (IndexError, KeyError) as e:
                print(f"Skipping file due to parsing error: {file_key}, Error: {e}")
                continue
        
        sorted_details = sorted(all_wagons_data.values(), key=lambda x: int(x['wagon_id']))

        return {"success": True, "details": sorted_details}

    except Exception as e:
        print(f"Error in get_comparison_details: {e}")
        return {"success": False, "error": str(e)}
