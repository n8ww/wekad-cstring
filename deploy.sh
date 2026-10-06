#!/usr/bin/env bash
# رفع أي تعديلات إلى GitHub بأمر واحد:  ./deploy.sh  أو  ./deploy.sh "وصف التعديل"
set -e
cd "$(dirname "$0")"

# GitHub Pages يخزّن الملفات ١٠ دقائق، فالزائر القديم قد يحصل على نسخة
# قديمة من الجافاسكربت مع صفحة جديدة. ختم الإصدار يجبر المتصفح على التحديث.
STAMP=$(date +%Y%m%d%H%M)
python3 - "$STAMP" <<'PY'
import io, re, sys
stamp = sys.argv[1]
pat = re.compile(r'(assets/(?:js|css)/[A-Za-z0-9_.-]+\.(?:js|css))(?:\?v=\d+)?(?=")')
for page in ('index.html', 'dashboard.html'):
    s = io.open(page, encoding='utf-8').read()
    io.open(page, 'w', encoding='utf-8').write(pat.sub(rf'\1?v={stamp}', s))
PY
echo "ختم الإصدار: $STAMP"

if [ -z "$(git status --porcelain)" ]; then
  echo "لا توجد تعديلات جديدة."
else
  git add -A
  git commit -q -m "${1:-تحديث الموقع}"
  echo "تم تسجيل التعديلات."
fi

git push -q origin main
echo "✅ تم الرفع"
echo "   الموقع: https://wekad.store"
