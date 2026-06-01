import urllib.request

url = "https://gradeway-production.s3.amazonaws.com/data/districts.csv"
output = "districts.csv"

try:
    print(f"Fetching {url}...")
    urllib.request.urlretrieve(url, output)
    print(f"Saved to {output}")
    
    with open(output, "r", encoding="utf-8") as f:
        lines = f.readlines()
        print(f"Read {len(lines)} lines from districts.csv")
        for line in lines[:10]:
            print(line.strip())
except Exception as e:
    print("Error fetching districts.csv:", e)
