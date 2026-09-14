import type { Place, RecommendedAct, ReligiousContent, SourceReference } from '@/domain/types';
import type { Language } from '@/features/i18n/i18n';

type PlaceTranslation = Partial<
  Pick<
    Place,
    | 'accessibilityNotes'
    | 'historicalNotes'
    | 'longDescription'
    | 'name'
    | 'openingInfo'
    | 'shortDescription'
    | 'visitingTips'
  >
> & {
  imageDescriptions?: Record<string, string>;
};

type RecommendedActTranslation = Pick<RecommendedAct, 'shortInstruction' | 'title'>;

type ReligiousContentTranslation = Partial<
  Pick<ReligiousContent, 'language' | 'notes' | 'paragraphs' | 'title'>
>;

type SourceReferenceTranslation = Partial<Pick<SourceReference, 'language' | 'notes' | 'title'>>;

const genericPlaceCopy: Record<Exclude<Language, 'de'>, Required<Pick<
  PlaceTranslation,
  'accessibilityNotes' | 'historicalNotes' | 'longDescription' | 'openingInfo' | 'visitingTips'
>>> = {
  en: {
    accessibilityNotes: 'Accessibility must be checked on site.',
    historicalNotes: 'Verified historical description will be added after source review.',
    longDescription: 'Verified historical description will be added after source review.',
    openingInfo: 'Local verification required before publication.',
    visitingTips: [
      'Check current access, safety, and visiting conditions before traveling.',
      'Keep important information available offline.',
      'Respect local rules in shrines, mosques, and cemeteries.',
    ],
  },
  ar: {
    accessibilityNotes: 'يجب التحقق من إتاحة الوصول في الموقع.',
    historicalNotes: 'سيضاف الوصف التاريخي الموثق بعد مراجعة المصادر.',
    longDescription: 'سيضاف الوصف التاريخي الموثق بعد مراجعة المصادر.',
    openingInfo: 'يلزم التحقق المحلي قبل النشر.',
    visitingTips: [
      'تحقق من شروط الوصول والسلامة والزيارة الحالية قبل السفر.',
      'احتفظ بالمعلومات المهمة متاحة دون اتصال.',
      'احترم التعليمات المحلية في الأضرحة والمساجد والمقابر.',
    ],
  },
};

const placeTranslations: Record<string, Partial<Record<Language, PlaceTranslation>>> = {
  'place-imam-hussain': {
    en: {
      name: 'Shrine of Imam Hussain',
      shortDescription:
        'The shrine of Imam Hussain (a.) is the heart of Karbala and one of the most important places of Ziyārah.',
      longDescription:
        'The shrine of Imam Hussain (a.) is the heart of Karbala and one of the most important places of Ziyārah. It reminds visitors of sacrifice, steadfastness, and loyalty to Allah.',
      historicalNotes: '',
      imageDescriptions: {
        'imam-hussain-shrine': 'Exterior view of the Shrine of Imam Hussain in Karbala.',
      },
    },
    ar: {
      name: 'ضريح الإمام الحسين',
      shortDescription: 'يُعدّ مرقد الإمام الحسين (ع) قلب كربلاء ومن أهم أماكن الزيارة.',
      longDescription:
        'يُعدّ مرقد الإمام الحسين (ع) قلب كربلاء ومن أهم أماكن الزيارة. وهو يذكّر الزائر بمعاني التضحية والثبات والوفاء لله تعالى.',
      historicalNotes: '',
      imageDescriptions: {
        'imam-hussain-shrine': 'منظر خارجي لضريح الإمام الحسين في كربلاء.',
      },
    },
  },
  'place-abul-fadhl-abbas': {
    en: {
      name: 'Shrine of Abul Fadhl al-Abbas',
      shortDescription:
        'The shrine of Abul-Fadhl al-Abbas (a.) represents loyalty, courage, and devotion.',
      longDescription:
        'The shrine of Abul-Fadhl al-Abbas (a.) represents loyalty, courage, and devotion. Visiting it reminds pilgrims of the special role of al-Abbas (a.) beside Imam Hussain (a.).',
      historicalNotes: '',
      imageDescriptions: {
        'abu-fadl-shrine': 'Exterior view of the Shrine of Abul Fadhl al-Abbas in Karbala.',
      },
    },
    ar: {
      name: 'ضريح أبي الفضل العباس',
      shortDescription: 'يمثّل مرقد أبي الفضل العباس (ع) معاني الوفاء والشجاعة والإخلاص.',
      longDescription:
        'يمثّل مرقد أبي الفضل العباس (ع) معاني الوفاء والشجاعة والإخلاص. وتذكّر زيارته بمكانته العظيمة إلى جانب الإمام الحسين (ع).',
      historicalNotes: '',
      imageDescriptions: {
        'abu-fadl-shrine': 'منظر خارجي لضريح أبي الفضل العباس في كربلاء.',
      },
    },
  },
  'place-bayn-al-haramayn': {
    en: {
      name: 'Bayn al-Haramayn',
      shortDescription:
        'Bayn al-Haramayn is the area between the shrines of Imam Hussain (a.) and Abul-Fadhl al-Abbas (a.).',
      longDescription:
        'Bayn al-Haramayn is the area between the shrines of Imam Hussain (a.) and Abul-Fadhl al-Abbas (a.). It is a place of walking, prayer, and quiet remembrance.',
      historicalNotes: '',
      imageDescriptions: {
        'bayn-al-haramayn': 'View of Bayn al-Haramayn between the two shrines in Karbala.',
      },
    },
    ar: {
      name: 'بين الحرمين',
      shortDescription:
        'ما بين الحرمين هو المكان الواقع بين مرقد الإمام الحسين (ع) ومرقد أبي الفضل العباس (ع).',
      longDescription:
        'ما بين الحرمين هو المكان الواقع بين مرقد الإمام الحسين (ع) ومرقد أبي الفضل العباس (ع). وهو موضع للمشي والدعاء والذكر والتأمل.',
      historicalNotes: '',
      imageDescriptions: {
        'bayn-al-haramayn': 'منظر لبين الحرمين بين الضريحين في كربلاء.',
      },
    },
  },
  'place-mukhayyam': {
    en: {
      name: 'Al-Mukhayyam / Camp of Imam Hussain',
      shortDescription:
        'Al-Mukhayyam recalls the camp of Imam Hussain (a.) and his family on the day of Ashura.',
      longDescription:
        'Al-Mukhayyam recalls the camp of Imam Hussain (a.) and his family on the day of Ashura. It invites visitors to reflect on patience, hardship, and trust in Allah.',
      historicalNotes: '',
      imageDescriptions: {
        'al-mukhayam': 'View of Al-Mukhayyam, the camp area of Imam Hussain in Karbala.',
      },
    },
    ar: {
      name: 'المخيم / موضع خيام الإمام الحسين',
      shortDescription: 'يذكّر المخيّم الحسيني بمخيم الإمام الحسين (ع) وأهل بيته يوم عاشوراء.',
      longDescription:
        'يذكّر المخيّم الحسيني بمخيم الإمام الحسين (ع) وأهل بيته يوم عاشوراء. وهو مكان يدعو إلى التأمل في الصبر والابتلاء والتوكل على الله.',
      historicalNotes: '',
      imageDescriptions: {
        'al-mukhayam': 'منظر للمخيم، موضع خيام الإمام الحسين في كربلاء.',
      },
    },
  },
  'place-hur': {
    en: {
      name: 'Shrine of Hur ibn Yazid al-Riyahi',
      shortDescription:
        'The shrine of Hurr ibn Yazid al-Riyahi reminds visitors of repentance, return, and choosing the truth.',
      longDescription:
        'The shrine of Hurr ibn Yazid al-Riyahi reminds visitors of repentance, return, and choosing the truth. His story shows that the path back to Allah is always open.',
      historicalNotes: '',
      imageDescriptions: {
        'hurr-al-riyahi': 'Exterior view of the Shrine of Hur ibn Yazid al-Riyahi near Karbala.',
      },
    },
    ar: {
      name: 'ضريح الحر بن يزيد الرياحي',
      shortDescription: 'يذكّر مرقد الحرّ بن يزيد الرياحي بالتوبة والرجوع واختيار الحق.',
      longDescription:
        'يذكّر مرقد الحرّ بن يزيد الرياحي بالتوبة والرجوع واختيار الحق. وتُظهر قصته أن باب العودة إلى الله مفتوح دائمًا.',
      historicalNotes: '',
      imageDescriptions: {
        'hurr-al-riyahi': 'منظر خارجي لضريح الحر بن يزيد الرياحي في منطقة كربلاء.',
      },
    },
  },
  'place-imam-ali': {
    en: {
      name: 'Shrine of Imam Ali',
      shortDescription: 'The shrine of Imam Ali ibn Abi Talib (a.) is the center of Najaf.',
      longDescription:
        'The shrine of Imam Ali ibn Abi Talib (a.) is the center of Najaf. It is a place of Ziyārah, knowledge, and closeness to the Commander of the Faithful.',
      historicalNotes: '',
      imageDescriptions: {
        'imam-ali-shrine': 'Exterior view of the Shrine of Imam Ali in Najaf.',
      },
    },
    ar: {
      name: 'ضريح الإمام علي',
      shortDescription: 'يُعدّ مرقد الإمام علي بن أبي طالب (ع) مركز مدينة النجف.',
      longDescription:
        'يُعدّ مرقد الإمام علي بن أبي طالب (ع) مركز مدينة النجف. وهو مكان للزيارة والعلم والقرب من أمير المؤمنين (ع).',
      historicalNotes: '',
      imageDescriptions: {
        'imam-ali-shrine': 'منظر خارجي لضريح الإمام علي في النجف.',
      },
    },
  },
  'place-wadi-salam': {
    en: {
      name: 'Wadi al-Salam Cemetery',
      shortDescription: 'Wadi al-Salam is one of the most well-known cemeteries in the Islamic world.',
      longDescription:
        'Wadi al-Salam is one of the most well-known cemeteries in the Islamic world. It reminds visitors of the hereafter, the passing nature of life, and hope in Allah’s mercy.',
      historicalNotes: '',
      imageDescriptions: {
        'wadi-as-salam': 'View of Wadi al-Salam Cemetery in Najaf.',
      },
    },
    ar: {
      name: 'مقبرة وادي السلام',
      shortDescription: 'تُعدّ مقبرة وادي السلام من أشهر المقابر في العالم الإسلامي.',
      longDescription:
        'تُعدّ مقبرة وادي السلام من أشهر المقابر في العالم الإسلامي. وهي تذكّر بالآخرة وفناء الدنيا والرجاء برحمة الله تعالى.',
      historicalNotes: '',
      imageDescriptions: {
        'wadi-as-salam': 'منظر لمقبرة وادي السلام في النجف.',
      },
    },
  },
  'place-masjid-kufa': {
    en: {
      name: 'Masjid al-Kufa',
      shortDescription: 'Masjid al-Kufa is one of the most important mosques in Islam.',
      longDescription:
        'Masjid al-Kufa is one of the most important mosques in Islam. It is closely connected to Imam Ali (a.) and is a place of prayer, Ziyārah, and remembrance.',
      historicalNotes: '',
      imageDescriptions: {
        'kufa-grand-mosque': 'Exterior view of the Great Mosque of Kufa.',
      },
    },
    ar: {
      name: 'مسجد الكوفة',
      shortDescription: 'يُعدّ مسجد الكوفة من أهم مساجد الإسلام، ويرتبط ارتباطًا وثيقًا بالإمام علي (ع).',
      longDescription:
        'يُعدّ مسجد الكوفة من أهم مساجد الإسلام، ويرتبط ارتباطًا وثيقًا بالإمام علي (ع). وهو مكان للصلاة والزيارة والذكر.',
      historicalNotes: '',
      imageDescriptions: {
        'kufa-grand-mosque': 'منظر خارجي لمسجد الكوفة الكبير.',
      },
    },
  },
  'place-masjid-sahlah': {
    en: {
      name: 'Masjid al-Sahlah',
      shortDescription: 'Masjid al-Sahlah is an important mosque near Kufa.',
      longDescription:
        'Masjid al-Sahlah is an important mosque near Kufa. It is connected to many narrations and is regarded as a special place for prayer, Duʿāʾ, and spiritual reflection.',
      historicalNotes: '',
      imageDescriptions: {
        'masjid-al-sahlah': 'Exterior view of Masjid al-Sahlah in Kufa.',
      },
    },
    ar: {
      name: 'مسجد السهلة',
      shortDescription: 'مسجد السهلة من المساجد المهمة قرب الكوفة، وقد وردت في فضله روايات عديدة.',
      longDescription:
        'مسجد السهلة من المساجد المهمة قرب الكوفة، وقد وردت في فضله روايات عديدة. وهو مكان مميز للصلاة والدعاء والتأمل الروحي.',
      historicalNotes: '',
      imageDescriptions: {
        'masjid-al-sahlah': 'منظر خارجي لمسجد السهلة في الكوفة.',
      },
    },
  },
  'place-muslim-ibn-aqil': {
    en: {
      name: 'Shrine of Muslim ibn Aqil',
      shortDescription: 'The shrine of Muslim ibn Aqil recalls the envoy of Imam Hussain (a.) to Kufa.',
      longDescription:
        'The shrine of Muslim ibn Aqil recalls the envoy of Imam Hussain (a.) to Kufa. His life represents loyalty, courage, and holding firmly to the truth.',
      historicalNotes: '',
      imageDescriptions: {
        'muslim-shrine-in-kufa': 'View of the Shrine of Muslim ibn Aqil in Kufa.',
      },
    },
    ar: {
      name: 'ضريح مسلم بن عقيل',
      shortDescription: 'يذكّر مرقد مسلم بن عقيل بسفير الإمام الحسين (ع) إلى الكوفة.',
      longDescription:
        'يذكّر مرقد مسلم بن عقيل بسفير الإمام الحسين (ع) إلى الكوفة. وتمثّل سيرته الوفاء والشجاعة والثبات على الحق.',
      historicalNotes: '',
      imageDescriptions: {
        'muslim-shrine-in-kufa': 'منظر لضريح مسلم بن عقيل في الكوفة.',
      },
    },
  },
  'place-hani-ibn-urwah': {
    en: {
      name: 'Shrine of Hani ibn Urwah',
      shortDescription: 'The shrine of Hani ibn Urwah recalls a loyal supporter of Muslim ibn Aqil.',
      longDescription:
        'The shrine of Hani ibn Urwah recalls a loyal supporter of Muslim ibn Aqil. He represents steadfastness, hospitality, and loyalty to the truth.',
      historicalNotes: '',
    },
    ar: {
      name: 'ضريح هاني بن عروة',
      shortDescription: 'يذكّر مرقد هاني بن عروة بأحد أنصار مسلم بن عقيل الأوفياء.',
      longDescription:
        'يذكّر مرقد هاني بن عروة بأحد أنصار مسلم بن عقيل الأوفياء. وتمثّل شخصيته الثبات والكرم والوفاء للحق.',
      historicalNotes: '',
    },
  },
  'place-maytham': {
    en: {
      name: 'Shrine of Maytham al-Tammar',
      shortDescription: 'The shrine of Maytham al-Tammar recalls a loyal companion of Imam Ali (a.).',
      longDescription:
        'The shrine of Maytham al-Tammar recalls a loyal companion of Imam Ali (a.). His story represents knowledge, love for the Ahlulbayt (a.), and steadfastness in faith.',
      historicalNotes: '',
      imageDescriptions: {
        'maytham-tammar-shrine': 'Exterior view of the Shrine of Maytham al-Tammar in Kufa.',
      },
    },
    ar: {
      name: 'ضريح ميثم التمار',
      shortDescription: 'يذكّر مرقد ميثم التمار بأحد أصحاب الإمام علي (ع) الأوفياء.',
      longDescription:
        'يذكّر مرقد ميثم التمار بأحد أصحاب الإمام علي (ع) الأوفياء. وتمثّل قصته العلم ومحبة أهل البيت (ع) والثبات على الإيمان.',
      historicalNotes: '',
      imageDescriptions: {
        'maytham-tammar-shrine': 'منظر خارجي لضريح ميثم التمار في الكوفة.',
      },
    },
  },
  'place-kadhimayn': {
    en: {
      name: 'Shrine of Imam Musa al-Kadhim and Imam Muhammad al-Jawad',
      shortDescription:
        'The shrine of Imam Musa al-Kadhim (a.) and Imam Muhammad al-Jawad (a.) is the heart of Kadhimayn.',
      longDescription:
        'The shrine of Imam Musa al-Kadhim (a.) and Imam Muhammad al-Jawad (a.) is the heart of Kadhimayn. It connects visitors with patience, trust in Allah, knowledge, and love for the Ahlulbayt (a.).',
      historicalNotes: '',
      imageDescriptions: {
        'kadhimayn-shrine': 'Exterior view of the Kadhimayn Shrine in Baghdad.',
      },
    },
    ar: {
      name: 'ضريح الإمامين موسى الكاظم ومحمد الجواد',
      shortDescription:
        'يُعدّ مرقد الإمام موسى الكاظم (ع) والإمام محمد الجواد (ع) قلب الكاظمية.',
      longDescription:
        'يُعدّ مرقد الإمام موسى الكاظم (ع) والإمام محمد الجواد (ع) قلب الكاظمية. وهو يربط الزائر بمعاني الصبر والتوكل على الله والعلم ومحبة أهل البيت (ع).',
      historicalNotes: '',
      imageDescriptions: {
        'kadhimayn-shrine': 'منظر خارجي لضريح الكاظمين في بغداد.',
      },
    },
  },
  'place-askari': {
    en: {
      name: 'Shrine of Imam Ali al-Hadi and Imam Hasan al-Askari',
      shortDescription:
        'The shrine of Imam Ali al-Hadi (a.) and Imam Hasan al-Askari (a.) is one of the most important Ziyārah places in Iraq.',
      longDescription:
        'The shrine of Imam Ali al-Hadi (a.) and Imam Hasan al-Askari (a.) is one of the most important Ziyārah places in Iraq. It reminds visitors of guidance, patience, and connection to the Imams of the Ahlulbayt (a.).',
      historicalNotes: '',
      imageDescriptions: {
        'imam-hadi-imam-askari': 'Exterior view of the Askariyyayn Shrine in Samarra.',
      },
    },
    ar: {
      name: 'ضريح الإمامين علي الهادي والحسن العسكري',
      shortDescription:
        'يُعدّ مرقد الإمام علي الهادي (ع) والإمام الحسن العسكري (ع) من أهم أماكن الزيارة في العراق.',
      longDescription:
        'يُعدّ مرقد الإمام علي الهادي (ع) والإمام الحسن العسكري (ع) من أهم أماكن الزيارة في العراق. وهو يذكّر بالهداية والصبر والارتباط بأئمة أهل البيت (ع).',
      historicalNotes: '',
      imageDescriptions: {
        'imam-hadi-imam-askari': 'منظر خارجي لضريح العسكريين في سامراء.',
      },
    },
  },
  'place-sardab': {
    en: {
      name: 'Sardab al-Ghaybah',
      shortDescription:
        'Sardab al-Ghaybah is a special place in Samarra connected to the remembrance of Imam al-Mahdi (a.).',
      longDescription:
        'Sardab al-Ghaybah is a special place in Samarra connected to the remembrance of Imam al-Mahdi (a.). It represents hope, expectation, and trust in Allah’s promise.',
      historicalNotes: '',
    },
    ar: {
      name: 'سرداب الغيبة',
      shortDescription:
        'السرداب المعروف بسرداب الغيبة مكان خاص في سامراء يرتبط بذكر الإمام المهدي (ع).',
      longDescription:
        'السرداب المعروف بسرداب الغيبة مكان خاص في سامراء يرتبط بذكر الإمام المهدي (ع). وهو يرمز إلى الأمل والانتظار والثقة بوعد الله تعالى.',
      historicalNotes: '',
    },
  },
};

const twoRakatPrayerTranslation: Partial<Record<Language, RecommendedActTranslation>> = {
  en: {
    title: 'Pray a two-rakʿah prayer',
    shortInstruction:
      'Pray two rakʿahs at this shrine as a recommended act, with humility and attention.',
  },
  ar: {
    title: 'صلاة ركعتين',
    shortInstruction: 'صلِّ ركعتين عند هذا المرقد كعمل مستحب مع الخشوع والتوجه.',
  },
};

const recommendedActTranslations: Record<
  string,
  Partial<Record<Language, RecommendedActTranslation>>
> = {
  'act-ziyarat-ashura-imam-hussain': {
    en: {
      title: 'Read Ziyarat Ashura',
      shortInstruction:
        'Read Ziyarat Ashura for Imam Hussain (a.) in the segmented reader view.',
    },
    ar: {
      title: 'قراءة زيارة عاشوراء',
      shortInstruction: 'اقرأ زيارة عاشوراء للإمام الحسين (ع) في العرض المقسم.',
    },
  },
  'act-two-rakat-imam-hussain': twoRakatPrayerTranslation,
  'act-ziyarat-arbaeen-imam-hussain': {
    en: {
      title: 'Review Ziyarat Arbaeen on 20 Safar',
      shortInstruction: 'duas.org assigns Ziyarat Arbaeen to 20 Safar.',
    },
    ar: {
      title: 'مراجعة زيارة الأربعين في 20 صفر',
      shortInstruction: 'ينسب موقع duas.org زيارة الأربعين إلى يوم 20 صفر.',
    },
  },
  'act-ziyarah-imam-ali': {
    en: {
      title: 'Review Ziyarat Ameenallah via duas.org',
      shortInstruction:
        'Source: duas.org. Add the full text offline only after rights and content review.',
    },
    ar: {
      title: 'مراجعة زيارة أمين الله عبر duas.org',
      shortInstruction:
        'المصدر: duas.org. يضاف النص الكامل دون اتصال فقط بعد مراجعة الحقوق والمحتوى.',
    },
  },
  'act-two-rakat-imam-ali': twoRakatPrayerTranslation,
  'act-two-rakat-abul-fadhl-abbas': twoRakatPrayerTranslation,
  'act-two-rakat-hur': twoRakatPrayerTranslation,
  'act-two-rakat-muslim-ibn-aqil': twoRakatPrayerTranslation,
  'act-two-rakat-hani-ibn-urwah': twoRakatPrayerTranslation,
  'act-two-rakat-maytham': twoRakatPrayerTranslation,
  'act-two-rakat-kadhimayn': twoRakatPrayerTranslation,
  'act-two-rakat-askari': twoRakatPrayerTranslation,
};

const placeholderTranslations: Record<Language, string> = {
  ar: 'سيضاف النص الكامل بعد مراجعة الحقوق والمحتوى. انظر المصدر أدناه.',
  de: 'Volltext wird nach Rechte- und Inhaltsprüfung ergänzt. Quelle siehe unten.',
  en: 'Full text will be added after rights and content review. See the source below.',
};

const religiousContentTranslations: Record<
  string,
  Partial<Record<Language, ReligiousContentTranslation>>
> = {
  'ziyarat-ashura': {
    en: {
      language: 'Arabic',
      notes:
        'Ziyarat Ashura for Imam Hussain (a.). The reviewed text is stored in paragraphs with Arabic, transliteration, and the available German translation.',
      title: 'Ziyarat Ashura',
    },
    ar: {
      language: 'العربية',
      notes:
        'زيارة عاشوراء للإمام الحسين (ع). حُفظ النص المُراجع في فقرات تضم العربية والنقل الصوتي والترجمة الألمانية المتاحة.',
      title: 'زيارة عاشوراء',
    },
  },
  'ziyarah-imam-hussain-placeholder': {
    en: {
      paragraphs: [
        {
          arabic: placeholderTranslations.en,
          transliteration: placeholderTranslations.en,
          translation_de: placeholderTranslations.en,
        },
      ],
      language: 'Arabic',
      notes:
        'Source-bound entry based on duas.org. The full text is not copied into the app until rights and content review are complete.',
      title: 'Ziyarah Nahiya for Imam Hussain',
    },
    ar: {
      paragraphs: [
        {
          arabic: placeholderTranslations.ar,
          transliteration: placeholderTranslations.ar,
          translation_de: placeholderTranslations.ar,
        },
      ],
      language: 'العربية',
      notes:
        'إدخال مرتبط بالمصدر اعتمادا على duas.org. لا ينسخ النص الكامل إلى التطبيق حتى تكتمل مراجعة الحقوق والمحتوى.',
      title: 'زيارة الناحية للإمام الحسين',
    },
  },
  'ziyarah-imam-ali-placeholder': {
    en: {
      paragraphs: [
        {
          arabic: placeholderTranslations.en,
          transliteration: placeholderTranslations.en,
          translation_de: placeholderTranslations.en,
        },
      ],
      language: 'Arabic',
      notes:
        'Source-bound entry based on duas.org. The full text is not copied into the app until rights and content review are complete.',
      title: 'Ziyarat Ameenallah for Imam Ali',
    },
    ar: {
      paragraphs: [
        {
          arabic: placeholderTranslations.ar,
          transliteration: placeholderTranslations.ar,
          translation_de: placeholderTranslations.ar,
        },
      ],
      language: 'العربية',
      notes:
        'إدخال مرتبط بالمصدر اعتمادا على duas.org. لا ينسخ النص الكامل إلى التطبيق حتى تكتمل مراجعة الحقوق والمحتوى.',
      title: 'زيارة أمين الله للإمام علي',
    },
  },
  'ziyarat-arbaeen-placeholder': {
    en: {
      paragraphs: [
        {
          arabic: placeholderTranslations.en,
          transliteration: placeholderTranslations.en,
          translation_de: placeholderTranslations.en,
        },
      ],
      language: 'English',
      notes:
        'duas.org assigns this Ziyarah to 20 Safar. The full text will be added offline only after rights and content review.',
      title: 'Ziyarat Arbaeen',
    },
    ar: {
      paragraphs: [
        {
          arabic: placeholderTranslations.ar,
          transliteration: placeholderTranslations.ar,
          translation_de: placeholderTranslations.ar,
        },
      ],
      language: 'العربية',
      notes:
        'ينسب موقع duas.org هذه الزيارة إلى يوم 20 صفر. سيضاف النص الكامل دون اتصال فقط بعد مراجعة الحقوق والمحتوى.',
      title: 'زيارة الأربعين',
    },
  },
  'dua-safwan-placeholder': {
    en: {
      paragraphs: [
        {
          arabic: placeholderTranslations.en,
          transliteration: placeholderTranslations.en,
          translation_de: placeholderTranslations.en,
        },
      ],
      language: 'English',
      notes:
        'duas.org describes this dua as recited after Ziyarat Ashura and known as Dua Safwan. Full text follows after rights and content review.',
      title: 'Dua Safwan / Alqama after Ziyarat Ashura',
    },
    ar: {
      paragraphs: [
        {
          arabic: placeholderTranslations.ar,
          transliteration: placeholderTranslations.ar,
          translation_de: placeholderTranslations.ar,
        },
      ],
      language: 'العربية',
      notes:
        'يصف موقع duas.org هذا الدعاء بأنه يقرأ بعد زيارة عاشوراء ويعرف بدعاء صفوان. يتبع النص الكامل بعد مراجعة الحقوق والمحتوى.',
      title: 'دعاء صفوان / علقمة بعد زيارة عاشوراء',
    },
  },
};

const sourceReferenceTranslations: Record<
  string,
  Partial<Record<Language, SourceReferenceTranslation>>
> = {
  'duas-ziyarat-nahiya': {
    en: {
      language: 'Arabic / English',
      notes:
        'duas.org describes this Ziyarah as a salutation for Imam Hussain and refers in the introduction to al-Mazar al-Kabir and Bihar al-Anwar.',
    },
    ar: {
      language: 'العربية / الإنجليزية',
      notes:
        'يصف موقع duas.org هذه الزيارة بأنها سلام على الإمام الحسين ويشير في المقدمة إلى المزار الكبير وبحار الأنوار.',
    },
  },
  'duas-ziyarat-arbaeen': {
    en: {
      language: 'Arabic / English',
      notes:
        'duas.org assigns Ziyarat Arbaeen to 20 Safar and mentions transmission notes about Shaykh al-Tusi on the page.',
    },
    ar: {
      language: 'العربية / الإنجليزية',
      notes:
        'ينسب موقع duas.org زيارة الأربعين إلى 20 صفر ويذكر في الصفحة إشارات نقل عن الشيخ الطوسي.',
    },
  },
  'duas-ziyarat-ashura': {
    en: {
      language: 'Arabic / English',
      notes:
        'duas.org presents Ziyarat Ashura as a Ziyarat for Imam Hussain on Ashura and for daily recitation.',
    },
    ar: {
      language: 'العربية / الإنجليزية',
      notes:
        'يعرض موقع duas.org زيارة عاشوراء كزيارة للإمام الحسين في يوم عاشوراء وللقراءة اليومية.',
    },
  },
  'duas-dua-alqama-safwan': {
    en: {
      language: 'Arabic / English',
      notes:
        'duas.org explains that this dua is recited after Ziyarat Ashura and is also known as Dua Safwan.',
    },
    ar: {
      language: 'العربية / الإنجليزية',
      notes:
        'يوضح موقع duas.org أن هذا الدعاء يقرأ بعد زيارة عاشوراء ويعرف أيضا بدعاء صفوان.',
    },
  },
  'duas-ziyarat-ameenallah': {
    en: {
      language: 'Arabic / English',
      notes:
        'duas.org provides a dedicated page for Ziyarat Ameenallah. The entry remains marked as needs review until specialist review is complete.',
    },
    ar: {
      language: 'العربية / الإنجليزية',
      notes:
        'يوفر موقع duas.org صفحة خاصة بزيارة أمين الله. يبقى الإدخال بعلامة الحاجة إلى المراجعة حتى تكتمل المراجعة المتخصصة.',
    },
  },
  'editorial-review-required': {
    en: {
      notes:
        'Internal note: Content without a reviewed primary source or rights review must not be shown as verified.',
      title: 'Editorial review required',
    },
    ar: {
      notes:
        'ملاحظة داخلية: لا يجوز عرض المحتوى بلا مصدر أولي مراجع أو مراجعة حقوق على أنه موثق.',
      title: 'المراجعة التحريرية مطلوبة',
    },
  },
};

const cityTranslations: Record<string, Partial<Record<Language, string>>> = {
  Bagdad: { en: 'Baghdad', ar: 'بغداد' },
  Kadhimayn: { en: 'Kadhimayn', ar: 'الكاظمية' },
  Karbala: { en: 'Karbala', ar: 'كربلاء' },
  Kufa: { en: 'Kufa', ar: 'الكوفة' },
  Najaf: { en: 'Najaf', ar: 'النجف' },
  Samarra: { en: 'Samarra', ar: 'سامراء' },
};

export function localizeCityName(city: string, language: Language) {
  return cityTranslations[city]?.[language] ?? city;
}

export function localizeCountryName(country: Place['country'], language: Language) {
  if (language === 'ar') {
    return 'العراق';
  }

  return country;
}

export function formatPlaceLocation(place: Place, language: Language, includeCountry = true) {
  const location = localizeCityName(place.city, language);

  return includeCountry ? `${location}, ${localizeCountryName(place.country, language)}` : location;
}

export function localizePlace(place: Place, language: Language): Place {
  if (language === 'de') {
    return place;
  }

  const patch = placeTranslations[place.id]?.[language];
  const generic = genericPlaceCopy[language];

  return {
    ...place,
    ...generic,
    ...patch,
    images: place.images.map((image) => ({
      ...image,
      description: patch?.imageDescriptions?.[image.id] ?? image.description,
    })),
  };
}

export function localizePlaces(places: Place[], language: Language) {
  return places.map((place) => localizePlace(place, language));
}

export function localizeRecommendedAct(act: RecommendedAct, language: Language): RecommendedAct {
  return {
    ...act,
    ...recommendedActTranslations[act.id]?.[language],
  };
}

export function localizeRecommendedActs(acts: RecommendedAct[], language: Language) {
  return acts.map((act) => localizeRecommendedAct(act, language));
}

export function localizeReligiousContent(
  content: ReligiousContent,
  language: Language,
): ReligiousContent {
  return {
    ...content,
    ...religiousContentTranslations[content.id]?.[language],
  };
}

export function localizeReligiousContentList(
  content: ReligiousContent[],
  language: Language,
) {
  return content.map((item) => localizeReligiousContent(item, language));
}

export function localizeSourceReference(
  source: SourceReference,
  language: Language,
): SourceReference {
  return {
    ...source,
    ...sourceReferenceTranslations[source.id]?.[language],
  };
}

export function localizeSourceReferences(sources: SourceReference[], language: Language) {
  return sources.map((source) => localizeSourceReference(source, language));
}
