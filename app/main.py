from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.services.portfolio import PortfolioDataError, fetch_portfolio_data, filter_date_range
from app.video import render_growth_video


app = FastAPI(title="資產視界", docs_url=None, redoc_url=None)
VIDEO_DIR = Path("/tmp/asset-vision-videos")
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


class VideoRequest(BaseModel):
    date_range: str = Field(default="ALL", pattern="^(ALL|1Y|YTD|CUSTOM)$")
    start_date: str | None = None
    end_date: str | None = None
    fps: int = Field(default=7, ge=5, le=10)
    hold_seconds: int = Field(default=11, ge=3, le=15)
    resolution: str = Field(default="720", pattern="^(720|1080)$")
    theme: str = Field(default="light", pattern="^(light|dark)$")


def _serialize(df):
    return [
        {"date": row.Date.strftime("%Y-%m-%d"), "value": round(float(row.Value), 2)}
        for row in df.itertuples()
    ]


@app.get("/api/portfolio")
def portfolio(force: bool = False):
    try:
        df = fetch_portfolio_data(force=force)
    except PortfolioDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "data": _serialize(df),
        "count": len(df),
        "first_date": df["Date"].min().strftime("%Y-%m-%d"),
        "last_date": df["Date"].max().strftime("%Y-%m-%d"),
        "latest_value": round(float(df["Value"].iloc[-1]), 2),
    }


def _run_video(job_id: str, request: VideoRequest) -> None:
    def update(progress: int, message: str) -> None:
        with jobs_lock:
            jobs[job_id].update(progress=progress, message=message, updated_at=time.time())

    try:
        update(3, "正在取得 Google 試算表資料")
        df = fetch_portfolio_data()
        update(7, "正在檢查資料格式")
        df = filter_date_range(df, request.date_range, request.start_date, request.end_date)
        output = VIDEO_DIR / f"資產成長紀錄-{job_id}.mp4"
        render_growth_video(
            df,
            output,
            fps=request.fps,
            hold_seconds=request.hold_seconds,
            resolution=request.resolution,
            theme=request.theme,
            progress=update,
        )
        update(98, "正在完成 MP4 編碼")
        with jobs_lock:
            jobs[job_id].update(status="completed", progress=100, message="影片已完成", path=str(output))
    except Exception as exc:
        with jobs_lock:
            jobs[job_id].update(status="failed", message=str(exc), progress=0)


@app.post("/api/videos", status_code=202)
def create_video(request: VideoRequest):
    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {
            "status": "processing",
            "progress": 0,
            "message": "準備產生影片",
            "created_at": time.time(),
            "updated_at": time.time(),
        }
    threading.Thread(target=_run_video, args=(job_id, request), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/videos/{job_id}")
def video_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="找不到這項影片任務。")
        return {key: value for key, value in job.items() if key != "path"}


@app.get("/api/videos/{job_id}/download")
def download_video(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "completed" or not Path(job["path"]).exists():
        raise HTTPException(status_code=404, detail="影片尚未完成或已經過期。")
    return FileResponse(
        job["path"],
        media_type="video/mp4",
        filename="asset-growth.mp4",
        headers={"Cache-Control": "no-store", "Accept-Ranges": "bytes"},
    )


@app.get("/api/videos/{job_id}/stream")
def stream_video(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "completed" or not Path(job["path"]).exists():
        raise HTTPException(status_code=404, detail="影片尚未完成或已經過期。")
    return FileResponse(
        job["path"],
        media_type="video/mp4",
        headers={"Cache-Control": "no-store", "Accept-Ranges": "bytes"},
    )


app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
