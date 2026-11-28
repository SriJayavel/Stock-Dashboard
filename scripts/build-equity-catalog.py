"""Build the public listing snapshot from downloaded source files."""

import argparse
import csv
import json
import re
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend/public/equities/catalog.json"
SOURCES = {
    "US": ["United States", "USD", "SEC ticker directory", "https://www.sec.gov/files/company_tickers_exchange.json"],
    "IN": ["India", "INR", "NSE equity segment", "https://www.nseindia.com/market-data/securities-available-for-trading"],
    "JP": ["Japan", "JPY", "Japan Exchange Group", "https://www.jpx.co.jp/english/markets/statistics-equities/misc/01.html"],
    "TW": ["Taiwan", "TWD", "Taiwan Stock Exchange", "https://openapi.twse.com.tw/"],
}


def sec_rows(path):
    source = json.loads(path.read_text(encoding="utf-8-sig"))
    for row in source["data"]:
        record = dict(zip(source["fields"], row))
        if record["exchange"] in {"Nasdaq", "NYSE", "CBOE", "TXSE"}:
            yield record["ticker"], record["name"], "US", record["exchange"], ""


def nse_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, skipinitialspace=True):
            if row["SERIES"] in {"EQ", "BE", "BZ"}:
                yield row["SYMBOL"] + ".NS", row["NAME OF COMPANY"], "IN", "NSE", ""


def jpx_rows(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        records = iter(workbook.active.values)
        fields = next(records)
        for values in records:
            row = dict(zip(fields, values))
            section = str(row["Section/Products"])
            if section.startswith(("Prime Market", "Standard Market", "Growth Market")):
                sector = row.get("33 Sector(name)")
                yield f"{row['Local Code']}.T", row["Name (English)"], "JP", "Tokyo Stock Exchange", sector or ""
    finally:
        workbook.close()


def twse_rows(path):
    for row in json.loads(path.read_text(encoding="utf-8-sig")):
        ticker = row["公司代號"]
        if ticker.isdigit() and len(ticker) == 4:
            yield ticker + ".TW", row["公司名稱"], "TW", "TWSE", row["英文簡稱"] or ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for market in ("sec", "nse", "jpx", "twse"):
        parser.add_argument(f"--{market}", required=True, type=Path)
    parser.add_argument("--as-of", required=True, help="Source retrieval date in YYYY-MM-DD format")
    args = parser.parse_args()
    listings = {}
    for read, path in [(sec_rows, args.sec), (nse_rows, args.nse), (jpx_rows, args.jpx), (twse_rows, args.twse)]:
        rows = {}
        for symbol, name, market, exchange, search_extra in read(path):
            symbol = symbol.strip().upper()
            if name and re.fullmatch(r"[A-Z0-9][A-Z0-9.&-]{0,30}", symbol):
                rows[symbol] = [symbol, " ".join(name.split()), market, exchange, search_extra]
        if not rows:
            parser.error(f"No listed companies parsed from {path}")
        listings.update(rows)
        print(f"{next(iter(rows.values()))[2]} {len(rows):,}")
    data = {"retrieved": args.as_of, "markets": SOURCES, "listings": sorted(listings.values())}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(listings):,} listings written to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
