from __future__ import annotations

import io
import os
import threading
import time

import pandas as pd
import requests


DEFAULT_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTyoi0wSxilxefwNilXyDFp6mp_QRs2L47W5WTy_oV5cjKftC-g_8lzVbst6wLRmyg1OXojPS-Qu6WU/"
    "pub?gid=1657026728&single=true&output=csv"
)

_cache_lock = threading.Lock()
_cache: tuple[float, pd.DataFrame] | None = None


class PortfolioDataError(RuntimeError):
    pass


def parse_portfolio_csv(content: bytes) -> pd.DataFrame:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "big5"):
        try:
            df = pd.read_csv(io.BytesIO(content), encoding=encoding)
            break
        except UnicodeDecodeError as exc:
            last_error = exc
    else:
        raise PortfolioDataError("無法辨識試算表的文字編碼。") from last_error

    df.columns = [str(column).strip() for column in df.columns]
    if "日期" not in df.columns or "總價值" not in df.columns:
        raise PortfolioDataError("試算表必須包含「日期」與「總價值」欄位。")

    dates = pd.to_datetime(df["日期"], errors="coerce")
    values = pd.to_numeric(
        df["總價值"].astype(str).str.replace(r"[$,\s]", "", regex=True),
        errors="coerce",
    )
    cleaned = pd.DataFrame({"Date": dates, "Value": values}).dropna()
    cleaned = cleaned.sort_values("Date").drop_duplicates("Date", keep="last").reset_index(drop=True)
    if cleaned.empty:
        raise PortfolioDataError("試算表沒有可使用的資產資料。")
    cleaned["Change"] = cleaned["Value"].diff().fillna(0)
    return cleaned


def fetch_portfolio_data(force: bool = False) -> pd.DataFrame:
    global _cache
    ttl = int(os.getenv("PORTFOLIO_CACHE_SECONDS", "300"))
    with _cache_lock:
        if not force and _cache and time.time() - _cache[0] < ttl:
            return _cache[1].copy()

    url = os.getenv("GOOGLE_SHEET_CSV_URL", DEFAULT_CSV_URL)
    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
        df = parse_portfolio_csv(response.content)
    except PortfolioDataError:
        raise
    except requests.RequestException as exc:
        raise PortfolioDataError("目前無法取得 Google 試算表資料，請稍後再試。") from exc

    with _cache_lock:
        _cache = (time.time(), df.copy())
    return df


def filter_date_range(
    df: pd.DataFrame,
    date_range: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    end = df["Date"].max()
    if date_range == "1Y":
        start = end - pd.DateOffset(years=1)
    elif date_range == "YTD":
        start = pd.Timestamp(year=end.year, month=1, day=1)
    elif date_range == "CUSTOM":
        if not start_date or not end_date:
            raise PortfolioDataError("自訂日期範圍需要開始與結束日期。")
        start = pd.to_datetime(start_date, errors="coerce")
        end = pd.to_datetime(end_date, errors="coerce")
        if pd.isna(start) or pd.isna(end) or start > end:
            raise PortfolioDataError("自訂日期範圍不正確。")
    else:
        return df.copy()

    filtered = df[(df["Date"] >= start) & (df["Date"] <= end)].copy()
    if filtered.empty:
        raise PortfolioDataError("選取的日期範圍沒有資料。")
    filtered["Change"] = filtered["Value"].diff().fillna(0)
    return filtered.reset_index(drop=True)
