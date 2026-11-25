"""Make a compact snapshot of the official ECB historical ZIP without resampling."""
import csv, gzip, io, sys, zipfile
from pathlib import Path

currencies = ("USD","JPY","GBP","CHF","AUD","CAD","INR","NZD")
with zipfile.ZipFile(sys.argv[1]).open("eurofxref-hist.csv") as member:
    rows = list(csv.DictReader(io.TextIOWrapper(member, encoding="utf-8-sig")))
target = io.StringIO()
writer = csv.writer(target, lineterminator="\n")
writer.writerow(("Date", *currencies))
for row in reversed(rows):
    writer.writerow([row["Date"], *(row[k] if row[k] != "N/A" else "" for k in currencies)])
Path("assets/data/ecb-forex.bin").write_bytes(gzip.compress(target.getvalue().encode(), mtime=0))
print(len(rows), rows[-1]["Date"], rows[0]["Date"])
