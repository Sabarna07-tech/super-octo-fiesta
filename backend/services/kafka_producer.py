from confluent_kafka import Producer
import json
import os

producer = Producer({"bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "kafka:9092")})


def publish_detection(event: dict, topic: str = "wagon.detections.v1") -> None:
    """Publish a detection event to the configured Kafka topic."""
    producer.produce(topic, json.dumps(event).encode("utf-8"))
    producer.flush()
