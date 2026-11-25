"""Convert the official World Bank monthly XLSX to the public chart data asset."""
import json, math, re, sys
from pathlib import Path
from datetime import date
from openpyxl import load_workbook

COLUMNS = {
    "XAUUSD": "Gold", "XAGUSD": "Silver", "PLATINUM": "Platinum",
    "COPPER": "Copper", "USOIL": "Crude oil, WTI", "UKOIL": "Crude oil, Brent",
    "NATGAS": "Natural gas, US", "MAIZE": "Maize", "WHEATSRW": "Wheat, US SRW",
    "SOYBEANSPOT": "Soybeans", "COCOA": "Cocoa", "COFFEE": "Coffee, Arabica",
    "ALUMINUM": "Aluminum", "NICKEL": "Nickel", "ZINC": "Zinc",
}
def generate(path):
    book = load_workbook(path, read_only=True, data_only=True)
    sheet = book["Monthly Prices"]
    source = []
    last = ""
    for cells in sheet.iter_rows(max_col=73, values_only=True):
        value = cells[0]
        if value is None and "Gold" in cells:
            indexes = {symbol: cells.index(col) for symbol, col in COLUMNS.items()}
            prices = {symbol: [] for symbol in indexes}
        if isinstance(value, str) and re.fullmatch(r"\d{4}M\d{2}", value):
            year, month = value.split("M")
            stamp = date(int(year), int(month), 1).isoformat()[:7]
            if stamp <= last:
                raise ValueError("Workbook includes duplicate or out-of-order month " + stamp)
            last = stamp
            source.append(stamp)
            for symbol, col in indexes.items():
                v = cells[col]
                prices[symbol].append(round(v, 6) if isinstance(v, (int, float)) and math.isfinite(v) else None)
    if len(source) < 700 or any(sum(v is not None for v in p) < 100 for p in prices.values()):
        raise ValueError("Unexpectedly incomplete monthly workbook")
    return {"months":source,"prices":prices}
if __name__ == "__main__":
    target = Path(sys.argv[2] if len(sys.argv)>2 else "assets/data/pink-sheet-monthly.json")
    target.write_text(json.dumps(generate(sys.argv[1]), separators=(",", ":"))+"\n", encoding="utf-8")
