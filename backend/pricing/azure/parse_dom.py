import re

with open('/tmp/calc_dom.html', 'r', encoding='utf-8') as f:
    text = f.read()

matches = re.findall(r'[a-zA-Z0-9_\-\.\/]*share[a-zA-Z0-9_\-\.\/]*', text, re.IGNORECASE)
print('Share mentions in DOM:', len(set(matches)))
for m in list(set(matches))[:15]:
    print(' ', m)

# Search for any button IDs or classes
buttons = re.findall(r'<button[^>]*>.*?</button>', text, re.DOTALL | re.IGNORECASE)
print('Total buttons:', len(buttons))
for b in buttons:
    if any(k in b.lower() for k in ['share', 'save', 'export', 'estimate', 'sign in', 'login']):
        # Clean text
        clean = re.sub(r'<[^>]+>', ' ', b).strip()
        print('Button tag:', b[:120].replace('\n', ' '), '--> Text:', clean)
