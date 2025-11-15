from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Iterable, Sequence


class KafkaNotConfiguredError(RuntimeError):
	"""Raised when Kafka broker URL is missing in service settings."""


class KafkaDependencyError(RuntimeError):
	"""Raised when aiokafka library is not available."""


def _import_aiokafka() -> tuple[type, type]:
	try:
		from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
	except ImportError as exc:  # pragma: no cover - defensive
		raise KafkaDependencyError(
			"aiokafka is required for Kafka integration. "
			"Install it by adding 'aiokafka' to your requirements."
		) from exc
	return AIOKafkaConsumer, AIOKafkaProducer


def _get_bootstrap_url(settings: object) -> str:
	broker = getattr(settings, "kafka_broker_url", None)
	if not broker:
		raise KafkaNotConfiguredError("Kafka is not configured (kafka_broker_url is empty).")
	return broker


@asynccontextmanager
async def kafka_producer(settings: object, **kwargs) -> AsyncIterator[object]:
	"""
	Async context manager that yields an ``AIOKafkaProducer`` configured from service settings.

	Usage:
	```
	from common.kafka import kafka_producer

	@router.post("/emit")
	async def emit(settings: Settings = Depends(get_settings)):
	    async with kafka_producer(settings) as producer:
	        await producer.send_and_wait("topic", b"payload")
	```
	"""

	consumer_cls, producer_cls = _import_aiokafka()
	bootstrap = _get_bootstrap_url(settings)
	producer = producer_cls(bootstrap_servers=bootstrap, **kwargs)
	await producer.start()
	try:
		yield producer
	finally:
		await producer.stop()


@asynccontextmanager
async def kafka_consumer(
	settings: object,
	*topics: str,
	group_id: str | None = None,
	**kwargs,
) -> AsyncIterator[object]:
	"""
	Async context manager that yields an ``AIOKafkaConsumer`` subscribed to the provided topics.

	Callers are responsible for iterating over the consumer and committing offsets if нужно.
	"""

	consumer_cls, _ = _import_aiokafka()
	bootstrap = _get_bootstrap_url(settings)
	if not topics:
		raise ValueError("At least one topic is required to create a Kafka consumer.")

	consumer = consumer_cls(*topics, bootstrap_servers=bootstrap, group_id=group_id, **kwargs)
	await consumer.start()
	try:
		yield consumer
	finally:
		await consumer.stop()

