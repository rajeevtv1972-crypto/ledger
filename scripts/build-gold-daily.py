"""Aggregate the pinned Sepaul Research archive into UTC-day OHLC and tick counts."""
import csv, gzip, io, sys, zipfile
from decimal import Decimal
from pathlib import Path

with zipfile.ZipFile(sys.argv[1]).open("xauusd_m1.csv") as member:
    days = {}
    for row in csv.DictReader(io.TextIOWrapper(member)):
        day = row["time"][:10]
        o,h,l,c = (Decimal(row[k]) for k in ("open","high","low","close"))
        ticks = int(row["tick_volume"])
        a = days.get(day)
        days[day] = [a[0],max(a[1],h),min(a[2],l),c,a[4]+ticks] if a else [o,h,l,c,ticks]
out = io.StringIO()
w=csv.writer(out,lineterminator="\n")
w.writerow(("time","open","high","low","close","tick_volume"))
w.writerows([day,*data] for day,data in days.items())
Path("assets/data/gold-daily.bin").write_bytes(gzip.compress(out.getvalue().encode(),mtime=0))
print(len(days),next(iter(days)),next(reversed(days)))
