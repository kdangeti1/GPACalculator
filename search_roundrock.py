import re

so_path = r"c:\Projects\apps\Gradeway\decompiled_apk\arch_content\lib\arm64-v8a\libapp.so"

with open(so_path, "rb") as f:
    data = f.read()

# Find any ASCII strings matching keywords
pattern = re.compile(b"RoundRock[a-zA-Z0-9_]*")
matches = pattern.findall(data)

print("Found RoundRock matches:", [m.decode() for m in set(matches)])

# Search for "roundrockisd"
pattern2 = re.compile(b"[a-zA-Z0-9_./]*roundrock[a-zA-Z0-9_./]*")
matches2 = pattern2.findall(data)
print("Found roundrock matches:", [m.decode() for m in set(matches2)])
