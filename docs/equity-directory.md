# Stock directory

Markets and Discover share a static listing snapshot. Search, listing-market filters, sorting, and 25-row pagination run in the browser. Global symbol search also uses the snapshot. The existing reference directory supplies selected listings in additional markets.

The snapshot contains identifiers and company names. It does not contain quotes. Live mode checks the existing cache-only batch endpoint when the user selects **Check cached quotes**. Each request is limited to the current page. Demo mode uses synthetic quotes and history for the existing demo symbols. Other demo rows show **Listing only**.

## Source files

| Listing market | Input | Included coverage |
| --- | --- | --- |
| United States | [SEC ticker and exchange file](https://www.sec.gov/files/company_tickers_exchange.json) | Records associated with Nasdaq, NYSE, CBOE, or TXSE |
| India | [NSE securities available for trading](https://www.nseindia.com/market-data/securities-available-for-trading) | Equity-segment CSV, series EQ, BE, and BZ |
| Japan | [JPX list of TSE-listed issues](https://www.jpx.co.jp/english/markets/statistics-equities/misc/01.html) | English workbook, Prime, Standard, and Growth market company listings |
| Taiwan | [TWSE listed-company data](https://openapi.twse.com.tw/v1/opendata/t187ap03_L) | Four-digit company listings, with English short names when available |

Coverage reflects the downloaded snapshots. A company can have multiple listings. Other exchanges have selected entries from MARA’s reference directory.

## Refresh the snapshot

Download the four inputs to a local folder. Use Python with `openpyxl` for the JPX workbook. The importer reads local files and writes `frontend/public/equities/catalog.json`.

```powershell
python scripts/build-equity-catalog.py --sec company_tickers_exchange.json --nse EQUITY_L.csv --jpx data_e.xlsx --twse twse.json --as-of YYYY-MM-DD
```

Use the retrieval date in `--as-of`. Review the counts printed per source and run the demo browser tests before releasing an updated snapshot.
