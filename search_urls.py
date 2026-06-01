import re

so_path = r"c:\Projects\apps\Gradeway\decompiled_apk\arch_content\lib\arm64-v8a\libapp.so"

with open(so_path, "rb") as f:
    data = f.read()

# Find any HTTP or HTTPS URLs, or anything containing amazonaws.com
pattern = re.compile(b"https?://[a-zA-Z0-9_/\\-.#]+")
matches = pattern.findall(data)

s3_matches = []
for m in set(matches):
    s = m.decode(errors='ignore')
    if "amazonaws" in s or "gradeway" in s:
        s3_matches.append(s)

print("Found S3/GradeWay URLs:")
for u in sorted(s3_matches):
    print(u)
