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


def yaml_loader(path="services/config.yaml"):
    config = {}
    try:
        with open(path, 'r') as f:
            config = yaml.safe_load(f)['frame_extractor']
    except (FileNotFoundError, KeyError) as e:
        # Provide default values as a fallback
        config = {}
        config['MODELS']= {
            'DAMAGE_MODEL_PATH': 'models/detector.pt',
            'WAGON_MODEL_PATH': 'models/best_weights.pt'
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







def pipeline(entry_img:np.ndarray, exit_img:np.ndarray, wagon_model_path:str, defect_model_path:str):
    entry_crop = detect_and_crop_wagon(entry_img, wagon_model_path)
    exit_crop = detect_and_crop_wagon(exit_img, wagon_model_path)

    entry_defects = detect_defects(entry_crop, defect_model_path)
    exit_defects = detect_defects(exit_crop, defect_model_path)

    classified = match_defects(entry_defects, exit_defects, entry_crop, exit_crop)
    label_map = {0: "gunny_bag", 1: "wire"}

    entry_copy = entry_crop.copy()
    exit_copy = exit_crop.copy()

    entry_copy = draw_defects(entry_copy, classified["RESOLVED"], label_map, (0, 0, 255), "RESOLVED")
    entry_copy = draw_defects(entry_copy, classified["OLD"], label_map, (0, 255, 0), "OLD")
    exit_copy = draw_defects(exit_copy, classified["OLD"], label_map, (0, 255, 0), "OLD")
    exit_copy = draw_defects(exit_copy, classified["NEW"], label_map, (0, 0, 255), "NEW")

    entry_resized, exit_resized = resize_to_same_height(entry_copy, exit_copy)
    combined = np.hstack((entry_resized, exit_resized))

    json_data = {k: [{"label": label_map[d["label"]], "bbox": d["bbox"], "conf": d["conf"]} for d in v] for k, v in classified.items()}
    json_data['generated_on'] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    return combined,json_data
