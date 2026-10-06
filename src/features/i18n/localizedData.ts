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
  'place-tall-al-zaynabiyya': {
    en: {
      name: 'Tall al-Zaynabiyya',
      shortDescription: 'Tall al-Zaynabiyya is a Ziyārah site near the Shrine of Imam Hussain (a.) in Karbala.',
      longDescription:
        'Tall al-Zaynabiyya lies west of the Shrine of Imam Hussain (a.), near Bab al-Zaynabiyya. In Shia memory, this elevated site is associated with Sayyida Zaynab (a.), who is said to have observed the events of Karbala from here. Today, the maqam especially recalls her steadfastness and patience.',
    },
    ar: {
      name: 'التل الزينبي',
      shortDescription: 'التل الزينبي موقع للزيارة قرب مرقد الإمام الحسين (ع) في كربلاء.',
      longDescription:
        'يقع التل الزينبي غرب مرقد الإمام الحسين (ع) قرب باب الزينبية. ويرتبط هذا الموضع المرتفع في الذاكرة الشيعية بالسيدة زينب (ع)، إذ يروى أنها كانت تشاهد منه أحداث كربلاء. ويذكّر المقام اليوم بثباتها وصبرها على وجه الخصوص.',
    },
  },
  'place-kaff-al-abbas': {
    en: {
      name: 'Maqams of Kaf al-Abbas',
      shortDescription: 'The Kaf al-Abbas maqams are near the Shrine of Abul-Fadhl al-Abbas (a.) in Karbala.',
      longDescription:
        'The two Kaf al-Abbas maqams stand in the old city near the Shrine of Abul-Fadhl al-Abbas (a.). In local Ziyārah tradition, they mark the places where Abul-Fadhl al-Abbas (a.) is said to have lost his right and left hands during the Battle of Karbala. Their precise present-day identification is based on later commemorative tradition.',
    },
    ar: {
      name: 'مقاما كفي العباس',
      shortDescription: 'يقع مقاما كفي العباس قرب مرقد أبي الفضل العباس (ع) في كربلاء.',
      longDescription:
        'يقع مقاما كفي العباس في المدينة القديمة قرب مرقد أبي الفضل العباس (ع). وفي تقاليد الزيارة المحلية يحددان الموضعين اللذين يروى أن أبا الفضل العباس (ع) فقد فيهما يده اليمنى واليسرى في واقعة كربلاء. ويستند التحديد الدقيق للموقعين اليوم إلى تقاليد تذكارية متأخرة.',
    },
  },
  'place-maqam-ali-al-akbar': {
    en: {
      name: 'Maqam Ali al-Akbar',
      shortDescription: 'Maqam Ali al-Akbar is a Ziyārah site in Karbala.',
      longDescription:
        'Maqam Ali al-Akbar in the old city of Karbala commemorates Ali al-Akbar, the son of Imam Hussain (a.). According to local tradition, it marks the area where Ali al-Akbar fell during the Battle of Karbala. It is a memorial site rather than his grave, which is located within the Imam Hussain Shrine complex.',
    },
    ar: {
      name: 'مقام علي الأكبر',
      shortDescription: 'مقام علي الأكبر موقع للزيارة في كربلاء.',
      longDescription:
        'يخلّد مقام علي الأكبر في مدينة كربلاء القديمة ذكرى علي الأكبر ابن الإمام الحسين (ع). ووفقًا للتقاليد المحلية، يحدد المقام الموضع الذي سقط فيه علي الأكبر خلال واقعة كربلاء. وهو موضع تذكاري وليس قبره، إذ يقع قبره داخل مجمع مرقد الإمام الحسين (ع).',
    },
  },
  'place-maqam-abdullah-al-radi': {
    en: {
      name: "Maqam Abdullah al-Radi'",
      shortDescription: "Maqam Abdullah al-Radi' is a Ziyārah site near the Shrine of Imam Hussain (a.) in Karbala.",
      longDescription:
        "The small Maqam Abdullah al-Radi' is in the Bab al-Taq quarter near the Shrine of Imam Hussain (a.). It commemorates the infant son of Imam Hussain (a.), referred to in Karbala tradition as Abdullah al-Radi' or Ali al-Asghar. The name varies between sources.",
    },
    ar: {
      name: 'مقام عبد الله الرضيع',
      shortDescription: 'مقام عبد الله الرضيع موقع للزيارة قرب مرقد الإمام الحسين (ع) في كربلاء.',
      longDescription:
        'يقع مقام عبد الله الرضيع الصغير في محلة باب الطاق قرب مرقد الإمام الحسين (ع). ويحيي ذكرى طفل الإمام الحسين (ع) الذي يرد في تراث كربلاء باسم عبد الله الرضيع أو علي الأصغر. وتختلف التسمية باختلاف المصادر.',
    },
  },
  'place-maqam-imam-al-mahdi-karbala': {
    en: {
      name: 'Maqam Imam al-Mahdi',
      shortDescription: 'Maqam Imam al-Mahdi is a Ziyārah site in Karbala.',
      longDescription:
        'Maqam Imam al-Mahdi is located at the northern entrance to Karbala on the bank of the Husseiniya River. The present building is a place of devotion and remembrance associated with Imam al-Mahdi (a.) in local Ziyārah tradition. Its precise historical origin has not been conclusively established.',
    },
    ar: {
      name: 'مقام الإمام المهدي',
      shortDescription: 'مقام الإمام المهدي موقع للزيارة في كربلاء.',
      longDescription:
        'يقع مقام الإمام المهدي عند المدخل الشمالي لكربلاء على ضفة نهر الحسينية. والبناء الحالي موضع للعبادة والذكر يرتبط بالإمام المهدي (ع) في تقاليد الزيارة المحلية. ولم يُحسم أصل المقام التاريخي بدقة.',
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
      name: 'Kufa Mosque with Maqam Muslim and Imam Ali’s Mihrab',
      shortDescription:
        'This entry includes the Kufa Mosque, the Maqam of Muslim ibn Aqil, and the Mihrab of Imam Ali (a.).',
      longDescription:
        'The Great Mosque of Kufa is a historic place of prayer and Ziyārah in Kufa. Imam Ali’s (a.) mihrab is located inside the mosque, while the Shrine of Muslim ibn Aqil is directly adjacent. This entry presents the closely connected areas as one destination.',
      historicalNotes: '',
      imageDescriptions: {
        'kufa-grand-mosque': 'Exterior view of the Great Mosque of Kufa.',
      },
    },
    ar: {
      name: 'مسجد الكوفة مع مقام مسلم ومحراب الإمام علي',
      shortDescription:
        'يشمل هذا الإدخال مسجد الكوفة ومقام مسلم بن عقيل ومحراب الإمام علي (ع).',
      longDescription:
        'مسجد الكوفة المعظم موضع تاريخي للصلاة والزيارة في الكوفة. يقع محراب الإمام علي (ع) داخل المسجد، ويقع مرقد مسلم بن عقيل بمحاذاته مباشرة. ويجمع هذا الإدخال هذه المواضع المترابطة في وجهة واحدة.',
      historicalNotes: '',
      imageDescriptions: {
        'kufa-grand-mosque': 'منظر خارجي لمسجد الكوفة الكبير.',
      },
    },
  },
  'place-house-imam-ali': {
    en: {
      name: 'House of Imam Ali in Kufa',
      shortDescription: 'The destination known as the House of Imam Ali (a.) is located in Kufa.',
      longDescription:
        'The building known as the House of Imam Ali (a.) is a short walk southwest of the Kufa Mosque. Local tradition presents the simple courtyard house as Imam Ali’s residence during his time in Kufa and as a reminder of the simplicity of his life. The historical identification of the present building has not been conclusively established.',
    },
    ar: {
      name: 'بيت الإمام علي في الكوفة',
      shortDescription: 'يقع الموقع المعروف ببيت الإمام علي (ع) في الكوفة.',
      longDescription:
        'يقع البناء المعروف ببيت الإمام علي (ع) على مسافة قصيرة سيرًا إلى الجنوب الغربي من مسجد الكوفة. وتعرضه التقاليد المحلية بوصفه دار إقامة الإمام علي (ع) في الكوفة، ويذكّر بنمط حياته البسيط. ولم تثبت بصورة قاطعة النسبة التاريخية للبناء القائم اليوم.',
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
  'place-kumayl-ibn-ziyad': {
    en: {
      name: 'Shrine of Kumayl ibn Ziyad',
      shortDescription: 'The Shrine of Kumayl ibn Ziyad is a destination in the Najaf and Kufa area.',
      longDescription:
        'The Shrine of Kumayl ibn Ziyad is in al-Thawiya between Najaf and Kufa, near the road linking the two cities. In Shia tradition, Kumayl is regarded as a close companion of Imam Ali (a.); the shrine recalls his loyalty and steadfastness.',
    },
    ar: {
      name: 'مرقد كميل بن زياد',
      shortDescription: 'مرقد كميل بن زياد وجهة في منطقة النجف والكوفة.',
      longDescription:
        'يقع مرقد كميل بن زياد في الثوية بين النجف والكوفة قرب الطريق الواصل بين المدينتين. ويُعد كميل في التراث الشيعي من خواص أصحاب الإمام علي (ع)، ويذكّر المرقد بولائه وثباته.',
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
  'place-sayyid-muhammad': {
    en: {
      name: 'Shrine of Sayyid Muhammad',
      shortDescription: 'The Shrine of Sayyid Muhammad is located in Balad.',
      longDescription:
        'The Shrine of Sayyid Muhammad is in Balad, south of Samarra. Sayyid Muhammad was a son of Imam Ali al-Hadi (a.) and a brother of Imam Hasan al-Askari (a.); according to the transmitted biography, he died near Balad and was buried there. The site is also known as Sabʿ al-Dujayl.',
    },
    ar: {
      name: 'مرقد السيد محمد',
      shortDescription: 'يقع مرقد السيد محمد في بلد.',
      longDescription:
        'يقع مرقد السيد محمد في بلد جنوب سامراء. وكان السيد محمد ابن الإمام علي الهادي (ع) وأخا الإمام الحسن العسكري (ع)، وتذكر سيرته المروية أنه توفي قرب بلد ودفن فيها. ويعرف الموضع أيضًا باسم سبع الدجيل.',
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
  'karbala-center-tall-zaynabiyya': {
    en: {
      language: 'Arabic',
      notes:
        'The page describes the location and present form of Tall al-Zaynabiyya and its transmitted association with Sayyida Zaynab (a.).',
      title: 'Karbala Center: Maqam Tall al-Zaynabiyya',
    },
    ar: {
      language: 'العربية',
      notes:
        'تصف الصفحة موقع التل الزينبي وشكله الحالي وارتباطه المروي بالسيدة زينب (ع).',
      title: 'مركز كربلاء: مقام التل الزينبي',
    },
  },
  'karbala-center-kaff-al-abbas': {
    en: {
      language: 'Arabic',
      notes:
        'The page describes the Kaf al-Abbas maqams, their location near the Abbas Shrine, and their place in local commemorative tradition.',
      title: 'Karbala Center: Maqam Kaf al-Abbas',
    },
    ar: {
      language: 'العربية',
      notes:
        'تصف الصفحة مقامي كفي العباس وموقعهما قرب مرقد العباس ومكانتهما في التقاليد التذكارية المحلية.',
      title: 'مركز كربلاء: مقام كف العباس',
    },
  },
  'imam-hussain-maqam-ali-al-akbar': {
    en: {
      language: 'Arabic',
      notes:
        'The publication explains the maqam as the transmitted location where Ali al-Akbar fell and distinguishes it from his grave inside the Imam Hussain Shrine.',
      title: 'Al-Ahrar: Maqam Ali al-Akbar',
    },
    ar: {
      language: 'العربية',
      notes:
        'توضح المطبوعة أن المقام هو الموضع المروي لسقوط علي الأكبر، وتميزه عن قبره داخل مرقد الإمام الحسين (ع).',
      title: 'الأحرار: مقام علي الأكبر',
    },
  },
  'karbala-guide-abdullah-al-radi': {
    en: {
      language: 'Arabic',
      notes:
        "The page describes the small maqam's location in Bab al-Taq and its association with the infant son of Imam Hussain (a.).",
      title: "Arbaeen Network: Maqam Abdullah al-Radi'",
    },
    ar: {
      language: 'العربية',
      notes:
        'تصف الصفحة موقع المقام الصغير في باب الطاق وارتباطه بطفل الإمام الحسين (ع).',
      title: 'شبكة زيارة الأربعين: مقام عبد الله الرضيع',
    },
  },
  'islamicpedia-maqam-imam-mahdi': {
    en: {
      language: 'English',
      notes:
        'The entry documents the location and local identification of the maqam while noting that its historical review remains open.',
      title: 'Islamicpedia: Maqam Imam al-Mahdi in Karbala',
    },
    ar: {
      language: 'الإنجليزية',
      notes:
        'يوثق الإدخال موقع المقام ونسبته المحلية، مع الإشارة إلى أن مراجعته التاريخية ما تزال مفتوحة.',
      title: 'الموسوعة الإسلامية: مقام الإمام المهدي في كربلاء',
    },
  },
  'imam-hussain-house-imam-ali': {
    en: {
      language: 'Arabic',
      notes:
        'The publication describes the location and form of the house transmitted as Imam Ali’s (a.) residence near the Kufa Mosque.',
      title: 'Imam Hussain Shrine: The House of Imam Ali in Kufa',
    },
    ar: {
      language: 'العربية',
      notes:
        'تصف المطبوعة موقع وشكل الدار المروية بوصفها مسكن الإمام علي (ع) قرب مسجد الكوفة.',
      title: 'العتبة الحسينية المقدسة: بيت الإمام علي في الكوفة',
    },
  },
  'kufa-mosque-sites': {
    en: {
      language: 'Arabic',
      notes:
        'The official page describes, among other sites, Imam Ali’s (a.) mihrab inside the mosque and the entrance to the adjoining Shrine of Muslim ibn Aqil.',
      title: 'Kufa Mosque: historic and religious sites in the mosque complex',
    },
    ar: {
      language: 'العربية',
      notes:
        'تصف الصفحة الرسمية، من بين مواضع أخرى، محراب الإمام علي (ع) داخل المسجد والمدخل إلى مرقد مسلم بن عقيل المجاور.',
      title: 'مسجد الكوفة: المواقع التاريخية والدينية في مجمع المسجد',
    },
  },
  'iraq-tourism-kumayl': {
    en: {
      language: 'Arabic',
      notes:
        'The official publication locates the shrine in al-Thawiya between Najaf and Kufa and describes Kumayl as a companion of Imam Ali (a.).',
      title: 'Iraqi Tourism Authority: Shrine of Kumayl ibn Ziyad',
    },
    ar: {
      language: 'العربية',
      notes:
        'تحدد المطبوعة الرسمية موقع المرقد في الثوية بين النجف والكوفة، وتصف كميلًا بأنه من أصحاب الإمام علي (ع).',
      title: 'هيئة السياحة العراقية: مرقد كميل بن زياد',
    },
  },
  'imam-hussain-sayyid-muhammad': {
    en: {
      language: 'Arabic',
      notes:
        'The page describes Sayyid Muhammad’s lineage, his death near Balad, and his burial there.',
      title: 'Imam Hussain Shrine: Sayyid Muhammad ibn Imam al-Hadi',
    },
    ar: {
      language: 'العربية',
      notes: 'تصف الصفحة نسب السيد محمد ووفاته قرب بلد ودفنه فيها.',
      title: 'العتبة الحسينية المقدسة: السيد محمد بن الإمام الهادي',
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
  Balad: { en: 'Balad', ar: 'بلد' },
  Kadhimayn: { de: 'Kadhimiya', en: 'Kadhimiya', ar: 'الكاظمية' },
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
