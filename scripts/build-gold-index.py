"""Index pinned CC BY 4.0 source by month without copying its full ZIP into Ledger."""
import argparse, base64, bisect, gzip, hashlib, json, struct, subprocess, tempfile, zipfile
from pathlib import Path

SHA256 = "ef24df726a5bf132f2e481bbb2b68a0a2fc446399a4129607ada50f1252dc2c8"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("--output", type=Path, default=Path("assets/data/gold-index"))
args = parser.parse_args()
with args.archive.open("rb") as f:
    assert hashlib.file_digest(f, "sha256").hexdigest() == SHA256
    f.seek(0)
    _, _, flags, method, _, _, _, csize, _, name, extra = struct.unpack("<4s5H3I2H", f.read(30))
    assert flags == 0 and method == 8
    assert f.read(name) == b"xauusd_m1.csv"
    offset = 30 + name + extra

with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    subprocess.run(["cc", "-O2", "-o", str(temp/"index"), str(Path(__file__).with_name("gold-deflate-index.c")), "-lz"], check=True)
    subprocess.run([temp/"index", args.archive, temp/"points", str(offset)], check=True)
    points = [(0,0,0,b"")]
    with (temp/"points").open("rb") as f:
        while chunk := f.read(16):
            compressed, plain, bits, length = struct.unpack("=IIII", chunk)
            dictionary = f.read(length)
            assert len(dictionary) == length
            points.append((plain, compressed, bits, dictionary))

months = {}
with zipfile.ZipFile(args.archive).open("xauusd_m1.csv") as f:
    pos = len(f.readline())
    for line in f:
        key = line[:7].decode("ascii")
        m = months.setdefault(key, {"from":pos,"to":pos,"rows":0,"hash":hashlib.sha256()})
        pos += len(line)
        m["to"] = pos
        m["rows"] += 1
        m["hash"].update(line)
assert sum(m["rows"] for m in months.values()) == 2032041
plain_offsets = [p[0] for p in points]
years = {}
for key, bounds in months.items():
    start = points[bisect.bisect_right(plain_offsets, bounds["from"])-1]
    end = points[bisect.bisect_left(plain_offsets, bounds["to"])]
    dictionary = start[3]
    data = {
        "startBit":(offset+start[1])*8-start[2],
        "endBit":(offset+end[1])*8-end[2],
        "startRowOffset":bounds["from"]-start[0],
        "endRowOffset":bounds["to"]-start[0],
        "inflateSize":end[0]-start[0],
        "zipFinal":end[0] == pos,
        "rows":bounds["rows"],
        "sha256":bounds["hash"].hexdigest(),
        "dict":base64.b64encode(dictionary).decode(),
    }
    assert 0 < data["endBit"]-data["startBit"] <= 8*1024*1024
    years.setdefault(key[:4], {})[key] = data

args.output.mkdir(parents=True, exist_ok=True)
for year, index in years.items():
    out = args.output / (year + ".bin")
    out.write_bytes(gzip.compress(json.dumps(index, separators=(",",":")).encode(),mtime=0))
    print(year, len(index), out.stat().st_size)
