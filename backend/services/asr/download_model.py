from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

from backend.services.asr.config import (
    DEFAULT_MODEL_DIR,
    DEFAULT_MODEL_ID,
    DEFAULT_SENSEVOICE_MODEL_DIR,
    DEFAULT_SENSEVOICE_MODEL_ID,
)


def download_model(model_id: str, model_dir: Path, source: str) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    if source == "modelscope":
        from modelscope import snapshot_download

        cache_dir = model_dir.parent / ".modelscope-cache"
        downloaded = Path(snapshot_download(model_id, cache_dir=str(cache_dir)))
        for source_path in downloaded.iterdir():
            destination = model_dir / source_path.name
            if destination.exists():
                if destination.is_dir():
                    shutil.rmtree(destination)
                else:
                    destination.unlink()
            shutil.move(str(source_path), destination)
        shutil.rmtree(cache_dir, ignore_errors=True)
    else:
        from huggingface_hub import snapshot_download

        snapshot_download(repo_id=model_id, local_dir=model_dir)
    print(f"Installed {model_id}: {model_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Moss ASR model files")
    parser.add_argument(
        "--engine",
        choices=("all", "qwen3-asr", "sensevoice"),
        default="all",
    )
    parser.add_argument("--qwen-model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--qwen-model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--sensevoice-model-id", default=DEFAULT_SENSEVOICE_MODEL_ID)
    parser.add_argument(
        "--sensevoice-model-dir",
        type=Path,
        default=DEFAULT_SENSEVOICE_MODEL_DIR,
    )
    parser.add_argument(
        "--source",
        choices=("modelscope", "huggingface"),
        default=os.getenv("MOSS_ASR_MODEL_SOURCE", "modelscope"),
    )
    args = parser.parse_args()
    if args.engine in {"all", "qwen3-asr"}:
        download_model(args.qwen_model_id, args.qwen_model_dir, args.source)
    if args.engine in {"all", "sensevoice"}:
        download_model(
            args.sensevoice_model_id,
            args.sensevoice_model_dir,
            args.source,
        )


if __name__ == "__main__":
    main()
