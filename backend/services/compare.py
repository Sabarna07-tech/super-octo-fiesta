import os
import cv2
from services.com_s3_utils import *
import tempfile 
import shutil
import re
from services.comparison_utils import pipeline, yaml_loader
import logging


def extract_number(filename):
    num = int((filename.strip().split('_')[-1]).split('.')[0])
    return num


def clear_temp_dir(temp_dir:str):
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    

def run_comparison(bucket_name:str,path:str):
    output_path = path.replace('/Processed_Frames/','/Comparision_Results/')
    
    if not (check_folder_exists_in_s3(bucket_name,path+'/entry') and check_folder_exists_in_s3(bucket_name,path+'/exit')):
        return False,"proper path doesn't exist"
    
    
    entry_temp_dir = tempfile.mkdtemp()
    exit_temp_dir = tempfile.mkdtemp()
    entry_list = download_files_from_s3_to_temp(bucket_name,path+'/entry',entry_temp_dir)
    exit_list = download_files_from_s3_to_temp(bucket_name,path+'/exit',exit_temp_dir)
    
    if len(entry_list)==0:
        print(f"No file in {entry_path}...Stopping the process.")
        return (False,f"No file in {entry_path}...Stopping the process.")
    
    if len(exit_list)==0:
        print(f"No file in {exit_path}...Stopping the process.")
        return (False,f"No file in {exit_path}...Stopping the process.")
        
    if len(entry_list)!=len(exit_list):
        print("Number of entry inages : {len(entry_list)}, and number of exit images : {len(exit_list)}\n..stopping the process")
        return (False,f"Number of entry inages : {len(entry_list)}, and number of exit images : {len(exit_list)}\n..stopping the process")
    
    try:
        entry_list = sorted(entry_list, key=extract_number)
        exit_list = sorted(exit_list, key=extract_number)
        exit_list = exit_list[::-1]
    except:
        print("Failed to sort...proceeding as it is.")
        
    images = []
    for en,ex in zip(entry_list,exit_list):
        images.append([en,ex])
    
    config = yaml_loader()['MODELS']
    try:
        for ent,exi in images:
            entry_img = cv2.imread(os.path.join(entry_temp_dir,ent))
            exit_img = cv2.imread(os.path.join(exit_temp_dir,exi))
            img,json_data = pipeline(entry_img,exit_img,config['WAGON_MODEL_PATH'],config['DAMAGE_MODEL_PATH'])
             
            file = output_path+f"/{ent.split('.')[0]}&{exi.split('.')[0]}.jpg"
            js_path = output_path+f"/{ent.split('.')[0]}&{exi.split('.')[0]}.json"
            json_data['entry_image'] = ent
            json_data['exit_image'] = exi
            
            upload_image_to_s3(img,bucket_name,file)
            upload_json_to_s3(json_data,bucket_name,js_path)
    except Exception as e:
        logging.info(f"Something went worng: {str(e)}")
        return (False,"Something went Wrong, Please try again later") 
    
    clear_temp_dir(entry_temp_dir)
    clear_temp_dir(exit_temp_dir)
    return (True,"Processing is done and saved")
    
    
    
if __name__=='__main__':
    from dotenv import load_dotenv
    load_dotenv()
    
    path="2024_Oct_CR_WagonDamageDetection/Wagon_H/18-06-2025/admin1/Processed_Frames/right"
    #ext="2024_Oct_CR_WagonDamageDetection/Wagon_H/17-06-2025/admin1/Processed_Frames/right/exit"
    bucket_name = os.getenv("S3_BUCKET_NAME")
    print(bucket_name)
    print(path)
    run_comparison(bucket_name,path)