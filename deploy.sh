#!/usr/bin/env bash
# رفع أي تعديلات إلى GitHub بأمر واحد:  ./deploy.sh  أو  ./deploy.sh "وصف التعديل"
set -e
cd "$(dirname "$0")"

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
