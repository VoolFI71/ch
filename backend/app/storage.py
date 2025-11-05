from __future__ import annotations

from datetime import timedelta
from functools import lru_cache
from typing import BinaryIO, Optional

from minio import Minio
from minio.error import S3Error

from .config import get_settings


class StorageNotConfiguredError(RuntimeError):
    """Raised when object storage credentials are missing."""


class StorageBucketError(RuntimeError):
    """Raised when working with S3 buckets fails."""


class StorageService:
    """Thin wrapper around MinIO client with convenience helpers."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.s3_endpoint or not settings.s3_access_key or not settings.s3_secret_key:
            raise StorageNotConfiguredError("S3 storage is not configured")

        self._client = Minio(
            settings.s3_endpoint,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            secure=settings.s3_use_ssl,
            region=settings.s3_region,
        )
        self._default_expire = timedelta(seconds=settings.s3_presign_expire_seconds or 3600)

    @property
    def client(self) -> Minio:
        return self._client

    def ensure_bucket(self, bucket_name: str) -> None:
        if not bucket_name:
            raise StorageBucketError("Bucket name must be provided")
        try:
            if not self._client.bucket_exists(bucket_name):
                self._client.make_bucket(bucket_name)
        except S3Error as exc:
            raise StorageBucketError(f"Unable to ensure bucket '{bucket_name}': {exc}") from exc

    def presigned_upload_url(
        self,
        bucket: str,
        object_name: str,
        expires: Optional[timedelta] = None,
    ) -> str:
        expiration = expires or self._default_expire
        try:
            return self._client.presigned_put_object(bucket, object_name, expires=expiration)
        except S3Error as exc:
            raise RuntimeError(f"Failed to create upload URL for {object_name}: {exc}") from exc

    def presigned_download_url(
        self,
        bucket: str,
        object_name: str,
        expires: Optional[timedelta] = None,
    ) -> str:
        expiration = expires or self._default_expire
        try:
            return self._client.presigned_get_object(bucket, object_name, expires=expiration)
        except S3Error as exc:
            raise RuntimeError(f"Failed to create download URL for {object_name}: {exc}") from exc

    def upload_stream(
        self,
        bucket: str,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: Optional[str] = None,
    ) -> None:
        try:
            self._client.put_object(
                bucket,
                object_name,
                data,
                length,
                content_type=content_type,
            )
        except S3Error as exc:
            raise RuntimeError(f"Failed to upload object {object_name}: {exc}") from exc


@lru_cache(maxsize=1)
def get_storage_service() -> StorageService:
    """Return a cached storage service instance or raise if not configured."""

    return StorageService()


