/* ==========================================================================
   وِكاد — ترجمات لوحة التحكم
   العربية هي المرجع؛ أي مفتاح ناقص في لغة أخرى يرجع للعربية تلقائياً.
   ========================================================================== */
(() => {
  'use strict';

  const DICT = {
    ar: {
      dir: 'rtl', name: 'العربية',

      // الدخول
      loginTitle: 'الدخول إلى اللوحة',
      loginSub: 'اكتب بريدك وكلمة مرورك — وإذا كانت أول مرة ينفتح لك حساب تلقائياً',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      passHint: 'أول مرة؟ اختر كلمة مرور من ٦ أحرف فأكثر وبنحفظها لك',
      signIn: 'دخول',
      working: 'لحظة…',

      // عام
      dashboard: 'لوحة التحكم',
      schedule: 'جدول المناسبات',
      refresh: 'تحديث',
      refreshing: 'جارٍ التحديث…',
      logout: 'خروج',
      export: 'تصدير إكسل',
      search: 'بحث',
      all: 'الكل',
      admin: 'مدير',
      staff: 'موظف',
      day: 'يوم',
      days: 'أيام',
      sar: 'ر.س',
      lastSync: 'آخر تحديث',
      noData: 'لا توجد بيانات بعد',
      noResults: 'لا توجد نتائج',
      show: 'عرض',
      langLabel: 'اللغة',

      // المدى
      d7: '٧ أيام', d30: '٣٠ يوم', d90: '٩٠ يوم', dAll: 'الكل',

      // الصفحات
      pOverview: 'نظرة عامة', pOrders: 'الطلبات',
      pAnalytics: 'التحليلات', pClosed: 'الأيام المقفلة', pUsers: 'المستخدمون',

      // أقسام
      secMoney: 'الأداء المالي',
      secTraffic: 'الزوار ومسار الحجز',
      secOps: 'أرقام التشغيل',

      // بطاقات
      kRevenue: 'الإيرادات المؤكّدة', kOrders: 'إجمالي الطلبات',
      kAvg: 'متوسط قيمة الطلب', kConv: 'نسبة التحويل',
      kPipeline: 'قيمة قيد الانتظار', kBiggest: 'أكبر طلب',
      kVisitors: 'الزوار', kViews: 'مشاهدات الصفحة',
      kStarted: 'بدأوا الحجز', kFinished: 'أتمّوا الطلب',
      kV2O: 'زائر ← طلب', kAvgVisitors: 'متوسط الزوار يومياً',
      kCups: 'أكواب مباعة', kSweets: 'مبيعات الحلى', kAddons: 'مبيعات الإضافات',
      kBaristas: 'باريستا مشمولة', kAvgDays: 'متوسط مدة الخدمة',
      kLead: 'متوسط المهلة', kUpcoming: 'مناسبات قادمة', kCompanies: 'عملاء الشركات',
      kSetups: 'تركيبات قادمة', kWithin7: 'خلال ٧ أيام', kNextSetup: 'أقرب تركيب',

      // تفسيرات
      sFromConfirmed: 'من {n} طلب مؤكّد', sThisPeriod: 'في هذه الفترة',
      sVsPrev: 'عن الفترة السابقة', sForConfirmed: 'للطلبات المؤكّدة',
      sOrderToConfirm: 'من طلب إلى مؤكّد', sNewOrders: '{n} طلب جديد',
      sHighest: 'أعلى قيمة مسجّلة', sSessions: '{n} جلسة',
      sPerSession: '{n} صفحة لكل جلسة', sOfSessions: '{n}% من الجلسات',
      sOfStarted: '{n}% ممن بدأ', sOverallConv: 'معدل التحويل الكلي',
      sPkgTimesDays: 'إجمالي الباقات × الأيام', sSweetRate: '{n}% من الطلبات فيها حلى',
      sExtraBarista: 'باريستا إضافية وطباعة', sFreeWithOrders: 'مجاناً ضمن الطلبات',
      sPerOrder: 'لكل طلب', sBetweenOrderEvent: 'بين الطلب والمناسبة',
      sWithin30: 'خلال ٣٠ يوم · {v} ر.س', sOfAllOrders: 'من إجمالي الطلبات',
      sFromToday: 'من اليوم فما بعد', sGetReady: 'استعد لها', sArrival: 'الوصول {t}',

      // رسوم
      chDaily: 'الطلبات والزوار يومياً', chFunnel: 'مسار الحجز',
      chStatuses: 'حالات الطلبات', chSources: 'مصادر الزوار', chDevices: 'الأجهزة',
      chMonthly: 'الإيرادات شهرياً', chTopPkg: 'الباقات الأكثر طلباً',
      chTopSweets: 'الحلى الأكثر طلباً', chAddons: 'الإضافات',
      chCitiesCount: 'المدن — عدد الطلبات', chCitiesRev: 'المدن — الإيرادات',
      chWeekdays: 'أيام المناسبات',
      confirmedOnly: 'المؤكّدة فقط', visitorToOrder: 'من زائر إلى طلب',
      oldest: 'الأقدم', today: 'اليوم', visitorsLegend: 'زوار', ordersLegend: 'طلبات',

      // مسار الحجز
      fVisitors: 'الزوار', fStarted: 'بدأ الحجز', fSize: 'اختار الحجم',
      fItems: 'الحلى والإضافات', fWhen: 'الموعد والموقع', fClient: 'بياناته',
      fReview: 'المراجعة', fDone: 'أتمّ الطلب',

      // الطلبات
      searchOrders: 'بحث — رقم الطلب، الاسم، الجوال، الشركة، المدينة',
      status: 'الحالة', city: 'المدينة',
      thRef: 'رقم الطلب', thCustomer: 'العميل', thPhone: 'الجوال',
      thPackage: 'الباقة', thSetupWork: 'التركيب / العمل', thLocation: 'الموقع',
      thTotal: 'الإجمالي', thStatus: 'الحالة',
      ofTotal: '{a} من {b}',
      stNew: 'جديد', stContacted: 'تواصلنا', stConfirmed: 'مؤكّد',
      stDone: 'منجز', stCancelled: 'ملغي',
      company: 'شركة', individual: 'أفراد',
      details: 'تفاصيل', hide: 'إخفاء',
      cancelOrder: 'إلغاء الطلب', deleteOrder: 'حذف نهائي',
      confirmCancel: 'إلغاء الطلب {ref}؟',
      confirmDelete: 'حذف الطلب {ref} نهائياً؟ لا يمكن التراجع.',
      failCancel: 'تعذّر الإلغاء', failDelete: 'تعذّر الحذف', failStatus: 'تعذّر تحديث الحالة',
      dSetup: 'التركيب', dWork: 'بدء العمل', dVenue: 'الموقع', dDistrict: 'الحي',
      dBaristas: 'باريستا مشمولة', dAddons: 'الإضافات', dSweets: 'الحلى',
      dVat: 'الرقم الضريبي', dNotes: 'ملاحظات العميل', work: 'العمل',

      // الموظف
      arrivalTime: 'وقت الوصول للتركيب', serviceStart: 'بدء تقديم الضيافة',
      serviceDays: 'مدة الخدمة', cityDistrict: 'المدينة والحي',
      venue: 'مكان المناسبة', serviceNeeded: 'الخدمة المطلوبة', customer: 'العميل',
      customerNote: 'ملاحظة من العميل:', openMap: 'افتح الخريطة',
      noUpcoming: 'لا توجد تركيبات قادمة',
      searchSchedule: 'بحث — المدينة، الحي، الموقع، اسم العميل',
      tomorrow: 'غداً', inTwoDays: 'بعد يومين',
      inDaysFew: 'بعد {n} أيام', inDaysMany: 'بعد {n} يوم',
      eventsCount: '{n} مناسبة', baristas: 'باريستا', item: 'صنف',

      // الأيام المقفلة
      closeDays: 'إقفال أيام', closedHint: 'اليوم المقفل ما يقدر العميل يحجزه من الموقع',
      from: 'من تاريخ', to: 'إلى تاريخ', optional: '(اختياري)',
      reason: 'السبب', reasonPh: 'إجازة · صيانة · محجوز بالكامل',
      closeBtn: 'إقفال', closedNow: 'الأيام المقفلة حالياً',
      oneDayHint: 'اترك "إلى تاريخ" فاضياً لإقفال يوم واحد فقط.',
      closedCount: '{n} يوم قادم مقفل', noClosed: 'لا توجد أيام مقفلة',
      noClosedDays: 'ما فيه أيام مقفلة — كل المواعيد متاحة',
      closedPill: 'مقفل', pastPill: 'مضى', openDay: 'فتح',
      confirmOpen: 'فتح يوم {d} للحجز؟',
      closedRange: 'أُقفلت الأيام من {a} إلى {b}.', closedOne: 'أُقفل يوم {d}.',
      pickDate: 'اختر تاريخاً.', badRange: 'تعذّر الإقفال — تأكد أن "إلى تاريخ" بعد "من تاريخ".',

      // المستخدمون
      createAccount: 'إنشاء حساب جديد',
      rolesHint: 'المدير يشوف كل شي · الموظف يشوف الجدول فقط بلا أسعار',
      generate: 'توليد', createBtn: 'إنشاء الحساب',
      currentUsers: 'المستخدمون الحاليون',
      registered: 'سجّل دخوله', notRegistered: 'لم يسجّل بعد',
      remove: 'حذف', you: '(أنت)',
      cantChangeSelf: 'لا يمكنك تغيير صلاحيتك بنفسك',
      confirmRemove: 'إزالة صلاحية {email}؟ لن يقدر يدخل اللوحة بعدها.',
      confirmRole: 'تغيير صلاحية {email} إلى {role}؟',
      failRole: 'تعذّر التغيير', failAdd: 'تعذّر حفظ الصلاحية.',
      badCreds: 'اكتب بريداً صحيحاً وكلمة مرور من ٦ أحرف فأكثر.',
      createdGive: 'تم إنشاء الحساب ✓ أعطِ الموظف هذي البيانات:',
      existedAdded: 'أُضيفت الصلاحية لـ {email}. الحساب موجود مسبقاً، فكلمة مروره القديمة هي المعتمدة.',
      needsConfirm: '<b>ملاحظة:</b> الحساب ينتظر تفعيل البريد — عطّل Confirm email من Supabase ليدخل مباشرة.',
      confirmWarn: 'تنبيه: مشروعك يطلب <b>تأكيد البريد</b>، فالحساب الجديد ما يقدر يدخل حتى يُفعَّل. عطّل <b>Confirm email</b> من Supabase ← Authentication ← Sign In / Providers ← Email.',

      // أخطاء
      noAccess: 'حسابك غير مُصرَّح له. تواصل مع المدير لإضافة بريدك.',
      sessionEnded: 'انتهت الجلسة، سجّل دخولك مرة ثانية.',
      loadFail: 'تعذّر تحميل الطلبات',
      badLogin: 'البريد أو كلمة المرور غير صحيحة.',
      wrongPass: 'كلمة المرور غير صحيحة.',
      notConfirmed: 'حسابك موجود لكن ينتظر التفعيل. افتح بريدك واضغط رابط التفعيل، أو اطلب من المدير تعطيل التأكيد بالبريد.',
      createdPending: 'أنشأنا حسابك ✓ — ينتظر التفعيل. افتح بريدك واضغط رابط التفعيل ثم ارجع وسجّل دخولك بنفس كلمة المرور.',
      emailTaken: 'هذا البريد له حساب بالفعل — استخدم تسجيل الدخول.',
      shortPass: 'كلمة المرور قصيرة — ٦ أحرف على الأقل.',
      signupOff: 'إنشاء الحسابات معطّل في إعدادات Supabase.',
      loginFail: 'تعذّر تسجيل الدخول',
      createFail: 'تعذّر إنشاء الحساب',
    },

    en: {
      dir: 'ltr', name: 'English',
      loginTitle: 'Sign in', loginSub: 'Enter your email and password — a first-time account is created for you automatically',
      email: 'Email', password: 'Password',
      passHint: 'First time? Pick a password of 6+ characters and we will save it for you',
      signIn: 'Sign in', working: 'One moment…',
      dashboard: 'Dashboard', schedule: 'Job schedule', refresh: 'Refresh', refreshing: 'Refreshing…',
      logout: 'Sign out', export: 'Export to Excel', search: 'Search', all: 'All',
      admin: 'Admin', staff: 'Staff', day: 'day', days: 'days', sar: 'SAR',
      lastSync: 'Last updated', noData: 'No data yet', noResults: 'No results',
      show: 'Show', langLabel: 'Language',
      d7: '7 days', d30: '30 days', d90: '90 days', dAll: 'All',
      pOverview: 'Overview', pOrders: 'Orders', pAnalytics: 'Analytics',
      pClosed: 'Blocked days', pUsers: 'Users',
      secMoney: 'Financial performance', secTraffic: 'Visitors & booking path', secOps: 'Operations',
      kRevenue: 'Confirmed revenue', kOrders: 'Total orders', kAvg: 'Average order value',
      kConv: 'Conversion rate', kPipeline: 'Pending value', kBiggest: 'Largest order',
      kVisitors: 'Visitors', kViews: 'Page views', kStarted: 'Started booking',
      kFinished: 'Completed orders', kV2O: 'Visitor → order', kAvgVisitors: 'Average daily visitors',
      kCups: 'Cups sold', kSweets: 'Dessert sales', kAddons: 'Add-on sales',
      kBaristas: 'Baristas included', kAvgDays: 'Average service length',
      kLead: 'Average lead time', kUpcoming: 'Upcoming events', kCompanies: 'Company clients',
      kSetups: 'Upcoming setups', kWithin7: 'Within 7 days', kNextSetup: 'Next setup',
      sFromConfirmed: 'from {n} confirmed orders', sThisPeriod: 'in this period',
      sVsPrev: 'vs previous period', sForConfirmed: 'for confirmed orders',
      sOrderToConfirm: 'order to confirmed', sNewOrders: '{n} new orders',
      sHighest: 'highest recorded', sSessions: '{n} sessions',
      sPerSession: '{n} pages per session', sOfSessions: '{n}% of sessions',
      sOfStarted: '{n}% of those who started', sOverallConv: 'overall conversion',
      sPkgTimesDays: 'packages × days', sSweetRate: '{n}% of orders include desserts',
      sExtraBarista: 'extra barista and printing', sFreeWithOrders: 'free with orders',
      sPerOrder: 'per order', sBetweenOrderEvent: 'between order and event',
      sWithin30: 'within 30 days · {v} SAR', sOfAllOrders: 'of all orders',
      sFromToday: 'from today onward', sGetReady: 'get ready', sArrival: 'arrival {t}',
      chDaily: 'Orders and visitors per day', chFunnel: 'Booking path',
      chStatuses: 'Order statuses', chSources: 'Visitor sources', chDevices: 'Devices',
      chMonthly: 'Monthly revenue', chTopPkg: 'Most requested packages',
      chTopSweets: 'Most requested desserts', chAddons: 'Add-ons',
      chCitiesCount: 'Cities — order count', chCitiesRev: 'Cities — revenue',
      chWeekdays: 'Event weekdays',
      confirmedOnly: 'confirmed only', visitorToOrder: 'visitor to order',
      oldest: 'Oldest', today: 'Today', visitorsLegend: 'visitors', ordersLegend: 'orders',
      fVisitors: 'Visitors', fStarted: 'Started booking', fSize: 'Chose size',
      fItems: 'Desserts & add-ons', fWhen: 'Date & location', fClient: 'Their details',
      fReview: 'Review', fDone: 'Completed',
      searchOrders: 'Search — reference, name, mobile, company, city',
      status: 'Status', city: 'City',
      thRef: 'Reference', thCustomer: 'Customer', thPhone: 'Mobile',
      thPackage: 'Package', thSetupWork: 'Setup / service', thLocation: 'Location',
      thTotal: 'Total', thStatus: 'Status', ofTotal: '{a} of {b}',
      stNew: 'New', stContacted: 'Contacted', stConfirmed: 'Confirmed',
      stDone: 'Completed', stCancelled: 'Cancelled',
      company: 'Company', individual: 'Individual',
      details: 'Details', hide: 'Hide',
      cancelOrder: 'Cancel order', deleteOrder: 'Delete permanently',
      confirmCancel: 'Cancel order {ref}?',
      confirmDelete: 'Delete order {ref} permanently? This cannot be undone.',
      failCancel: 'Could not cancel', failDelete: 'Could not delete', failStatus: 'Could not update status',
      dSetup: 'Setup', dWork: 'Service start', dVenue: 'Venue', dDistrict: 'District',
      dBaristas: 'Baristas included', dAddons: 'Add-ons', dSweets: 'Desserts',
      dVat: 'VAT number', dNotes: 'Customer notes', work: 'Service',
      arrivalTime: 'Arrival time for setup', serviceStart: 'Service starts',
      serviceDays: 'Service length', cityDistrict: 'City & district',
      venue: 'Venue', serviceNeeded: 'Service required', customer: 'Customer',
      customerNote: 'Customer note:', openMap: 'Open map',
      noUpcoming: 'No upcoming setups',
      searchSchedule: 'Search — city, district, venue, customer name',
      tomorrow: 'Tomorrow', inTwoDays: 'In 2 days',
      inDaysFew: 'In {n} days', inDaysMany: 'In {n} days',
      eventsCount: '{n} events', baristas: 'baristas', item: 'item',
      closeDays: 'Block days', closedHint: 'A blocked day cannot be booked on the website',
      from: 'From date', to: 'To date', optional: '(optional)',
      reason: 'Reason', reasonPh: 'Holiday · Maintenance · Fully booked',
      closeBtn: 'Block', closedNow: 'Currently blocked days',
      oneDayHint: 'Leave "To date" empty to block a single day.',
      closedCount: '{n} upcoming days blocked', noClosed: 'No blocked days',
      noClosedDays: 'No blocked days — all dates are available',
      closedPill: 'Blocked', pastPill: 'Past', openDay: 'Unblock',
      confirmOpen: 'Open {d} for booking?',
      closedRange: 'Blocked days from {a} to {b}.', closedOne: 'Blocked {d}.',
      pickDate: 'Pick a date.', badRange: 'Could not block — make sure "To date" is after "From date".',
      createAccount: 'Create a new account',
      rolesHint: 'Admin sees everything · Staff sees the schedule only, without prices',
      generate: 'Generate', createBtn: 'Create account',
      currentUsers: 'Current users', registered: 'Signed in', notRegistered: 'Not signed in yet',
      remove: 'Remove', you: '(you)',
      cantChangeSelf: 'You cannot change your own role',
      confirmRemove: 'Remove access for {email}? They will no longer be able to sign in.',
      confirmRole: 'Change {email} to {role}?',
      failRole: 'Could not change', failAdd: 'Could not save the role.',
      badCreds: 'Enter a valid email and a password of 6+ characters.',
      createdGive: 'Account created ✓ Give these details to the employee:',
      existedAdded: 'Access granted to {email}. The account already exists, so their old password still applies.',
      needsConfirm: '<b>Note:</b> the account awaits email confirmation — disable Confirm email in Supabase so they can sign in directly.',
      confirmWarn: 'Note: your project requires <b>email confirmation</b>, so a new account cannot sign in until confirmed. Disable <b>Confirm email</b> in Supabase → Authentication → Sign In / Providers → Email.',
      noAccess: 'Your account is not authorised. Ask the admin to add your email.',
      sessionEnded: 'Session expired, please sign in again.',
      loadFail: 'Could not load orders',
      badLogin: 'Email or password is incorrect.',
      wrongPass: 'Password is incorrect.',
      notConfirmed: 'Your account exists but awaits confirmation. Open your email and click the link, or ask the admin to disable email confirmation.',
      createdPending: 'Account created ✓ — awaiting confirmation. Open your email, click the link, then sign in with the same password.',
      emailTaken: 'This email already has an account — use sign in.',
      shortPass: 'Password too short — at least 6 characters.',
      signupOff: 'Account creation is disabled in Supabase settings.',
      loginFail: 'Could not sign in', createFail: 'Could not create the account',
    },

    tl: {
      dir: 'ltr', name: 'Filipino',
      loginTitle: 'Mag-sign in', loginSub: 'Ilagay ang email at password — kung first time, awtomatikong gagawan ka ng account',
      email: 'Email', password: 'Password',
      passHint: 'First time? Pumili ng password na 6+ na karakter at ise-save namin ito',
      signIn: 'Pumasok', working: 'Sandali lang…',
      dashboard: 'Dashboard', schedule: 'Iskedyul ng trabaho', refresh: 'I-refresh', refreshing: 'Nire-refresh…',
      logout: 'Mag-sign out', export: 'I-export sa Excel', search: 'Maghanap', all: 'Lahat',
      admin: 'Admin', staff: 'Empleyado', day: 'araw', days: 'araw', sar: 'SAR',
      lastSync: 'Huling update', noData: 'Wala pang datos', noResults: 'Walang resulta',
      show: 'Ipakita', langLabel: 'Wika',
      d7: '7 araw', d30: '30 araw', d90: '90 araw', dAll: 'Lahat',
      pOverview: 'Pangkalahatan', pOrders: 'Mga order', pAnalytics: 'Analytics',
      pClosed: 'Mga saradong araw', pUsers: 'Mga user',
      secMoney: 'Pinansyal na performance', secTraffic: 'Mga bisita at daan ng booking', secOps: 'Mga numero ng operasyon',
      kRevenue: 'Kumpirmadong kita', kOrders: 'Kabuuang order', kAvg: 'Average na halaga ng order',
      kConv: 'Conversion rate', kPipeline: 'Nakabinbing halaga', kBiggest: 'Pinakamalaking order',
      kVisitors: 'Mga bisita', kViews: 'Page views', kStarted: 'Nagsimulang mag-book',
      kFinished: 'Natapos ang order', kV2O: 'Bisita → order', kAvgVisitors: 'Average na bisita bawat araw',
      kCups: 'Nabentang tasa', kSweets: 'Benta ng dessert', kAddons: 'Benta ng add-on',
      kBaristas: 'Kasamang barista', kAvgDays: 'Average na haba ng serbisyo',
      kLead: 'Average na lead time', kUpcoming: 'Paparating na event', kCompanies: 'Kliyenteng kompanya',
      kSetups: 'Paparating na setup', kWithin7: 'Sa loob ng 7 araw', kNextSetup: 'Pinakamalapit na setup',
      sFromConfirmed: 'mula sa {n} kumpirmadong order', sThisPeriod: 'sa panahong ito',
      sVsPrev: 'kumpara sa nakaraan', sForConfirmed: 'para sa kumpirmadong order',
      sOrderToConfirm: 'order hanggang kumpirmado', sNewOrders: '{n} bagong order',
      sHighest: 'pinakamataas na naitala', sSessions: '{n} session',
      sPerSession: '{n} pahina bawat session', sOfSessions: '{n}% ng session',
      sOfStarted: '{n}% ng nagsimula', sOverallConv: 'kabuuang conversion',
      sPkgTimesDays: 'package × araw', sSweetRate: '{n}% ng order ay may dessert',
      sExtraBarista: 'dagdag na barista at printing', sFreeWithOrders: 'libre kasama ng order',
      sPerOrder: 'bawat order', sBetweenOrderEvent: 'pagitan ng order at event',
      sWithin30: 'sa loob ng 30 araw · {v} SAR', sOfAllOrders: 'ng lahat ng order',
      sFromToday: 'mula ngayon', sGetReady: 'maghanda', sArrival: 'dating {t}',
      chDaily: 'Mga order at bisita bawat araw', chFunnel: 'Daan ng booking',
      chStatuses: 'Status ng mga order', chSources: 'Pinagmulan ng bisita', chDevices: 'Mga device',
      chMonthly: 'Buwanang kita', chTopPkg: 'Pinakahinihiling na package',
      chTopSweets: 'Pinakahinihiling na dessert', chAddons: 'Mga add-on',
      chCitiesCount: 'Mga lungsod — bilang ng order', chCitiesRev: 'Mga lungsod — kita',
      chWeekdays: 'Araw ng mga event',
      confirmedOnly: 'kumpirmado lang', visitorToOrder: 'bisita hanggang order',
      oldest: 'Pinakaluma', today: 'Ngayon', visitorsLegend: 'bisita', ordersLegend: 'order',
      fVisitors: 'Mga bisita', fStarted: 'Nagsimula', fSize: 'Pumili ng laki',
      fItems: 'Dessert at add-on', fWhen: 'Petsa at lugar', fClient: 'Mga detalye niya',
      fReview: 'Pagsusuri', fDone: 'Natapos',
      searchOrders: 'Hanapin — reference, pangalan, mobile, kompanya, lungsod',
      status: 'Status', city: 'Lungsod',
      thRef: 'Reference', thCustomer: 'Kliyente', thPhone: 'Mobile',
      thPackage: 'Package', thSetupWork: 'Setup / serbisyo', thLocation: 'Lugar',
      thTotal: 'Kabuuan', thStatus: 'Status', ofTotal: '{a} sa {b}',
      stNew: 'Bago', stContacted: 'Nakausap', stConfirmed: 'Kumpirmado',
      stDone: 'Tapos', stCancelled: 'Kanselado',
      company: 'Kompanya', individual: 'Indibidwal',
      details: 'Detalye', hide: 'Itago',
      cancelOrder: 'Kanselahin', deleteOrder: 'Burahin nang tuluyan',
      confirmCancel: 'Kanselahin ang order {ref}?',
      confirmDelete: 'Burahin ang order {ref} nang tuluyan? Hindi ito maibabalik.',
      failCancel: 'Hindi makansela', failDelete: 'Hindi mabura', failStatus: 'Hindi ma-update ang status',
      dSetup: 'Setup', dWork: 'Simula ng serbisyo', dVenue: 'Lugar', dDistrict: 'Distrito',
      dBaristas: 'Kasamang barista', dAddons: 'Mga add-on', dSweets: 'Dessert',
      dVat: 'VAT number', dNotes: 'Paalala ng kliyente', work: 'Serbisyo',
      arrivalTime: 'Oras ng pagdating para sa setup', serviceStart: 'Simula ng serbisyo',
      serviceDays: 'Haba ng serbisyo', cityDistrict: 'Lungsod at distrito',
      venue: 'Lugar ng event', serviceNeeded: 'Kailangang serbisyo', customer: 'Kliyente',
      customerNote: 'Paalala ng kliyente:', openMap: 'Buksan ang mapa',
      noUpcoming: 'Walang paparating na setup',
      searchSchedule: 'Hanapin — lungsod, distrito, lugar, pangalan ng kliyente',
      tomorrow: 'Bukas', inTwoDays: 'Sa 2 araw',
      inDaysFew: 'Sa {n} araw', inDaysMany: 'Sa {n} araw',
      eventsCount: '{n} event', baristas: 'barista', item: 'item',
      closeDays: 'Isara ang mga araw', closedHint: 'Hindi mabu-book ng kliyente ang saradong araw',
      from: 'Mula sa petsa', to: 'Hanggang petsa', optional: '(opsyonal)',
      reason: 'Dahilan', reasonPh: 'Bakasyon · Maintenance · Puno na',
      closeBtn: 'Isara', closedNow: 'Mga saradong araw ngayon',
      oneDayHint: 'Iwanang blangko ang "Hanggang petsa" para sa isang araw lang.',
      closedCount: '{n} paparating na araw ang sarado', noClosed: 'Walang saradong araw',
      noClosedDays: 'Walang saradong araw — bukas lahat ng petsa',
      closedPill: 'Sarado', pastPill: 'Lumipas', openDay: 'Buksan',
      confirmOpen: 'Buksan ang {d} para sa booking?',
      closedRange: 'Isinara ang mga araw mula {a} hanggang {b}.', closedOne: 'Isinara ang {d}.',
      pickDate: 'Pumili ng petsa.', badRange: 'Hindi maisara — tiyaking ang "Hanggang petsa" ay pagkatapos ng "Mula sa petsa".',
      createAccount: 'Gumawa ng bagong account',
      rolesHint: 'Nakikita ng admin ang lahat · Ang empleyado ay iskedyul lang, walang presyo',
      generate: 'Gumawa', createBtn: 'Gumawa ng account',
      currentUsers: 'Mga kasalukuyang user', registered: 'Naka-sign in na', notRegistered: 'Hindi pa naka-sign in',
      remove: 'Alisin', you: '(ikaw)',
      cantChangeSelf: 'Hindi mo mababago ang sarili mong role',
      confirmRemove: 'Alisin ang access ni {email}? Hindi na siya makakapasok.',
      confirmRole: 'Palitan si {email} ng {role}?',
      failRole: 'Hindi mapalitan', failAdd: 'Hindi ma-save ang role.',
      badCreds: 'Maglagay ng tamang email at password na 6+ na karakter.',
      createdGive: 'Nagawa ang account ✓ Ibigay ang mga detalyeng ito sa empleyado:',
      existedAdded: 'Nabigyan ng access si {email}. May account na siya, kaya ang lumang password pa rin ang gamitin.',
      needsConfirm: '<b>Paalala:</b> naghihintay ng email confirmation ang account — i-disable ang Confirm email sa Supabase para makapasok agad.',
      confirmWarn: 'Paalala: humihingi ang project mo ng <b>email confirmation</b>, kaya hindi makakapasok ang bagong account hanggang hindi ito nakumpirma. I-disable ang <b>Confirm email</b> sa Supabase → Authentication → Sign In / Providers → Email.',
      noAccess: 'Hindi awtorisado ang account mo. Hilingin sa admin na idagdag ang email mo.',
      sessionEnded: 'Nag-expire ang session, mag-sign in ulit.',
      loadFail: 'Hindi ma-load ang mga order',
      badLogin: 'Mali ang email o password.',
      wrongPass: 'Mali ang password.',
      notConfirmed: 'May account ka pero naghihintay ng kumpirmasyon. Buksan ang email mo at pindutin ang link, o hilingin sa admin na i-disable ang email confirmation.',
      createdPending: 'Nagawa ang account ✓ — naghihintay ng kumpirmasyon. Buksan ang email, pindutin ang link, tapos mag-sign in gamit ang parehong password.',
      emailTaken: 'May account na ang email na ito — gamitin ang sign in.',
      shortPass: 'Masyadong maikli ang password — hindi bababa sa 6 na karakter.',
      signupOff: 'Naka-disable ang paggawa ng account sa Supabase settings.',
      loginFail: 'Hindi makapasok', createFail: 'Hindi magawa ang account',
    },
  };

  const LANGS = ['ar', 'en', 'tl'];
  const STORE = 'wekad_lang';

  function pick() {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved && LANGS.includes(saved)) return saved;
    } catch { /* وضع خاص */ }
    return 'ar';
  }

  let current = pick();

  /** يترجم مفتاحاً ويستبدل {متغيّراته}. يرجع للعربية إن نقص المفتاح. */
  function t(key, vars) {
    const text = (DICT[current] && DICT[current][key]) ?? DICT.ar[key] ?? key;
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  function setLang(code) {
    if (!LANGS.includes(code)) return;
    current = code;
    try { localStorage.setItem(STORE, code); } catch { /* تجاهل */ }
    const dir = DICT[code].dir;
    document.documentElement.lang = code === 'tl' ? 'fil' : code;
    document.documentElement.dir = dir;
    applyStatic();
    document.dispatchEvent(new CustomEvent('wekad:lang', { detail: { lang: code, dir } }));
  }

  /** يترجم كل عنصر يحمل data-i18n في الصفحة. */
  function applyStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
  }

  window.WekadI18n = { t, setLang, applyStatic, langs: LANGS, dict: DICT, get lang() { return current; } };
  window.t = t;
})();
