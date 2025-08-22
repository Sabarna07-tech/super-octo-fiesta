from pyspark.sql import SparkSession, functions as F, types as T

spark = (
    SparkSession.builder.appName("wagon-detections-stream")
    .config("spark.sql.streaming.schemaInference", "true")
    .getOrCreate()
)

raw = (
    spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "kafka:9092")
    .option("subscribe", "wagon.detections.v1")
    .option("startingOffsets", "latest")
    .load()
)

events = (
    raw.selectExpr("CAST(value AS STRING) as json")
    .select(F.from_json("json", T.StringType()).alias("raw_json"))
    .select(
        F.from_json(
            "raw_json",
            T.SchemaOfJson(
                """
            {"event_version":1,"job_id":"", "frame_s3_uri":"", "wagon_id":"",
            "timestamp":"", "model_version":"", "detections":[], "inference_ms":0}
            """
            ),
        ).alias("e")
    )
    .select("e.*")
    .withColumn("ts", F.to_timestamp("timestamp"))
    .withWatermark("ts", "10 minutes")
)

# Bronze table
(
    events.writeStream.format("delta")
    .option(
        "checkpointLocation",
        "s3a://<bucket>/delta/bronze/_checkpoints/detections",
    )
    .outputMode("append")
    .start("s3a://<bucket>/delta/bronze/detections")
)

# Silver table
flat = (
    events.withColumn("det", F.explode("detections"))
    .select(
        "job_id",
        "wagon_id",
        "ts",
        "model_version",
        "inference_ms",
        F.col("det.label").alias("label"),
        F.col("det.confidence").alias("confidence"),
        F.col("det.bbox").alias("bbox"),
        F.col("det.severity").alias("severity"),
    )
)

(
    flat.writeStream.format("delta")
    .option(
        "checkpointLocation",
        "s3a://<bucket>/delta/silver/_checkpoints/detections",
    )
    .partitionBy("wagon_id")
    .outputMode("append")
    .start("s3a://<bucket>/delta/silver/detections")
)

spark.streams.awaitAnyTermination()
