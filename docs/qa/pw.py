import sys, json, pdfplumber
p = pdfplumber.open(sys.argv[1]).pages[0]
w = json.loads(sys.argv[2])
print([(x['text'], round(x['x0']), round(x['top'])) for x in p.extract_words() if x['text'] in w])
