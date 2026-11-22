"""Calculate reference series from closes supplied as JSON on standard input."""
import json
import sys

import pandas as pd


closes = pd.Series(json.load(sys.stdin), dtype="float64")
rolling = closes.rolling(20)
middle = rolling.mean()
deviation = rolling.std(ddof=1)
delta = closes.diff()
gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
ema12 = closes.ewm(span=12, adjust=False, min_periods=12).mean()
ema26 = closes.ewm(span=26, adjust=False, min_periods=26).mean()
macd = ema12 - ema26
result = pd.DataFrame({
    "sma": middle,
    "ema": ema12,
    "upper": middle + 2 * deviation,
    "lower": middle - 2 * deviation,
    "rsi": (100 - 100 / (1 + gain / loss)).mask((loss == 0) & gain.notna(), 100),
    "macd": macd,
})
print(json.dumps({"pandas": pd.__version__, "values": json.loads(result.to_json(orient="records", double_precision=15))}))
