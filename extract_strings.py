import re

so_path = r"c:\Projects\apps\Gradeway\decompiled_apk\arch_content\lib\arm64-v8a\libapp.so"
output_path = r"c:\Projects\apps\NewGradeWay\extracted_strings.txt"

print(f"Reading {so_path}...")
with open(so_path, "rb") as f:
    data = f.read()

print("Extracting strings...")
# Find printable ASCII sequences of length 4 or more
pattern = re.compile(b"[a-zA-Z0-9_/\\-.# ]{4,100}")
strings = []
for m in pattern.finditer(data):
    try:
        s = m.group(0).decode("ascii")
        strings.append(s)
    except:
        pass

print(f"Extracted {len(strings)} strings. Filtering for GPA keywords...")

# Filter for interesting keywords
keywords = ["gpa", "transcript", "scale", "weighted", "unweighted", "points", "grade", "round", "rock", "rrisd"]
matching = []
for s in strings:
    s_lower = s.lower()
    if any(k in s_lower for k in keywords):
        matching.append(s)

# De-duplicate
matching = sorted(list(set(matching)))

print(f"Found {len(matching)} matching strings. Writing to {output_path}...")
with open(output_path, "w", encoding="utf-8") as f:
    for s in matching:
        f.write(s + "\n")

print("Done!")
