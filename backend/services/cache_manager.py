import logging
import json
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta

def cache_comparison_data(app):
    """
    Scans S3 for comparison data and caches it in Redis.
    This function runs within the Flask application context to access config and Redis.
    """
    with app.app_context():
        logging.info("Starting scheduled cache update for comparison data...")
        try:
            # Imports are inside the function to work with the app context
            from services.com_s3_utils import find_comparison_dates_with_results
            from services.s3_utils import get_s3_client
            from services.comparison_utils import get_comparison_details, get_total_damage_counts

            bucket = app.config['S3_BUCKET']
            base_prefix = app.config.get('S3_UPLOAD_FOLDER')
            s3 = get_s3_client()

            # This function returns dates in 'YYYY-MM-DD' format
            dates = find_comparison_dates_with_results(bucket, base_prefix)
            logging.info(f"Found {len(dates)} dates with comparison results to cache.")

            for date_str_ymd in dates:
                # S3 paths are constructed with 'DD-MM-YYYY'
                try:
                    date_obj = datetime.strptime(date_str_ymd, '%Y-%m-%d')
                    date_str_dmy = date_obj.strftime('%d-%m-%Y')
                except ValueError:
                    logging.warning(f"Skipping date '{date_str_ymd}' due to unexpected format.")
                    continue

                prefix_for_admins = f"{base_prefix}/{date_str_dmy}/"
                
                # Get admin subfolders for the given date
                pages = s3.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=prefix_for_admins, Delimiter='/')
                admins = [cp['Prefix'].rstrip('/').split('/')[-1] for page in pages for cp in page.get('CommonPrefixes', [])]

                for admin in admins:
                    for view in ('left', 'right', 'top'):
                        # This path needs to match exactly what the frontend requests for details
                        path = f"{base_prefix}/{date_str_dmy}/{admin}/Processed_Frames/{view}"
                        
                        details = get_comparison_details(s3_base_path=path, bucket_name=bucket)
                        counts = get_total_damage_counts(s3_base_path=path, bucket_name=bucket)
                        
                        if app.redis:
                            if details and details.get('success'):
                                app.redis.set(f"comparison_details:{path}", json.dumps(details), ex=3600)
                            if counts and counts.get('success'):
                                app.redis.set(f"damage_counts:{path}", json.dumps(counts), ex=3600)
            logging.info("Finished caching comparison data.")
        except Exception as e:
            logging.error(f"Error during scheduled cache update: {e}", exc_info=True)


def refresh_cache_now(app):
    """
    Clears the existing comparison cache and immediately repopulates it.
    Returns a tuple of (success_boolean, message_string).
    """
    logging.info("Manual cache refresh triggered.")
    if not app.redis:
        logging.error("Redis is not available for cache refresh.")
        return False, "Redis unavailable"

    try:
        # Clear old keys using scan_iter to be non-blocking
        keys_to_delete = []
        for key in app.redis.scan_iter('comparison_details:*'):
            keys_to_delete.append(key)
        for key in app.redis.scan_iter('damage_counts:*'):
            keys_to_delete.append(key)
        
        if keys_to_delete:
            app.redis.delete(*keys_to_delete)
            logging.info(f"Deleted {len(keys_to_delete)} old cache keys.")

        # Immediately repopulate
        cache_comparison_data(app)
        logging.info("Cache repopulation complete.")
        return True, "Cache cleared & refreshed"
    except Exception as e:
        logging.error(f"Cache refresh failed: {e}", exc_info=True)
        return False, str(e)


def init_scheduler(app):
    """
    Initializes and starts the background scheduler.
    """
    scheduler = BackgroundScheduler(daemon=True)
    # Run once on startup after a short delay to allow the app to be ready
    scheduler.add_job(func=cache_comparison_data, args=[app], trigger='date', run_date=datetime.now() + timedelta(seconds=15))
    # Schedule to run every 5 minutes thereafter
    scheduler.add_job(func=cache_comparison_data, args=[app], trigger="interval", minutes=5)
    scheduler.start()
    logging.info("Background scheduler started for caching.")
