from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import imageio_ffmpeg
import matplotlib

matplotlib.use("Agg")

import matplotlib.dates as mdates
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.animation import FFMpegWriter, FuncAnimation


def _configure_font() -> None:
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            fm.fontManager.addfont(path)
            plt.rcParams["font.family"] = fm.FontProperties(fname=path).get_name()
            break
    plt.rcParams["axes.unicode_minus"] = False


def render_growth_video(
    df: pd.DataFrame,
    output_path: Path,
    fps: int = 7,
    hold_seconds: int = 11,
    resolution: str = "720",
    theme: str = "light",
    progress: Callable[[int, str], None] | None = None,
) -> None:
    _configure_font()
    plt.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()

    width, height = ((1080, 1920) if resolution == "1080" else (720, 1280))
    dpi = 100
    dark = theme == "dark"
    background = "#0b1220" if dark else "#f7f9fc"
    surface = "#111c30" if dark else "#ffffff"
    foreground = "#f8fafc" if dark else "#162033"
    muted = "#94a3b8" if dark else "#64748b"
    grid = "#273449" if dark else "#e5eaf1"
    line_color = "#3478f6"

    fig, ax = plt.subplots(figsize=(width / dpi, height / dpi), dpi=dpi)
    fig.patch.set_facecolor(background)
    ax.set_facecolor(surface)
    fig.subplots_adjust(left=0.15, right=0.93, top=0.83, bottom=0.23)

    line, = ax.plot([], [], lw=4, color=line_color, solid_capstyle="round")
    point, = ax.plot([], [], "o", color="#ef4444", markersize=9)
    date_display = fig.text(0.12, 0.145, "", fontsize=15, color=muted, weight="bold")
    value_display = fig.text(0.12, 0.105, "", fontsize=24, color=foreground, weight="bold")
    change_display = fig.text(0.12, 0.07, "", fontsize=16, weight="bold")

    ax.set_title("資產成長紀錄", fontsize=23, fontweight="bold", color=foreground, pad=28, loc="left")
    ax.set_xlabel("日期", fontsize=13, color=muted, labelpad=18)
    ax.set_ylabel("資產價值（美元）", fontsize=13, color=muted, labelpad=16)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax.tick_params(colors=muted, labelsize=11)
    ax.grid(color=grid, linewidth=0.8)
    for spine in ax.spines.values():
        spine.set_visible(False)

    x_all = df["Date"]
    y_all = df["Value"]
    x_pad = max((x_all.max() - x_all.min()) * 0.03, pd.Timedelta(days=1))
    y_min, y_max = float(y_all.min()), float(y_all.max())
    y_range = y_max - y_min or max(abs(y_min) * 0.1, 1)
    ax.set_xlim(x_all.min() - x_pad, x_all.max() + x_pad)
    ax.set_ylim(y_min - y_range * 0.18, y_max + y_range * 0.18)
    fig.autofmt_xdate(rotation=35, ha="right")

    extra_frames = fps * hold_seconds
    total_frames = len(df) + extra_frames

    def update(frame: int):
        current_idx = min(frame, len(df) - 1)
        current = df.iloc[: current_idx + 1]
        date = current["Date"].iloc[-1]
        value = float(current["Value"].iloc[-1])
        change = float(df["Change"].iloc[current_idx])
        line.set_data(current["Date"], current["Value"])
        point.set_data([date], [value])
        date_display.set_text(date.strftime("%Y 年 %m 月 %d 日"))
        value_display.set_text(f"${value:,.2f}")
        if change > 0:
            change_display.set_text(f"+${change:,.2f}")
            change_display.set_color("#ef4444")
        elif change < 0:
            change_display.set_text(f"-${abs(change):,.2f}")
            change_display.set_color("#16a34a")
        else:
            change_display.set_text("$0.00")
            change_display.set_color(muted)
        if progress and (frame % max(1, total_frames // 100) == 0 or frame == total_frames - 1):
            progress(min(94, 10 + int((frame + 1) / total_frames * 84)), "正在繪製影片畫面")
        return line, point, date_display, value_display, change_display

    animation = FuncAnimation(fig, update, frames=total_frames, interval=1000 / fps, blit=False)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = FFMpegWriter(fps=fps, bitrate=3500, metadata={"title": "資產成長紀錄"})
    try:
        animation.save(str(output_path), writer=writer, dpi=dpi)
    finally:
        plt.close(fig)
