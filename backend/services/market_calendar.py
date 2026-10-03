"""
Mara Exchange Calendars & Market Session State Engine
Clean, extensible abstraction for exchange trading sessions, pre/post-market,
and holiday schedules.

Market Session States:
- OPEN: Regular market trading hours
- PRE_MARKET: Pre-market auction/order collection session
- POST_MARKET: Post-market closing auction or after-hours trading
- CLOSED: Outside all trading sessions (e.g. overnight, weekends)
- HOLIDAY: Official full-day exchange holiday
- HALTED: Emergency trading halt (circuit breaker or exchange-level pause)
- STALE: Data stopped updating during active market
- UNAVAILABLE: Exchange or asset calendar unknown
"""

import datetime
from zoneinfo import ZoneInfo
from typing import Dict, Any, Optional, Set


class ExchangeCalendar:
    """Base class for financial exchange trading session calendars."""
    
    def __init__(self, exchange_code: str, timezone_name: str, currency: str):
        self.exchange_code = exchange_code
        self.timezone_name = timezone_name
        self.tz = ZoneInfo(timezone_name)
        self.currency = currency

    def get_local_now(self) -> datetime.datetime:
        return datetime.datetime.now(self.tz)

    def is_holiday(self, dt: datetime.date) -> bool:
        return False

    def get_session_state(self, dt: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        raise NotImplementedError


class NSEExchangeCalendar(ExchangeCalendar):
    """
    National Stock Exchange of India (NSE) / BSE Calendar.
    Timezone: Asia/Kolkata (IST, UTC+05:30)
    Trading Sessions:
      - 09:00 - 09:15 IST: PRE_MARKET (Pre-open order matching)
      - 09:15 - 15:30 IST: OPEN (Normal market trading)
      - 15:40 - 16:00 IST: POST_MARKET (Closing session / post-market price discovery)
      - Outside hours: CLOSED
      - Weekends (Sat, Sun): CLOSED
      - Official exchange holidays: HOLIDAY
    """

    # Official NSE Trading Holidays (Format: YYYY-MM-DD)
    # Covering 2024, 2025, and 2026 official scheduled holidays
    HOLIDAYS: Set[str] = {
        # 2024
        "2024-01-22", "2024-01-26", "2024-03-08", "2024-03-25", "2024-03-29",
        "2024-04-11", "2024-04-17", "2024-05-01", "2024-05-20", "2024-06-17",
        "2024-07-17", "2024-08-15", "2024-10-02", "2024-11-01", "2024-11-15",
        "2024-12-25",
        # 2025
        "2025-01-26", "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10",
        "2025-04-14", "2025-04-18", "2025-05-01", "2025-06-07", "2025-08-15",
        "2025-08-27", "2025-10-02", "2025-10-21", "2025-10-22", "2025-11-05",
        "2025-12-25",
        # 2026
        "2026-01-26", "2026-02-17", "2026-03-04", "2026-03-20", "2026-04-03",
        "2026-04-14", "2026-05-01", "2026-05-28", "2026-08-15", "2026-09-04",
        "2026-10-02", "2026-10-20", "2026-11-08", "2026-11-24", "2026-12-25",
    }

    def __init__(self, is_bse: bool = False):
        super().__init__(
            exchange_code="BSE" if is_bse else "NSE",
            timezone_name="Asia/Kolkata",
            currency="INR"
        )

    def is_holiday(self, dt: datetime.date) -> bool:
        return dt.isoformat() in self.HOLIDAYS

    def get_session_state(self, dt: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        local_dt = dt or self.get_local_now()
        date_obj = local_dt.date()
        time_obj = local_dt.time()
        weekday = local_dt.weekday()  # 0=Monday, 6=Sunday

        if weekday >= 5:
            return {
                "session": "CLOSED",
                "reason": "Weekend",
                "exchange": self.exchange_code,
                "timezone": self.timezone_name,
                "currency": self.currency,
                "session_start": "09:15",
                "session_end": "15:30",
            }

        if self.is_holiday(date_obj):
            return {
                "session": "HOLIDAY",
                "reason": "Exchange Trading Holiday",
                "exchange": self.exchange_code,
                "timezone": self.timezone_name,
                "currency": self.currency,
                "session_start": "09:15",
                "session_end": "15:30",
            }

        # Session intervals (IST)
        if datetime.time(9, 0) <= time_obj < datetime.time(9, 15):
            session = "PRE_MARKET"
        elif datetime.time(9, 15) <= time_obj <= datetime.time(15, 30):
            session = "OPEN"
        elif datetime.time(15, 40) <= time_obj <= datetime.time(16, 0):
            session = "POST_MARKET"
        else:
            session = "CLOSED"

        return {
            "session": session,
            "reason": None if session == "OPEN" else "Outside Trading Hours",
            "exchange": self.exchange_code,
            "timezone": self.timezone_name,
            "currency": self.currency,
            "session_start": "09:15",
            "session_end": "15:30",
        }


class USExchangeCalendar(ExchangeCalendar):
    """
    US Equities Calendar (NYSE / NASDAQ).
    Timezone: America/New_York (ET)
    Trading Sessions:
      - 04:00 - 09:30 ET: PRE_MARKET (Pre-market trading session)
      - 09:30 - 16:00 ET: OPEN (Regular core trading session)
      - 16:00 - 20:00 ET: POST_MARKET (After-hours trading session)
      - Outside hours: CLOSED
      - Weekends (Sat, Sun): CLOSED
      - Official holidays: HOLIDAY
    """

    # Official US Market Holidays (Format: YYYY-MM-DD)
    HOLIDAYS: Set[str] = {
        # 2024
        "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
        "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
        # 2025
        "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
        "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
        # 2026
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
        "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    }

    def __init__(self, exchange_code: str = "US"):
        super().__init__(
            exchange_code=exchange_code,
            timezone_name="America/New_York",
            currency="USD"
        )

    def is_holiday(self, dt: datetime.date) -> bool:
        return dt.isoformat() in self.HOLIDAYS

    def get_session_state(self, dt: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        local_dt = dt or self.get_local_now()
        date_obj = local_dt.date()
        time_obj = local_dt.time()
        weekday = local_dt.weekday()

        if weekday >= 5:
            return {
                "session": "CLOSED",
                "reason": "Weekend",
                "exchange": self.exchange_code,
                "timezone": self.timezone_name,
                "currency": self.currency,
                "session_start": "09:30",
                "session_end": "16:00",
            }

        if self.is_holiday(date_obj):
            return {
                "session": "HOLIDAY",
                "reason": "Exchange Trading Holiday",
                "exchange": self.exchange_code,
                "timezone": self.timezone_name,
                "currency": self.currency,
                "session_start": "09:30",
                "session_end": "16:00",
            }

        if datetime.time(4, 0) <= time_obj < datetime.time(9, 30):
            session = "PRE_MARKET"
        elif datetime.time(9, 30) <= time_obj <= datetime.time(16, 0):
            session = "OPEN"
        elif datetime.time(16, 0) < time_obj <= datetime.time(20, 0):
            session = "POST_MARKET"
        else:
            session = "CLOSED"

        return {
            "session": session,
            "reason": None if session == "OPEN" else "Outside Core Hours",
            "exchange": self.exchange_code,
            "timezone": self.timezone_name,
            "currency": self.currency,
            "session_start": "09:30",
            "session_end": "16:00",
        }


class CryptoExchangeCalendar(ExchangeCalendar):
    """
    24/7 Cryptocurrency Markets.
    Timezone: UTC
    Sessions: Always OPEN (No holidays, no closing sessions).
    """

    def __init__(self, currency: str = "USD"):
        super().__init__(
            exchange_code="Crypto",
            timezone_name="UTC",
            currency=currency
        )

    def is_holiday(self, dt: datetime.date) -> bool:
        return False

    def get_session_state(self, dt: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        return {
            "session": "OPEN",
            "reason": None,
            "exchange": "Crypto",
            "timezone": "UTC",
            "currency": self.currency,
            "session_start": "00:00",
            "session_end": "23:59",
        }


class ForexExchangeCalendar(ExchangeCalendar):
    """
    Global Foreign Exchange (FX) Markets.
    Timezone: UTC
    Trading Sessions: Opens Sunday 21:00 UTC, Closes Friday 22:00 UTC.
    """

    def __init__(self, currency: str = "USD"):
        super().__init__(
            exchange_code="Forex",
            timezone_name="UTC",
            currency=currency
        )

    def get_session_state(self, dt: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        local_dt = dt or self.get_local_now()
        weekday = local_dt.weekday()
        hour = local_dt.hour

        # Closes Friday 22:00 UTC, Re-opens Sunday 21:00 UTC
        is_weekend_closed = (
            (weekday == 4 and hour >= 22) or
            (weekday == 5) or
            (weekday == 6 and hour < 21)
        )

        return {
            "session": "CLOSED" if is_weekend_closed else "OPEN",
            "reason": "Weekend FX Close" if is_weekend_closed else None,
            "exchange": "Forex",
            "timezone": "UTC",
            "currency": self.currency,
            "session_start": "Sun 21:00",
            "session_end": "Fri 22:00",
        }


# Exchange Calendar Registry
_nse_cal = NSEExchangeCalendar(is_bse=False)
_bse_cal = NSEExchangeCalendar(is_bse=True)
_us_cal = USExchangeCalendar(exchange_code="US")
_crypto_usd_cal = CryptoExchangeCalendar(currency="USD")
_crypto_inr_cal = CryptoExchangeCalendar(currency="INR")
_forex_cal = ForexExchangeCalendar(currency="USD")


def get_calendar_for_symbol(symbol: str) -> ExchangeCalendar:
    """Resolve the appropriate exchange calendar for any given ticker."""
    sym = (symbol or "").strip().upper()
    if "-USD" in sym:
        return _crypto_usd_cal
    if "-INR" in sym:
        return _crypto_inr_cal
    if "=X" in sym:
        return _forex_cal
    if sym.endswith(".BO") or sym == "^BSESN":
        return _bse_cal
    if sym.endswith(".NS") or sym in ["^NSEI", "^NSEBANK"]:
        return _nse_cal
    return _us_cal
