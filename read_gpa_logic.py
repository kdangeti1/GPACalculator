so_path = r"c:\Projects\apps\Gradeway\decompiled_apk\arch_content\lib\arm64-v8a\libapp.so"

with open(so_path, "rb") as f:
    data = f.read()

# Search for "RoundRockGpaSettingsConverter"
target = b"RoundRockGpaSettingsConverter"
idx = data.find(target)

if idx != -1:
    print(f"Found '{target.decode()}' at offset {idx}")
    
    # Let's extract 2000 bytes before and after the match
    start = max(0, idx - 1000)
    end = min(len(data), idx + 1000)
    surrounding = data[start:end]
    
    # Print printable characters
    print("\n--- Surrounding printable characters ---")
    printable = []
    for byte in surrounding:
        if 32 <= byte <= 126:
            printable.append(chr(byte))
        else:
            printable.append(".")
    
    # Print in chunks of 80 characters
    printable_str = "".join(printable)
    for i in range(0, len(printable_str), 80):
        print(printable_str[i:i+80])
else:
    print(f"Could not find '{target.decode()}' in {so_path}")
