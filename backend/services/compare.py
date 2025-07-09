import os
import cv2
from services.com_s3_utils import *
import tempfile 
import shutil
import re
from services.comparison_utils import pipeline, yaml_loader, top_detect_and_annotate
import logging
from services.s3_utils import upload_file_to_s3


def extract_number(filename):
    """Extracts the numerical part of a filename for sorting."""
    num = int((filename.strip().split('_')[-1]).split('.')[0])
    return num


def clear_temp_dir(temp_dir:str):
    """Removes a directory and all its contents."""
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    

def run_comparison(bucket_name:str,path:str, task=None):
    """
    Runs a side-by-side comparison between 'entry' and 'exit' images.
    """
    output_path = path.replace('/Processed_Frames/','/Comparision_Results/')
    
    entry_path = os.path.join(path, 'entry').replace("\\", "/")
    exit_path = os.path.join(path, 'exit').replace("\\", "/")

    if not (check_folder_exists_in_s3(bucket_name, entry_path) and check_folder_exists_in_s3(bucket_name, exit_path)):
        return False, "Proper 'entry' and 'exit' paths don't exist."
    
    entry_temp_dir = tempfile.mkdtemp()
    exit_temp_dir = tempfile.mkdtemp()
    entry_list = download_files_from_s3_to_temp(bucket_name, entry_path, entry_temp_dir)
    exit_list = download_files_from_s3_to_temp(bucket_name, exit_path, exit_temp_dir)
    
    if not entry_list:
        logging.error(f"No files found in {entry_path}. Stopping the process.")
        clear_temp_dir(entry_temp_dir)
        clear_temp_dir(exit_temp_dir)
        return (False, f"No files in {entry_path}. Stopping the process.")
    
    if not exit_list:
        logging.error(f"No files found in {exit_path}. Stopping the process.")
        clear_temp_dir(entry_temp_dir)
        clear_temp_dir(exit_temp_dir)
        return (False, f"No files in {exit_path}. Stopping the process.")
        
    if len(entry_list) != len(exit_list):
        logging.error(f"Mismatched file counts: {len(entry_list)} entry images and {len(exit_list)} exit images.")
        clear_temp_dir(entry_temp_dir)
        clear_temp_dir(exit_temp_dir)
        return (False, f"Number of entry images ({len(entry_list)}) does not match exit images ({len(exit_list)}).")
    
    try:
        entry_list = sorted(entry_list, key=extract_number)
        exit_list = sorted(exit_list, key=extract_number, reverse=True)
    except Exception as e:
        logging.warning(f"Failed to sort image lists: {e}. Proceeding without sorting.")
        
    images = list(zip(entry_list, exit_list))
    total_images = len(images)
    processed_images = 0
    
    config = yaml_loader()
    logging.info(f"{config}")
    config = config["MODELS"]
    try:
        for ent, exi in images:
            entry_img = cv2.imread(os.path.join(entry_temp_dir, ent))
            exit_img = cv2.imread(os.path.join(exit_temp_dir, exi))
            img, json_data = pipeline(entry_img, exit_img, config['WAGON_MODEL_PATH'], config['DAMAGE_MODEL_PATH'])
            
            base_filename = f"{os.path.splitext(ent)[0]}&{os.path.splitext(exi)[0]}"
            file_path = f"{output_path}/{base_filename}.jpg"
            json_path = f"{output_path}/{base_filename}.json"
            
            json_data['entry_image'] = ent
            json_data['exit_image'] = exi
            
            upload_image_to_s3(img, bucket_name, file_path)
            upload_json_to_s3(json_data, bucket_name, json_path)
            processed_images += 1
            if task:
                progress = int((processed_images / total_images) * 100)
                task.update_state(
                    state='PROGRESS',
                    meta={'status': f'Processing image {processed_images}/{total_images}', 'progress': progress}
                )
    except Exception as e:
        logging.error(f"An error occurred during the comparison pipeline: {e}", exc_info=True)
        clear_temp_dir(entry_temp_dir)
        clear_temp_dir(exit_temp_dir)
        return (False, "Something went wrong during comparison. Please check server logs.") 
    
    clear_temp_dir(entry_temp_dir)
    clear_temp_dir(exit_temp_dir)
    return (True, "Comparison processing is complete and results have been saved.")

def run_top_detection(bucket_name:str, path:str):
    """
    Runs top-down damage detection on all images in a given S3 path.
    """
    output_path = path.replace('/Processed_Frames/', '/Comparision_Results/')
    
    if not check_folder_exists_in_s3(bucket_name, path):
        logging.error(f"Input path does not exist in S3: {path}")
        return False, "The specified S3 path does not exist."
        
    input_dir = tempfile.mkdtemp()
    output_dir = tempfile.mkdtemp()
    
    try:
        logging.info(f"Downloading files from s3://{bucket_name}/{path} to {input_dir}")
        download_files_from_s3_to_temp(bucket_name, path, input_dir)
        
        logging.info(f"Running top detection and annotation from {input_dir} to {output_dir}")
        top_detect_and_annotate(input_dir, output_dir)
        
        logging.info(f"Uploading results from {output_dir} to s3://{bucket_name}/{output_path}")
        upload_to_s3_from_folder(output_dir, bucket_name, output_path)
    except Exception as e:
        logging.error(f"An error occurred during top detection: {e}", exc_info=True)
        return (False, "An error occurred during top detection. Please check the logs.")
    finally:
        clear_temp_dir(input_dir)
        clear_temp_dir(output_dir)
    
    return (True, "Top detection processing is complete and results have been saved.")
    
    
if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    
    # Example usage for testing top detection
    path = "2024_Oct_CR_WagonDamageDetection/Wagon_H/18-06-2025/admin1/Processed_Frames/top/entry"
    bucket_name = os.getenv("S3_BUCKET_NAME")
    
    print(f"Using Bucket: {bucket_name}")
    print(f"Running top detection on path: {path}")
    
    success, message = run_top_detection(bucket_name, path)
    
    print(f"Result: {'Success' if success else 'Failure'}")
    print(f"Message: {message}")