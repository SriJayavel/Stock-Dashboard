"""
Direct NSE India API Fetcher with Session Handshake:
NSE requires an initial homepage visit to acquire valid session cookies and headers.
All calls are wrapped in safe try/except blocks to ensure fallback to yfinance on failure.
"""

import time
import logging
import requests
from typing import Optional, Dict

logger = logging.getLogger("nse_fetcher")


class NSEFetcher:
    def __init__(self):
        self.session = requests.Session()
        self._last_handshake = 0
        self._cookie_ttl = 300  # Refresh session cookies every 5 mins
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://www.nseindia.com/",
            "Connection": "keep-alive",
        }
        self.session.headers.update(self.headers)

    def _handshake(self) -> bool:
        """Visit homepage to initialize session cookies."""
        now = time.time()
        if now - self._last_handshake < self._cookie_ttl and len(self.session.cookies) > 0:
            return True

        try:
            # Keep synchronous overview requests within a small upstream budget.
            res = self.session.get("https://www.nseindia.com", timeout=(1, 2))
            if res.status_code == 200:
                self._last_handshake = now
                logger.info("NSE session handshake initialized successfully.")
                return True
        except Exception as e:
            logger.warning(f"NSE handshake failed: {e}")
        return False

    def get_index_quote(self, index_name: str = "NIFTY 50") -> Optional[dict]:
        """Fetch live index metrics for Nifty 50 or Bank Nifty directly from NSE."""
        if not self._handshake():
            return None

        url = "https://www.nseindia.com/api/allIndices"
        try:
            api_headers = dict(self.headers)
            api_headers["Accept"] = "application/json, text/plain, */*"
            res = self.session.get(url, headers=api_headers, timeout=(1, 2))
            if res.status_code == 200:
                data = res.json()
                for idx_item in data.get("data", []):
                    if idx_item.get("index") == index_name or idx_item.get("indexSymbol") == index_name:
                        return {
                            "symbol": "^NSEI" if "NIFTY 50" in index_name else "^NSEBANK",
                            "name": idx_item.get("index", index_name),
                            "price": float(idx_item.get("last", 0)),
                            "change": float(idx_item.get("variation", 0)),
                            "change_pct": float(idx_item.get("percentChange", 0)),
                            "open": float(idx_item.get("open", 0)),
                            "high": float(idx_item.get("high", 0)),
                            "low": float(idx_item.get("low", 0)),
                            "prev_close": float(idx_item.get("previousClose", 0)),
                        }
        except Exception as e:
            logger.warning(f"NSE index quote fetch failed for {index_name}: {e}")
        return None

    def get_equity_quote(self, symbol: str) -> Optional[dict]:
        """Fetch live quote for an Indian stock (e.g. RELIANCE, TCS) directly from NSE."""
        clean_sym = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
        if not self._handshake():
            return None

        url = f"https://www.nseindia.com/api/quote-equity?symbol={clean_sym}"
        try:
            api_headers = dict(self.headers)
            api_headers["Accept"] = "application/json, text/plain, */*"
            res = self.session.get(url, headers=api_headers, timeout=(1, 2))
            if res.status_code == 200:
                data = res.json()
                price_info = data.get("priceInfo", {})
                info = data.get("info", {})
                sec_info = data.get("securityInfo", {})
                return {
                    "symbol": f"{clean_sym}.NS",
                    "name": info.get("companyName", clean_sym),
                    "current_price": float(price_info.get("lastPrice", 0)),
                    "change": float(price_info.get("change", 0)),
                    "change_pct": float(price_info.get("pChange", 0)),
                    "prev_close": float(price_info.get("previousClose", 0)),
                    "open": float(price_info.get("open", 0)),
                    "high": float(price_info.get("intraDayHighLow", {}).get("max", 0)),
                    "low": float(price_info.get("intraDayHighLow", {}).get("min", 0)),
                    "high_52w": float(price_info.get("weekHighLow", {}).get("max", 0)),
                    "low_52w": float(price_info.get("weekHighLow", {}).get("min", 0)),
                    "currency": "INR",
                    "currency_symbol": "₹",
                    "industry": sec_info.get("sectoralIndex", "NSE Equity"),
                    "source": "NSE Direct",
                }
        except Exception as e:
            logger.debug(f"NSE equity quote fetch failed for {clean_sym}: {e}")
        return None


nse_client = NSEFetcher()
