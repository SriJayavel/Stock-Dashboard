with open(r"C:/Project_Files/Stock-Dashboard/frontend/index.html", encoding="utf-8") as f:
    content = f.read()

# Fix Sector Rotation heading - file has & entity
search1 = '<h3 class="section-sub-title">Sector Rotation & Performance Heatmap</h3>'
replace1 = '<h2 class="section-sub-title">Sector Rotation & Performance Heatmap</h2>'

# Fix Sector Constituents heading
search2 = '<h3 class="section-sub-title" id="sector-detail-title">Sector Constituents</h3>'
replace2 = '<h2 class="section-sub-title" id="sector-detail-title">Sector Constituents</h2>'

# Fix Cross-Asset Macro Radar heading
search3 = '<h3 class="section-sub-title">Cross-Asset Macro Radar</h3>'
replace3 = '<h2 class="section-sub-title">Cross-Asset Macro Radar</h2>'

changes = 0
for search, replace in [(search1, replace1), (search2, replace2), (search3, replace3)]:
    if search in content:
        content = content.replace(search, replace)
        changes += 1
        print(f"Fixed: {search[:60]}...")
    else:
        print(f"NOT FOUND: {search[:60]}...")

if changes > 0:
    with open(r"C:/Project_Files/Stock-Dashboard/frontend/index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nTotal changes: {changes}")
else:
    print("\nNo changes made")
