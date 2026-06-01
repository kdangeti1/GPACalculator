so_path = r"c:\Projects\apps\Gradeway\decompiled_apk\arch_content\lib\arm64-v8a\libapp.so"

with open(so_path, "rb") as f:
    data = f.read()

target = b"RoundRockGpaSettingsConverter"
idx = data.find(target)

if idx != -1:
    print(f"Found '{target.decode()}' at {idx}")
    
    # Dump 1000 bytes before and 3000 bytes after
    start = max(0, idx - 1000)
    end = min(len(data), idx + 3000)
    window = data[start:end]
    
    # Write hex and printable to a text file
    output_path = "gpa_binary_dump.txt"
    with open(output_path, "w", encoding="utf-8") as f:
        for offset in range(0, len(window), 16):
            chunk = window[offset:offset+16]
            hex_str = " ".join(f"{b:02x}" for b in chunk)
            hex_str = hex_str.ljust(48)
            
            print_str = "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk)
            
            f.write(f"{(start + offset):08x}:  {hex_str}  |{print_str}|\n")
    print(f"Wrote dump to {output_path}")
else:
    print(f"Target not found")
