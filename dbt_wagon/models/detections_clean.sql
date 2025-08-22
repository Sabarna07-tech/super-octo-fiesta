select job_id,
       wagon_id,
       ts,
       model_version,
       inference_ms,
       label,
       confidence,
       bbox,
       severity
from delta.`s3a://<bucket>/delta/silver/detections`
where confidence >= 0.5
