/* ==========================================================================
   وِكاد — أسماء الأصناف بثلاث لغات
   مصدر واحد تقرأ منه صفحة العميل ولوحة التحكم معاً.

   الطلب يُحفظ باسم الصنف العربي وقت الحجز، فلو ترجمنا من النص لاختلفت
   النتيجة مع كل تعديل إملائي. المعرّف (id) هو المفتاح الثابت، وهو ما
   يُحفظ مع كل بند في الطلب، فتُقرأ الأسماء منه بأي لغة بعد ذلك.
   ========================================================================== */
(() => {
  'use strict';

  const NAMES = {
    // ---- الخدمات ----
    counter: { ar: 'ركن ضيافة القهوة', en: 'Coffee Catering Counter', tl: 'Coffee Catering Counter' },
    flask:   { ar: 'خدمة الحافظات',     en: 'Flask Service',           tl: 'Serbisyo ng Flask' },

    // ---- الحافظات ----
    f1: { ar: 'حافظة واحدة', en: 'One flask',  tl: 'Isang flask' },
    f2: { ar: 'حافظتان',     en: 'Two flasks', tl: 'Dalawang flask' },

    // ---- الإضافات ----
    barista: { ar: 'باريستا إضافية (امرأة)', en: 'Extra Barista (Female)', tl: 'Dagdag na Barista (Babae)' },
    print:   { ar: 'طباعة أكواب',            en: 'Cup Print',              tl: 'Print sa Baso' },

    // ---- التارت ----
    't-custard':   { ar: 'تارت كاسترد', en: 'Custard Tart',   tl: 'Custard Tart' },
    't-pecan':     { ar: 'تارت بيكان',  en: 'Pecan Tart',     tl: 'Pecan Tart' },
    't-chocolate': { ar: 'تارت تشوكلت', en: 'Chocolate Tart', tl: 'Chocolate Tart' },

    // ---- الكيك ----
    'c-pecan':      { ar: 'بيكان',          en: 'Pecan',             tl: 'Pecan' },
    'c-graham':     { ar: 'قراهم',          en: 'Graham',            tl: 'Graham' },
    'c-carrot':     { ar: 'جزر',            en: 'Carrot',            tl: 'Carrot' },
    'c-cheesecake': { ar: 'وِكاد تشيزكيك',  en: 'Wekad Cheesecake',  tl: 'Wekad Cheesecake' },
    'c-chocolate':  { ar: 'وِكاد تشوكلت',   en: 'Wekad Chocolate',   tl: 'Wekad Chocolate' },
    'c-london':     { ar: 'لندن',           en: 'London',            tl: 'London' },
    'c-classic':    { ar: 'كلاسيك تشوكلت',  en: 'Classic Chocolate', tl: 'Classic Chocolate' },
    'c-matilda':    { ar: 'ماتلدا',         en: 'Matilda',           tl: 'Matilda' },

    // ---- مجموعات الحلى ----
    tart: { ar: 'التارت',              en: 'Tarts',             tl: 'Mga Tart' },
    cake: { ar: 'الكيك الطبيعي الكبير', en: 'Large Fresh Cakes', tl: 'Malalaking Sariwang Cake' },

    // ---- الباقة المخصصة ----
    custom: { ar: 'باقة مخصصة', en: 'Custom package', tl: 'Pasadyang pakete' },
  };

  // وحدات القياس تظهر مع كل كمية في اللوحة وفي قائمة التجهيز
  const UNITS = {
    طبق:     { ar: 'طبق',     en: 'tray',    tl: 'tray' },
    كيكة:    { ar: 'كيكة',    en: 'cake',    tl: 'cake' },
    باريستا: { ar: 'باريستا', en: 'barista', tl: 'barista' },
    كوب:     { ar: 'كوب',     en: 'cup',     tl: 'baso' },
    حبة:     { ar: 'حبة',     en: 'piece',   tl: 'piraso' },
    يوم:     { ar: 'يوم',     en: 'day',     tl: 'araw' },
  };

  const CITIES = {
    الدمام:  { ar: 'الدمام',  en: 'Dammam',  tl: 'Dammam' },
    الخبر:   { ar: 'الخبر',   en: 'Khobar',  tl: 'Khobar' },
    الظهران: { ar: 'الظهران', en: 'Dhahran', tl: 'Dhahran' },
    القطيف:  { ar: 'القطيف',  en: 'Qatif',   tl: 'Qatif' },
    سيهات:   { ar: 'سيهات',   en: 'Saihat',  tl: 'Saihat' },
    أخرى:    { ar: 'أخرى',    en: 'Other',   tl: 'Iba pa' },
  };

  // الباقات المعروضة في الموقع، تُستعمل كذلك لبناء نموذج الحجز اليدوي
  const PACKAGES = [25, 50, 100, 200, 300];
  const FLASKS = ['f1', 'f2'];

  const lang = () => (window.WekadI18n ? window.WekadI18n.lang : 'ar');

  /** اسم صنف بلغة العرض. `fallback` هو الاسم المحفوظ وقت الحجز. */
  function name(id, fallback) {
    const row = NAMES[id];
    if (!row) return fallback ?? id;
    return row[lang()] || row.ar;
  }

  /** وحدة القياس بلغة العرض؛ المفتاح هو الوحدة العربية المحفوظة. */
  function unit(arabic) {
    const row = UNITS[arabic];
    if (!row) return arabic || '';
    return row[lang()] || row.ar;
  }

  /** اسم المدينة بلغة العرض؛ المفتاح هو الاسم العربي المحفوظ. */
  function city(arabic) {
    const row = CITIES[arabic];
    if (!row) return arabic || '';
    return row[lang()] || row.ar;
  }

  window.WekadCatalog = { NAMES, UNITS, CITIES, PACKAGES, FLASKS, name, unit, city };
})();
